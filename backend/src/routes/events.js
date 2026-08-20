const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { releaseExpiredHoldsNow } = require('../services/holdSweeper');

const router = express.Router();

// Browse + filter events (public). Query params: type, date, q (title search)
router.get('/', (req, res) => {
  const { type, date, q } = req.query;
  let sql = `SELECT e.*, v.name as venue_name, v.address as venue_address
             FROM events e JOIN venues v ON v.id = e.venue_id WHERE 1=1`;
  const params = [];
  if (type) {
    sql += ' AND e.type = ?';
    params.push(type);
  }
  if (date) {
    sql += ' AND e.event_date = ?';
    params.push(date);
  }
  if (q) {
    sql += ' AND e.title LIKE ?';
    params.push(`%${q}%`);
  }
  sql += ' ORDER BY e.event_date, e.event_time';
  const events = db.prepare(sql).all(...params);

  // attach pricing + seat availability summary
  const withMeta = events.map((ev) => {
    const pricing = db.prepare('SELECT category, price FROM event_pricing WHERE event_id = ?').all(ev.id);
    const counts = db
      .prepare(
        `SELECT category,
                SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
                COUNT(*) as total
         FROM event_seats WHERE event_id = ? GROUP BY category`
      )
      .all(ev.id);
    return { ...ev, pricing, availability: counts };
  });

  res.json({ events: withMeta });
});

router.get('/:id', (req, res) => {
  releaseExpiredHoldsNow(); // ensure seat map is fresh before client renders it
  const event = db
    .prepare(
      `SELECT e.*, v.name as venue_name, v.address as venue_address
       FROM events e JOIN venues v ON v.id = e.venue_id WHERE e.id = ?`
    )
    .get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const pricing = db.prepare('SELECT category, price FROM event_pricing WHERE event_id = ?').all(event.id);
  const seats = db
    .prepare(
      `SELECT id, row_label, seat_number, category, status, hold_expires_at
       FROM event_seats WHERE event_id = ? ORDER BY row_label, seat_number`
    )
    .all(event.id);

  res.json({ event, pricing, seats });
});

/**
 * Organiser creates an event/show. Body:
 * { title, description, type, venue_id, event_date, event_time,
 *   pricing: [{ category, price }, ...] }
 * This snapshots the venue's seat layout into event_seats (status=available),
 * so each show has its own independent seat map even if the venue is reused.
 */
router.post('/', requireAuth, requireRole('organiser', 'admin'), (req, res) => {
  const { title, description, type, venue_id, event_date, event_time, pricing } = req.body;
  if (!title || !venue_id || !event_date || !event_time || !Array.isArray(pricing)) {
    return res.status(400).json({ error: 'title, venue_id, event_date, event_time, pricing[] are required' });
  }

  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(venue_id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const venueSeats = db.prepare('SELECT * FROM venue_seats WHERE venue_id = ?').all(venue_id);
  if (venueSeats.length === 0) return res.status(400).json({ error: 'Venue has no seat layout' });

  const trx = db.transaction(() => {
    const eventInfo = db
      .prepare(
        `INSERT INTO events (title, description, type, venue_id, organiser_id, event_date, event_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(title, description || null, type || 'event', venue_id, req.user.id, event_date, event_time);
    const eventId = eventInfo.lastInsertRowid;

    const insertPricing = db.prepare('INSERT INTO event_pricing (event_id, category, price) VALUES (?, ?, ?)');
    for (const p of pricing) insertPricing.run(eventId, p.category, p.price);

    const insertSeat = db.prepare(
      `INSERT INTO event_seats (event_id, venue_seat_id, row_label, seat_number, category, status)
       VALUES (?, ?, ?, ?, ?, 'available')`
    );
    for (const vs of venueSeats) insertSeat.run(eventId, vs.id, vs.row_label, vs.seat_number, vs.category);

    return eventId;
  });

  const eventId = trx();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  res.status(201).json({ event });
});

// Organiser: booking summary + revenue for one of their events
router.get('/:id/summary', requireAuth, requireRole('organiser', 'admin'), (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (req.user.role !== 'admin' && event.organiser_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your event' });
  }

  const bookings = db
    .prepare(
      `SELECT b.id, b.booking_ref, b.status, b.total_amount, b.created_at, u.name as customer_name, u.email as customer_email
       FROM bookings b JOIN users u ON u.id = b.customer_id
       WHERE b.event_id = ? ORDER BY b.created_at DESC`
    )
    .all(event.id);

  const revenue = db
    .prepare(`SELECT COALESCE(SUM(total_amount),0) as total FROM bookings WHERE event_id = ? AND status = 'confirmed'`)
    .get(event.id).total;

  const seatCounts = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM event_seats WHERE event_id = ? GROUP BY status`
    )
    .all(event.id);

  res.json({ event, bookings, revenue, seatCounts });
});

module.exports = router;
