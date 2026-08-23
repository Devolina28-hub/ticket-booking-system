const express = require('express');
const { query, withTransaction } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { releaseExpiredHoldsNow } = require('../services/holdSweeper');

const router = express.Router({ mergeParams: true });

const HOLD_TTL_MIN = Number(process.env.SEAT_HOLD_TTL_MINUTES || 10);

/**
 * POST /api/events/:eventId/seats/hold
 * Body: { seat_ids: [1,2,3] }
 *
 * Concurrency protection: each seat is claimed with
 *   UPDATE event_seats SET status='held', held_by=$1, hold_expires_at=$2
 *   WHERE id=$3 AND event_id=$4 AND status='available'
 * Postgres serializes concurrent UPDATEs targeting the same row: if two
 * requests race for the same seat, the second UPDATE blocks until the first
 * transaction commits or rolls back, then re-evaluates its WHERE clause
 * against the now-committed row -- so it correctly finds status is no longer
 * 'available' and affects 0 rows. The whole batch runs in one transaction so
 * a customer either holds ALL requested seats or NONE.
 */
router.post('/hold', requireAuth, requireRole('customer'), async (req, res) => {
  try {
    await releaseExpiredHoldsNow();
    const eventId = Number(req.params.eventId);
    const { seat_ids } = req.body;
    if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
      return res.status(400).json({ error: 'seat_ids[] is required' });
    }

    const expiresAt = new Date(Date.now() + HOLD_TTL_MIN * 60 * 1000).toISOString();

    const heldSeatIds = await withTransaction(async (trx) => {
      const held = [];
      for (const seatId of seat_ids) {
        const rows = await trx.query(
          `UPDATE event_seats SET status = 'held', held_by = $1, hold_expires_at = $2
           WHERE id = $3 AND event_id = $4 AND status = 'available'
           RETURNING id`,
          [req.user.id, expiresAt, seatId, eventId]
        );
        if (rows.length === 0) {
          const seat = await trx.queryOne('SELECT * FROM event_seats WHERE id = $1', [seatId]);
          const reason = !seat ? 'Seat does not exist' : `Seat ${seat.row_label}${seat.seat_number} is ${seat.status}`;
          throw new Error(reason);
        }
        held.push(seatId);
      }
      return held;
    });

    const seats = await query(
      `SELECT * FROM event_seats WHERE id = ANY($1::int[])`,
      [heldSeatIds]
    );
    res.json({ held: seats, hold_expires_at: expiresAt, ttl_minutes: HOLD_TTL_MIN });
  } catch (err) {
    // transaction auto-rolled-back by withTransaction on thrown error
    res.status(409).json({ error: `Could not hold seats: ${err.message}` });
  }
});

// Customer explicitly releases their own held seats (e.g. changed mind / left checkout)
router.post('/release', requireAuth, requireRole('customer'), async (req, res) => {
  try {
    const eventId = Number(req.params.eventId);
    const { seat_ids } = req.body;
    if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
      return res.status(400).json({ error: 'seat_ids[] is required' });
    }
    const released = await withTransaction(async (trx) => {
      let count = 0;
      for (const seatId of seat_ids) {
        const rows = await trx.query(
          `UPDATE event_seats SET status = 'available', held_by = NULL, hold_expires_at = NULL
           WHERE id = $1 AND event_id = $2 AND status = 'held' AND held_by = $3
           RETURNING id`,
          [seatId, eventId, req.user.id]
        );
        count += rows.length;
      }
      return count;
    });
    res.json({ released });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real-time-ish seat map poll: current status of every seat for the event.
router.get('/', async (req, res) => {
  try {
    await releaseExpiredHoldsNow();
    const eventId = Number(req.params.eventId);
    const seats = await query(
      `SELECT id, row_label, seat_number, category, status, hold_expires_at
       FROM event_seats WHERE event_id = $1 ORDER BY row_label, seat_number`,
      [eventId]
    );
    res.json({ seats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
