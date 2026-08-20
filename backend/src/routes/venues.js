const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

// List venues (public - organisers need this to create events)
router.get('/', (req, res) => {
  const venues = db.prepare('SELECT * FROM venues ORDER BY id DESC').all();
  res.json({ venues });
});

router.get('/:id', (req, res) => {
  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(req.params.id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });
  const seats = db
    .prepare('SELECT * FROM venue_seats WHERE venue_id = ? ORDER BY row_label, seat_number')
    .all(venue.id);
  res.json({ venue, seats });
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
router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const { name, address, layout } = req.body;
  if (!name || !Array.isArray(layout) || layout.length === 0) {
    return res.status(400).json({ error: 'name and non-empty layout[] are required' });
  }

  const trx = db.transaction(() => {
    const venueInfo = db
      .prepare('INSERT INTO venues (name, address, created_by) VALUES (?, ?, ?)')
      .run(name, address || null, req.user.id);
    const venueId = venueInfo.lastInsertRowid;

    const insertSeat = db.prepare(
      'INSERT INTO venue_seats (venue_id, row_label, seat_number, category) VALUES (?, ?, ?, ?)'
    );
    for (const rowDef of layout) {
      const { row_label, seats, category } = rowDef;
      if (!row_label || !seats || !category) {
        throw new Error('Each layout row needs row_label, seats (count), category');
      }
      for (let n = 1; n <= seats; n++) {
        insertSeat.run(venueId, row_label, n, category);
      }
    }
    return venueId;
  });

  try {
    const venueId = trx();
    const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId);
    const seats = db.prepare('SELECT * FROM venue_seats WHERE venue_id = ?').all(venueId);
    res.status(201).json({ venue, seats });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
