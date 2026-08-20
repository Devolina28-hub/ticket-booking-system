const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { releaseExpiredHoldsNow } = require('../services/holdSweeper');

const router = express.Router({ mergeParams: true });

const HOLD_TTL_MIN = Number(process.env.SEAT_HOLD_TTL_MINUTES || 10);

/**
 * POST /api/events/:eventId/seats/hold
 * Body: { seat_ids: [1,2,3] }
 *
 * Concurrency protection: each seat is claimed with
 *   UPDATE event_seats SET status='held', held_by=?, hold_expires_at=?
 *   WHERE id=? AND event_id=? AND status='available'
 * This is an atomic conditional update at the SQLite row level -- if two
 * requests race for the same seat, only the first UPDATE (serialized by
 * SQLite's writer lock) will find status='available' and change a row;
 * the second sees changes=0 and fails cleanly. The whole batch runs in one
 * transaction so a customer either holds ALL requested seats or NONE
 * (any single unavailable seat rolls back the entire hold).
 */
router.post('/hold', requireAuth, requireRole('customer'), (req, res) => {
  releaseExpiredHoldsNow();
  const eventId = Number(req.params.eventId);
  const { seat_ids } = req.body;
  if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
    return res.status(400).json({ error: 'seat_ids[] is required' });
  }

  const expiresAt = new Date(Date.now() + HOLD_TTL_MIN * 60 * 1000).toISOString();

  const trx = db.transaction(() => {
    const held = [];
    for (const seatId of seat_ids) {
      const result = db
        .prepare(
          `UPDATE event_seats SET status = 'held', held_by = ?, hold_expires_at = ?
           WHERE id = ? AND event_id = ? AND status = 'available'`
        )
        .run(req.user.id, expiresAt, seatId, eventId);
      if (result.changes === 0) {
        const seat = db.prepare('SELECT * FROM event_seats WHERE id = ?').get(seatId);
        const reason = !seat ? 'Seat does not exist' : `Seat ${seat.row_label}${seat.seat_number} is ${seat.status}`;
        throw new Error(reason);
      }
      held.push(seatId);
    }
    return held;
  });

  try {
    const heldSeatIds = trx();
    const seats = db
      .prepare(`SELECT * FROM event_seats WHERE id IN (${heldSeatIds.map(() => '?').join(',')})`)
      .all(...heldSeatIds);
    res.json({ held: seats, hold_expires_at: expiresAt, ttl_minutes: HOLD_TTL_MIN });
  } catch (err) {
    // transaction auto-rolled-back by better-sqlite3 on thrown error
    res.status(409).json({ error: `Could not hold seats: ${err.message}` });
  }
});

// Customer explicitly releases their own held seats (e.g. changed mind / left checkout)
router.post('/release', requireAuth, requireRole('customer'), (req, res) => {
  const eventId = Number(req.params.eventId);
  const { seat_ids } = req.body;
  if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
    return res.status(400).json({ error: 'seat_ids[] is required' });
  }
  const trx = db.transaction(() => {
    let released = 0;
    for (const seatId of seat_ids) {
      const result = db
        .prepare(
          `UPDATE event_seats SET status = 'available', held_by = NULL, hold_expires_at = NULL
           WHERE id = ? AND event_id = ? AND status = 'held' AND held_by = ?`
        )
        .run(seatId, eventId, req.user.id);
      released += result.changes;
    }
    return released;
  });
  const released = trx();
  res.json({ released });
});

// Real-time-ish seat map poll: current status of every seat for the event.
router.get('/', (req, res) => {
  releaseExpiredHoldsNow();
  const eventId = Number(req.params.eventId);
  const seats = db
    .prepare(
      `SELECT id, row_label, seat_number, category, status, hold_expires_at
       FROM event_seats WHERE event_id = ? ORDER BY row_label, seat_number`
    )
    .all(eventId);
  res.json({ seats });
});

module.exports = router;
