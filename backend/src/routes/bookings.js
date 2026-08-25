const express = require('express');
const { query, queryOne, withTransaction } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { generateBookingRef, generateQrDataUrl } = require('../services/qr');
const { sendBookingConfirmation, sendCancellationRefund } = require('../services/email');
const { offerSeatToNextInLine } = require('../services/waitlistService');
const { releaseExpiredHoldsNow } = require('../services/holdSweeper');

const router = express.Router();
const MAX_SEATS_PER_BOOKING = Number(process.env.MAX_SEATS_PER_BOOKING || 5);

/**
 * GET /api/bookings/verify/:bookingRef
 * PUBLIC (no auth) — this is what the QR code links to. A venue staff member
 * (or the customer themselves) scans the ticket and lands on a page backed
 * by this endpoint, showing live status: valid & confirmed, cancelled, or
 * not found. Deliberately returns only what's needed to check someone in
 * (no email/payment info) since anyone with the QR image can hit this.
 */
router.get('/verify/:bookingRef', async (req, res) => {
  try {
    const booking = await queryOne(
      `SELECT b.id, b.booking_ref, b.status, b.total_amount, b.created_at,
              e.title, e.event_date, e.event_time, v.name as venue_name, u.name as customer_name
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       JOIN venues v ON v.id = e.venue_id
       JOIN users u ON u.id = b.customer_id
       WHERE b.booking_ref = $1`,
      [req.params.bookingRef]
    );

    if (!booking) return res.status(404).json({ found: false, error: 'Ticket not found' });

    const seats = await query(
      `SELECT es.row_label, es.seat_number, es.category FROM booking_seats bs
       JOIN event_seats es ON es.id = bs.event_seat_id WHERE bs.booking_id = $1`,
      [booking.id]
    );

    res.json({ found: true, valid: booking.status === 'confirmed', booking, seats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
  try {
    await releaseExpiredHoldsNow();
    const { event_id, seat_ids } = req.body;
    if (!event_id || !Array.isArray(seat_ids) || seat_ids.length === 0) {
      return res.status(400).json({ error: 'event_id and seat_ids[] are required' });
    }
    if (seat_ids.length > MAX_SEATS_PER_BOOKING) {
      return res.status(400).json({ error: `You can book at most ${MAX_SEATS_PER_BOOKING} seats per booking.` });
    }

    const event = await queryOne('SELECT * FROM events WHERE id = $1', [event_id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const bookingRef = generateBookingRef();

    const { bookingId, seats, total } = await withTransaction(async (trx) => {
      const heldSeats = [];
      for (const seatId of seat_ids) {
        const seat = await trx.queryOne(
          `SELECT * FROM event_seats WHERE id = $1 AND event_id = $2 AND status = 'held' AND held_by = $3`,
          [seatId, event_id, req.user.id]
        );
        if (!seat) throw new Error(`Seat ${seatId} is not currently held by you (hold may have expired)`);
        heldSeats.push(seat);
      }

      let total = 0;
      for (const seat of heldSeats) {
        const pricing = await trx.queryOne(
          'SELECT price FROM event_pricing WHERE event_id = $1 AND category = $2',
          [event_id, seat.category]
        );
        total += pricing ? Number(pricing.price) : 0;
      }

      const bookingRow = await trx.queryOne(
        `INSERT INTO bookings (booking_ref, event_id, customer_id, status, total_amount)
         VALUES ($1, $2, $3, 'confirmed', $4) RETURNING id`,
        [bookingRef, event_id, req.user.id, total]
      );

      for (const seat of heldSeats) {
        const updated = await trx.query(
          `UPDATE event_seats SET status = 'booked', held_by = NULL, hold_expires_at = NULL, booking_id = $1
           WHERE id = $2 AND status = 'held' AND held_by = $3
           RETURNING id`,
          [bookingRow.id, seat.id, req.user.id]
        );
        if (updated.length === 0) throw new Error(`Seat ${seat.id} could not be finalized (hold lost)`);
        await trx.query('INSERT INTO booking_seats (booking_id, event_seat_id) VALUES ($1, $2)', [bookingRow.id, seat.id]);
      }

      return { bookingId: bookingRow.id, seats: heldSeats, total };
    });

    const customer = await queryOne('SELECT * FROM users WHERE id = $1', [req.user.id]);

    const qrDataUrl = await generateQrDataUrl(bookingRef);
    await query('UPDATE bookings SET qr_data_url = $1 WHERE id = $2', [qrDataUrl, bookingId]);

    console.log(`[bookings] booking ${bookingRef} confirmed -- attempting confirmation email to ${customer.email}`);
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
router.get('/my', requireAuth, requireRole('customer'), async (req, res) => {
  try {
    const bookings = await query(
      `SELECT b.*, e.title, e.event_date, e.event_time, v.name as venue_name
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       JOIN venues v ON v.id = e.venue_id
       WHERE b.customer_id = $1 ORDER BY b.created_at DESC`,
      [req.user.id]
    );

    const withSeats = await Promise.all(
      bookings.map(async (b) => {
        const seats = await query(
          `SELECT es.row_label, es.seat_number, es.category FROM booking_seats bs
           JOIN event_seats es ON es.id = bs.event_seat_id WHERE bs.booking_id = $1`,
          [b.id]
        );
        return { ...b, seats };
      })
    );

    res.json({ bookings: withSeats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Cancel a booking. Frees the seats and, for each freed seat, triggers the
 * waitlist auto-assignment cascade so the very next customer in line for
 * that category gets a time-limited offer.
 */
router.post('/:id/cancel', requireAuth, requireRole('customer', 'admin'), async (req, res) => {
  try {
    const booking = await queryOne('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (req.user.role !== 'admin' && booking.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your booking' });
    }
    if (booking.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });

    const freedSeats = await withTransaction(async (trx) => {
      await trx.query(`UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [booking.id]);
      const seats = await trx.query(
        `SELECT es.* FROM booking_seats bs JOIN event_seats es ON es.id = bs.event_seat_id WHERE bs.booking_id = $1`,
        [booking.id]
      );
      for (const seat of seats) {
        await trx.query(
          `UPDATE event_seats SET status = 'available', held_by = NULL, hold_expires_at = NULL, booking_id = NULL WHERE id = $1`,
          [seat.id]
        );
      }
      return seats;
    });

    for (const seat of freedSeats) {
      await offerSeatToNextInLine(booking.event_id, seat.category, seat.id);
    }

    // Only reached after the cancellation transaction above has already
    // committed successfully -- never send a "refund successful" email
    // speculatively or before this point. This is a mock payment system (no
    // real payment gateway, see payments.js), so "refund processed" here
    // means the booking's total_amount, which the customer's mock payment
    // covered, is being returned -- there's no separate gateway call that
    // could fail after this; if it were wired to a real processor, the
    // email send below would need to move after that call's own success check.
    const customer = await queryOne('SELECT * FROM users WHERE id = $1', [booking.customer_id]);
    const event = await queryOne('SELECT * FROM events WHERE id = $1', [booking.event_id]);
    if (customer) {
      sendCancellationRefund({
        to: customer.email,
        customerName: customer.name,
        event,
        bookingRef: booking.booking_ref,
        refundAmount: booking.total_amount,
      }).catch((err) => console.error('[bookings] refund email failed:', err.message));
    }

    res.json({ cancelled: true, freedSeats: freedSeats.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
