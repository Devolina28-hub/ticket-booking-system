const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { generateBookingRef, generateQrDataUrl } = require('../services/qr');
const { sendBookingConfirmation } = require('../services/email');
const { releaseExpiredHoldsNow } = require('../services/holdSweeper');

const router = express.Router();

// Customer joins the waitlist for a sold-out category on an event.
router.post('/', requireAuth, requireRole('customer'), (req, res) => {
  const { event_id, category } = req.body;
  if (!event_id || !category) return res.status(400).json({ error: 'event_id and category are required' });

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const existing = db
    .prepare(
      `SELECT * FROM waitlist WHERE event_id = ? AND category = ? AND customer_id = ? AND status IN ('waiting','offered')`
    )
    .get(event_id, category, req.user.id);
  if (existing) return res.status(409).json({ error: 'Already on the waitlist for this category', entry: existing });

  const info = db
    .prepare('INSERT INTO waitlist (event_id, category, customer_id, status) VALUES (?, ?, ?, \'waiting\')')
    .run(event_id, category, req.user.id);

  const position = db
    .prepare(
      `SELECT COUNT(*) as pos FROM waitlist
       WHERE event_id = ? AND category = ? AND status = 'waiting' AND joined_at <= (SELECT joined_at FROM waitlist WHERE id = ?)`
    )
    .get(event_id, category, info.lastInsertRowid).pos;

  res.status(201).json({ id: info.lastInsertRowid, position });
});

// Customer's waitlist entries
router.get('/my', requireAuth, requireRole('customer'), (req, res) => {
  releaseExpiredHoldsNow();
  const entries = db
    .prepare(
      `SELECT w.*, e.title, e.event_date, e.event_time FROM waitlist w
       JOIN events e ON e.id = w.event_id WHERE w.customer_id = ? ORDER BY w.joined_at DESC`
    )
    .all(req.user.id);
  res.json({ entries });
});

/**
 * POST /api/waitlist/:id/complete
 * Completes a time-limited waitlist offer -> converts it straight into a
 * confirmed booking. Only valid while status='offered' and the offer has
 * not expired (the sweeper would otherwise have already cascaded it away).
 */
router.post('/:id/complete', requireAuth, requireRole('customer'), async (req, res) => {
  releaseExpiredHoldsNow();
  const entry = db.prepare('SELECT * FROM waitlist WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Waitlist entry not found' });
  if (entry.customer_id !== req.user.id) return res.status(403).json({ error: 'Not your waitlist entry' });
  if (entry.status !== 'offered') return res.status(409).json({ error: `Offer is ${entry.status}, not available` });

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(entry.event_id);
  const bookingRef = generateBookingRef();
  let bookingId;

  try {
    const trx = db.transaction(() => {
      const seat = db
        .prepare(`SELECT * FROM event_seats WHERE id = ? AND status = 'offered' AND held_by = ?`)
        .get(entry.offered_seat_id, req.user.id);
      if (!seat) throw new Error('Offer expired or seat no longer reserved for you');

      const pricing = db
        .prepare('SELECT price FROM event_pricing WHERE event_id = ? AND category = ?')
        .get(entry.event_id, seat.category);
      const total = pricing ? pricing.price : 0;

      const bookingInfo = db
        .prepare(`INSERT INTO bookings (booking_ref, event_id, customer_id, status, total_amount) VALUES (?, ?, ?, 'confirmed', ?)`)
        .run(bookingRef, entry.event_id, req.user.id, total);
      bookingId = bookingInfo.lastInsertRowid;

      db.prepare('INSERT INTO booking_seats (booking_id, event_seat_id) VALUES (?, ?)').run(bookingId, seat.id);

      const seatUpdate = db
        .prepare(
          `UPDATE event_seats SET status = 'booked', held_by = NULL, hold_expires_at = NULL, booking_id = ?
           WHERE id = ? AND status = 'offered' AND held_by = ?`
        )
        .run(bookingId, seat.id, req.user.id);
      if (seatUpdate.changes === 0) throw new Error('Offer expired while completing booking');

      db.prepare(`UPDATE waitlist SET status = 'booked' WHERE id = ?`).run(entry.id);

      return { seat, total };
    });

    const { seat, total } = trx();
    const customer = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const qrDataUrl = await generateQrDataUrl({ bookingRef, eventId: entry.event_id, customerId: req.user.id });
    db.prepare('UPDATE bookings SET qr_data_url = ? WHERE id = ?').run(qrDataUrl, bookingId);

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
