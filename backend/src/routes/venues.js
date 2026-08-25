const express = require('express');
const { query, queryOne, withTransaction } = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

// List venues (public - organisers need this to create events)
router.get('/', async (req, res) => {
  try {
    const venues = await query('SELECT * FROM venues ORDER BY id DESC');
    res.json({ venues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const venue = await queryOne('SELECT * FROM venues WHERE id = $1', [req.params.id]);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    const seats = await query(
      'SELECT * FROM venue_seats WHERE venue_id = $1 ORDER BY row_label, seat_number',
      [venue.id]
    );
    res.json({ venue, seats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Admin creates a venue + its seat layout in one call.
 * Body: {
 *   name, address,
 *   layout: [ { row_label: 'A', seats: 10, category: 'Premium' }, ... ]
 * }
 * This generates individual seat rows (A1..A10 etc.) so every seat has an
 * explicit category, which is what per-category pricing and the waitlist
 * queue key off of later.
 */
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, address, layout } = req.body;
  if (!name || !Array.isArray(layout) || layout.length === 0) {
    return res.status(400).json({ error: 'name and non-empty layout[] are required' });
  }

  try {
    const venueId = await withTransaction(async (trx) => {
      const venue = await trx.queryOne(
        'INSERT INTO venues (name, address, created_by) VALUES ($1, $2, $3) RETURNING id',
        [name, address || null, req.user.id]
      );

      for (const rowDef of layout) {
        const { row_label, seats, category } = rowDef;
        if (!row_label || !seats || !category) {
          throw new Error('Each layout row needs row_label, seats (count), category');
        }
        for (let n = 1; n <= seats; n++) {
          await trx.query(
            'INSERT INTO venue_seats (venue_id, row_label, seat_number, category) VALUES ($1, $2, $3, $4)',
            [venue.id, row_label, n, category]
          );
        }
      }
      return venue.id;
    });

    const venue = await queryOne('SELECT * FROM venues WHERE id = $1', [venueId]);
    const seats = await query('SELECT * FROM venue_seats WHERE venue_id = $1', [venueId]);
    res.status(201).json({ venue, seats });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/venues/:id
 *
 * Admin-only. Blocked if ANY booking exists for ANY event under this venue
 * (covers both "the venue itself" and "any movie/event under it" from the
 * spec, since every booking in this schema is always tied to an event, and
 * every event is tied to exactly one venue). If clear, cascades: deletes
 * every event under the venue first (each of those cascades its own
 * event_pricing/event_seats/waitlist rows automatically), then the venue
 * itself (cascades venue_seats automatically) -- so nothing is left
 * orphaned. Stale payment_sessions for those events are cleaned up first
 * for the same reason as the event-delete route above: they hold a foreign
 * key to the event but aren't a "booking."
 */
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const venue = await queryOne('SELECT * FROM venues WHERE id = $1', [req.params.id]);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });

    const bookingCount = await queryOne(
      `SELECT COUNT(*)::int as count FROM bookings b
       JOIN events e ON e.id = b.event_id WHERE e.venue_id = $1`,
      [venue.id]
    );
    if (bookingCount.count > 0) {
      return res.status(409).json({
        error: 'This venue cannot be deleted because one or more events/movies associated with this venue have existing bookings.',
      });
    }

    await withTransaction(async (trx) => {
      await trx.query(
        `DELETE FROM payment_sessions WHERE event_id IN (SELECT id FROM events WHERE venue_id = $1)`,
        [venue.id]
      );
      await trx.query('DELETE FROM events WHERE venue_id = $1', [venue.id]);
      await trx.query('DELETE FROM venues WHERE id = $1', [venue.id]);
    });

    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
