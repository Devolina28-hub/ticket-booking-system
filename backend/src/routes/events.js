const express = require('express');
const { query, queryOne, withTransaction } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { releaseExpiredHoldsNow } = require('../services/holdSweeper');

const router = express.Router();

// Browse + filter events (public). Query params: type, date, q (title search)
router.get('/', async (req, res) => {
  try {
    const { type, date, q } = req.query;
    let sql = `SELECT e.*, v.name as venue_name, v.address as venue_address
               FROM events e JOIN venues v ON v.id = e.venue_id WHERE 1=1`;
    const params = [];
    if (type) {
      params.push(type);
      sql += ` AND e.type = $${params.length}`;
    }
    if (date) {
      params.push(date);
      sql += ` AND e.event_date = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND e.title ILIKE $${params.length}`;
    }
    sql += ' ORDER BY e.event_date, e.event_time';
    const events = await query(sql, params);

    // attach pricing + seat availability summary
    const withMeta = await Promise.all(
      events.map(async (ev) => {
        const pricing = await query('SELECT category, price FROM event_pricing WHERE event_id = $1', [ev.id]);
        const counts = await query(
          `SELECT category,
                  SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END)::int as available,
                  COUNT(*)::int as total
           FROM event_seats WHERE event_id = $1 GROUP BY category`,
          [ev.id]
        );
        return { ...ev, pricing, availability: counts };
      })
    );

    res.json({ events: withMeta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await releaseExpiredHoldsNow(); // ensure seat map is fresh before client renders it
    const event = await queryOne(
      `SELECT e.*, v.name as venue_name, v.address as venue_address
       FROM events e JOIN venues v ON v.id = e.venue_id WHERE e.id = $1`,
      [req.params.id]
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const pricing = await query('SELECT category, price FROM event_pricing WHERE event_id = $1', [event.id]);
    const seats = await query(
      `SELECT id, row_label, seat_number, category, status, hold_expires_at
       FROM event_seats WHERE event_id = $1 ORDER BY row_label, seat_number`,
      [event.id]
    );

    res.json({ event, pricing, seats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Organiser creates an event/show. Body:
 * { title, description, type, venue_id, event_date, event_time,
 *   pricing: [{ category, price }, ...] }
 * This snapshots the venue's seat layout into event_seats (status=available),
 * so each show has its own independent seat map even if the venue is reused.
 */
router.post('/', requireAuth, requireRole('organiser', 'admin'), async (req, res) => {
  try {
    const { title, description, type, venue_id, event_date, event_time, pricing, poster_url } = req.body;
    if (!title || !venue_id || !event_date || !event_time || !Array.isArray(pricing)) {
      return res.status(400).json({ error: 'title, venue_id, event_date, event_time, pricing[] are required' });
    }

    // poster_url is optional and, when present, is a data: URL the frontend
    // read from the organiser's uploaded file (see OrganiserDashboard.jsx) --
    // sanity-check it so we don't store arbitrary junk in the column.
    if (poster_url && typeof poster_url === 'string' && poster_url.length > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'Poster image is too large (max ~6MB)' });
    }

    const venue = await queryOne('SELECT * FROM venues WHERE id = $1', [venue_id]);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });

    const venueSeats = await query('SELECT * FROM venue_seats WHERE venue_id = $1', [venue_id]);
    if (venueSeats.length === 0) return res.status(400).json({ error: 'Venue has no seat layout' });

    const eventId = await withTransaction(async (trx) => {
      const eventRow = await trx.queryOne(
        `INSERT INTO events (title, description, type, venue_id, organiser_id, event_date, event_time, poster_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [title, description || null, type || 'event', venue_id, req.user.id, event_date, event_time, poster_url || null]
      );

      for (const p of pricing) {
        await trx.query('INSERT INTO event_pricing (event_id, category, price) VALUES ($1, $2, $3)', [
          eventRow.id, p.category, p.price,
        ]);
      }

      for (const vs of venueSeats) {
        await trx.query(
          `INSERT INTO event_seats (event_id, venue_seat_id, row_label, seat_number, category, status)
           VALUES ($1, $2, $3, $4, $5, 'available')`,
          [eventRow.id, vs.id, vs.row_label, vs.seat_number, vs.category]
        );
      }

      return eventRow.id;
    });

    const event = await queryOne('SELECT * FROM events WHERE id = $1', [eventId]);
    res.status(201).json({ event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Organiser: booking summary + revenue for one of their events
router.get('/:id/summary', requireAuth, requireRole('organiser', 'admin'), async (req, res) => {
  try {
    const event = await queryOne('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (req.user.role !== 'admin' && event.organiser_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your event' });
    }

    const bookings = await query(
      `SELECT b.id, b.booking_ref, b.status, b.total_amount, b.created_at, u.name as customer_name, u.email as customer_email
       FROM bookings b JOIN users u ON u.id = b.customer_id
       WHERE b.event_id = $1 ORDER BY b.created_at DESC`,
      [event.id]
    );

    const revenueRow = await queryOne(
      `SELECT COALESCE(SUM(total_amount),0) as total FROM bookings WHERE event_id = $1 AND status = 'confirmed'`,
      [event.id]
    );

    const seatCounts = await query(
      `SELECT status, COUNT(*)::int as count FROM event_seats WHERE event_id = $1 GROUP BY status`,
      [event.id]
    );

    res.json({ event, bookings, revenue: Number(revenueRow.total), seatCounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
