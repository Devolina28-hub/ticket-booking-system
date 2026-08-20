const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { generateBookingRef, generateQrDataUrl } = require('../services/qr');
const { sendBookingConfirmation } = require('../services/email');
const { offerSeatToNextInLine } = require('../services/waitlistService');
const { releaseExpiredHoldsNow } = require('../services/holdSweeper');

const router = express.Router();

/**
 * POST /api/bookings/confirm
 * Body: { event_id, seat_ids: [...] }
 *
 * Converts the customer's currently-held seats into a confirmed booking.
 * Guarded so only seats this customer is holding (status='held', held_by=me,
 * not expired) can be converted -- prevents booking someone else's held
 * seats or a seat whose hold already lapsed. Runs in one transaction so the
 * booking row, booking_seats rows, and seat status flips all succeed or all
 * roll back together.
 */
router.post('/confirm', requireAuth, requireRole('customer'), async (req, res) => {
  releaseExpiredHoldsNow();
  const { event_id, seat_ids } = req.body;
  if (!event_id || !Array.isArray(seat_ids) || seat_ids.length === 0) {
    return res.status(400).json({ error: 'event_id and seat_ids[] are required' });
  }

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const bookingRef = generateBookingRef();

  let bookingId;
  try {
    const trx = db.transaction(() => {
      const seats = [];
      let total = 0;
      for (const seatId of seat_ids) {
        const seat = db
          .prepare(
            `SELECT * FROM event_seats WHERE id = ? AND event_id = ? AND status = 'held' AND held_by = ?`
          )
          .get(seatId, event_id, req.user.id);
        if (!seat) throw new Error(`Seat ${seatId} is not currently held by you (hold may have expired)`);
        seats.push(seat);
      }

      for (const seat of seats) {
        const pricing = db
          .prepare('SELECT price FROM event_pricing WHERE event_id = ? AND category = ?')
          .get(event_id, seat.category);
        total += pricing ? pricing.price : 0;
      }

      const bookingInfo = db
        .prepare(
          `INSERT INTO bookings (booking_ref, event_id, customer_id, status, total_amount)
           VALUES (?, ?, ?, 'confirmed', ?)`
        )
        .run(bookingRef, event_id, req.user.id, total);
      bookingId = bookingInfo.lastInsertRowid;

      const insertBookingSeat = db.prepare('INSERT INTO booking_seats (booking_id, event_seat_id) VALUES (?, ?)');
      for (const seat of seats) {
        const result = db
          .prepare(
            `UPDATE event_seats SET status = 'booked', held_by = NULL, hold_expires_at = NULL, booking_id = ?
             WHERE id = ? AND status = 'held' AND held_by = ?`
          )
          .run(bookingId, seat.id, req.user.id);
        if (result.changes === 0) throw new Error(`Seat ${seat.id} could not be finalized (hold lost)`);
        insertBookingSeat.run(bookingId, seat.id);
      }

      return { seats, total };
    });

    const { seats, total } = trx();
    const customer = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    const qrDataUrl = await generateQrDataUrl({ bookingRef, eventId: event_id, customerId: req.user.id });
    db.prepare('UPDATE bookings SET qr_data_url = ? WHERE id = ?').run(qrDataUrl, bookingId);

    sendBookingConfirmation({
      to: customer.email,
      customerName: customer.name,
      event,
      seats,
      bookingRef,
      qrDataUrl,
      totalAmount: total,
    }).catch((err) => console.error('[bookings] confirmation email failed:', err.message));

    res.status(201).json({
      booking: { id: bookingId, booking_ref: bookingRef, total_amount: total, status: 'confirmed', qr_data_url: qrDataUrl },
      seats,
    });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// Customer's own booking history
router.get('/my', requireAuth, requireRole('customer'), (req, res) => {
  const bookings = db
    .prepare(
      `SELECT b.*, e.title, e.event_date, e.event_time, v.name as venue_name
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       JOIN venues v ON v.id = e.venue_id
       WHERE b.customer_id = ? ORDER BY b.created_at DESC`
    )
    .all(req.user.id);

  const withSeats = bookings.map((b) => {
    const seats = db
      .prepare(
        `SELECT es.row_label, es.seat_number, es.category FROM booking_seats bs
         JOIN event_seats es ON es.id = bs.event_seat_id WHERE bs.booking_id = ?`
      )
      .all(b.id);
    return { ...b, seats };
  });

  res.json({ bookings: withSeats });
});

/**
 * Cancel a booking. Frees the seats and, for each freed seat, triggers the
 * waitlist auto-assignment cascade so the very next customer in line for
 * that category gets a time-limited offer.
 */
router.post('/:id/cancel', requireAuth, requireRole('customer', 'admin'), (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (req.user.role !== 'admin' && booking.customer_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your booking' });
  }
  if (booking.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });

  const trx = db.transaction(() => {
    db.prepare(`UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?`).run(booking.id);
    const seats = db
      .prepare(
        `SELECT es.* FROM booking_seats bs JOIN event_seats es ON es.id = bs.event_seat_id WHERE bs.booking_id = ?`
      )
      .all(booking.id);
    for (const seat of seats) {
      db.prepare(
        `UPDATE event_seats SET status = 'available', held_by = NULL, hold_expires_at = NULL, booking_id = NULL WHERE id = ?`
      ).run(seat.id);
    }
    return seats;
  });

  const freedSeats = trx();
  for (const seat of freedSeats) {
    offerSeatToNextInLine(booking.event_id, seat.category, seat.id);
  }

  res.json({ cancelled: true, freedSeats: freedSeats.length });
});

module.exports = router;
