const express = require('express');
const { query, queryOne, withTransaction } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { generateBookingRef, generateQrDataUrl } = require('../services/qr');
const { sendBookingConfirmation } = require('../services/email');
const { releaseExpiredHoldsNow } = require('../services/holdSweeper');

const router = express.Router();

// Customer joins the waitlist for a sold-out category on an event.
router.post('/', requireAuth, requireRole('customer'), async (req, res) => {
  try {
    const { event_id, category } = req.body;
    if (!event_id || !category) return res.status(400).json({ error: 'event_id and category are required' });

    const event = await queryOne('SELECT * FROM events WHERE id = $1', [event_id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const existing = await queryOne(
      `SELECT * FROM waitlist WHERE event_id = $1 AND category = $2 AND customer_id = $3 AND status IN ('waiting','offered')`,
      [event_id, category, req.user.id]
    );
    if (existing) return res.status(409).json({ error: 'Already on the waitlist for this category', entry: existing });

    let inserted;
    try {
      inserted = await queryOne(
        `INSERT INTO waitlist (event_id, category, customer_id, status) VALUES ($1, $2, $3, 'waiting') RETURNING id, joined_at`,
        [event_id, category, req.user.id]
      );
    } catch (err) {
      // Race condition fallback: the partial unique index blocks a duplicate
      // active entry even if two requests slipped past the check above at
      // the same instant.
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Already on the waitlist for this category' });
      }
      throw err;
    }

    const posRow = await queryOne(
      `SELECT COUNT(*)::int as pos FROM waitlist
       WHERE event_id = $1 AND category = $2 AND status = 'waiting' AND joined_at <= $3`,
      [event_id, category, inserted.joined_at]
    );

    res.status(201).json({ id: inserted.id, position: posRow.pos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer's waitlist entries
router.get('/my', requireAuth, requireRole('customer'), async (req, res) => {
  try {
    await releaseExpiredHoldsNow();
    const entries = await query(
      `SELECT w.*, e.title, e.event_date, e.event_time FROM waitlist w
       JOIN events e ON e.id = w.event_id WHERE w.customer_id = $1 ORDER BY w.joined_at DESC`,
      [req.user.id]
    );
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/waitlist/:id/complete
 * Completes a time-limited waitlist offer -> converts it straight into a
 * confirmed booking. Only valid while status='offered' and the offer has
 * not expired (the sweeper would otherwise have already cascaded it away).
 */
router.post('/:id/complete', requireAuth, requireRole('customer'), async (req, res) => {
  try {
    await releaseExpiredHoldsNow();
    const entry = await queryOne('SELECT * FROM waitlist WHERE id = $1', [req.params.id]);
    if (!entry) return res.status(404).json({ error: 'Waitlist entry not found' });
    if (entry.customer_id !== req.user.id) return res.status(403).json({ error: 'Not your waitlist entry' });
    if (entry.status !== 'offered') return res.status(409).json({ error: `Offer is ${entry.status}, not available` });

    const event = await queryOne('SELECT * FROM events WHERE id = $1', [entry.event_id]);
    const bookingRef = generateBookingRef();

    const { bookingId, seat, total } = await withTransaction(async (trx) => {
      const seat = await trx.queryOne(
        `SELECT * FROM event_seats WHERE id = $1 AND status = 'offered' AND held_by = $2`,
        [entry.offered_seat_id, req.user.id]
      );
      if (!seat) throw new Error('Offer expired or seat no longer reserved for you');

      const pricing = await trx.queryOne(
        'SELECT price FROM event_pricing WHERE event_id = $1 AND category = $2',
        [entry.event_id, seat.category]
      );
      const total = pricing ? Number(pricing.price) : 0;

      const bookingRow = await trx.queryOne(
        `INSERT INTO bookings (booking_ref, event_id, customer_id, status, total_amount) VALUES ($1, $2, $3, 'confirmed', $4) RETURNING id`,
        [bookingRef, entry.event_id, req.user.id, total]
      );

      await trx.query('INSERT INTO booking_seats (booking_id, event_seat_id) VALUES ($1, $2)', [bookingRow.id, seat.id]);

      const updated = await trx.query(
        `UPDATE event_seats SET status = 'booked', held_by = NULL, hold_expires_at = NULL, booking_id = $1
         WHERE id = $2 AND status = 'offered' AND held_by = $3
         RETURNING id`,
        [bookingRow.id, seat.id, req.user.id]
      );
      if (updated.length === 0) throw new Error('Offer expired while completing booking');

      await trx.query(`UPDATE waitlist SET status = 'booked' WHERE id = $1`, [entry.id]);

      return { bookingId: bookingRow.id, seat, total };
    });

    const customer = await queryOne('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const qrDataUrl = await generateQrDataUrl(bookingRef);
    await query('UPDATE bookings SET qr_data_url = $1 WHERE id = $2', [qrDataUrl, bookingId]);

    sendBookingConfirmation({
      to: customer.email,
      customerName: customer.name,
      event,
      seats: [seat],
      bookingRef,
      qrDataUrl,
      totalAmount: total,
    }).catch((err) => console.error('[waitlist] confirmation email failed:', err.message));

    res.status(201).json({ booking: { id: bookingId, booking_ref: bookingRef, total_amount: total, qr_data_url: qrDataUrl } });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

module.exports = router;
