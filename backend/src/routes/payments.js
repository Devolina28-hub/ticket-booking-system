const express = require('express');
const { query, queryOne, withTransaction } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const {
  generateBookingRef,
  generateQrDataUrl,
  generatePaymentRef,
  generatePaymentQrDataUrl,
} = require('../services/qr');
const { sendBookingConfirmation } = require('../services/email');
const { releaseExpiredHoldsNow } = require('../services/holdSweeper');

const router = express.Router();

// How long the QR code (and the seat holds behind it) stay valid for.
const PAYMENT_TTL_MIN = Number(process.env.PAYMENT_QR_TTL_MINUTES || 10);

// Releases a session's seats back to 'available' -- used both when a scan
// is declined and when a session times out unscanned.
async function releaseSessionSeats(session) {
  await query(
    `UPDATE event_seats SET status = 'available', held_by = NULL, hold_expires_at = NULL
     WHERE id = ANY($1::int[]) AND status = 'held' AND held_by = $2`,
    [session.seat_ids, session.customer_id]
  );
}

async function expireSession(session) {
  await query(`UPDATE payment_sessions SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [session.id]);
  await releaseSessionSeats(session);
}

/**
 * POST /api/payments/initiate
 * Body: { event_id, seat_ids }
 *
 * Called when the customer clicks "Continue to payment". Starts a mock
 * scan-to-pay session: generates a payment reference + QR code pointing at
 * the public /pay/:paymentRef page, and re-extends the customer's existing
 * seat holds so they comfortably outlast the payment window instead of
 * lapsing mid-checkout.
 */
router.post('/initiate', requireAuth, requireRole('customer'), async (req, res) => {
  try {
    await releaseExpiredHoldsNow();
    const { event_id, seat_ids } = req.body;
    if (!event_id || !Array.isArray(seat_ids) || seat_ids.length === 0) {
      return res.status(400).json({ error: 'event_id and seat_ids[] are required' });
    }

    const event = await queryOne('SELECT * FROM events WHERE id = $1', [event_id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const expiresAt = new Date(Date.now() + PAYMENT_TTL_MIN * 60 * 1000).toISOString();

    const { amount, heldSeatIds } = await withTransaction(async (trx) => {
      let amount = 0;
      const ids = [];
      for (const seatId of seat_ids) {
        const seat = await trx.queryOne(
          `SELECT * FROM event_seats WHERE id = $1 AND event_id = $2 AND status = 'held' AND held_by = $3`,
          [seatId, event_id, req.user.id]
        );
        if (!seat) throw new Error(`Seat ${seatId} is not currently held by you (hold may have expired)`);
        const pricing = await trx.queryOne(
          'SELECT price FROM event_pricing WHERE event_id = $1 AND category = $2',
          [event_id, seat.category]
        );
        amount += pricing ? Number(pricing.price) : 0;
        ids.push(seat.id);
        // Extend this seat's hold so it lasts exactly as long as the QR does.
        await trx.query(`UPDATE event_seats SET hold_expires_at = $1 WHERE id = $2`, [expiresAt, seat.id]);
      }
      return { amount, heldSeatIds: ids };
    });

    const paymentRef = generatePaymentRef();
    const qrDataUrl = await generatePaymentQrDataUrl(paymentRef);

    await query(
      `INSERT INTO payment_sessions (payment_ref, event_id, customer_id, seat_ids, amount, status, qr_data_url, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)`,
      [paymentRef, event_id, req.user.id, heldSeatIds, amount, qrDataUrl, expiresAt]
    );

    res.status(201).json({ payment_ref: paymentRef, qr_data_url: qrDataUrl, amount, expires_at: expiresAt });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

/**
 * GET /api/payments/:paymentRef/status
 * PUBLIC -- polled by both the checkout tab (waiting on the QR screen) and
 * the /pay/:paymentRef page itself (the "scanning" device) to know current
 * status. Lazily flips a stale 'pending' session to 'expired' if the TTL
 * has passed since anyone last checked.
 */
router.get('/:paymentRef/status', async (req, res) => {
  try {
    const session = await queryOne(
      `SELECT ps.*, e.title, e.event_date, e.event_time, v.name as venue_name
       FROM payment_sessions ps
       JOIN events e ON e.id = ps.event_id
       JOIN venues v ON v.id = e.venue_id
       WHERE ps.payment_ref = $1`,
      [req.params.paymentRef]
    );
    if (!session) return res.status(404).json({ error: 'Payment session not found' });

    if (session.status === 'pending' && new Date(session.expires_at) < new Date()) {
      await expireSession(session);
      session.status = 'expired';
    }

    let booking = null;
    if (session.status === 'approved' && session.booking_id) {
      booking = await queryOne(
        `SELECT id, booking_ref, total_amount, status, qr_data_url FROM bookings WHERE id = $1`,
        [session.booking_id]
      );
    }

    res.json({
      status: session.status,
      expires_at: session.expires_at,
      amount: session.amount,
      seat_count: session.seat_ids.length,
      event: {
        title: session.title,
        venue_name: session.venue_name,
        event_date: session.event_date,
        event_time: session.event_time,
      },
      booking,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/payments/:paymentRef/decision
 * PUBLIC -- this is the endpoint the /pay/:paymentRef page hits when the
 * person who scanned the QR taps Yes or No. { approve: true } finalizes the
 * held seats into a real confirmed booking (same logic as
 * POST /api/bookings/confirm); { approve: false } declines the payment and
 * releases the seats immediately, without ever creating a booking.
 */
router.post('/:paymentRef/decision', async (req, res) => {
  try {
    const session = await queryOne('SELECT * FROM payment_sessions WHERE payment_ref = $1', [req.params.paymentRef]);
    if (!session) return res.status(404).json({ error: 'Payment session not found' });

    if (session.status !== 'pending') {
      return res.status(409).json({ error: `This payment was already ${session.status}`, status: session.status });
    }
    if (new Date(session.expires_at) < new Date()) {
      await expireSession(session);
      return res.status(409).json({ error: 'Payment window expired', status: 'expired' });
    }

    if (!req.body.approve) {
      await query(`UPDATE payment_sessions SET status = 'declined', decided_at = NOW() WHERE id = $1`, [session.id]);
      await releaseSessionSeats(session);
      return res.json({ status: 'declined' });
    }

    // approve = true -> finalize into a confirmed booking.
    const event = await queryOne('SELECT * FROM events WHERE id = $1', [session.event_id]);
    const bookingRef = generateBookingRef();

    const { bookingId, seats, total } = await withTransaction(async (trx) => {
      const heldSeats = [];
      for (const seatId of session.seat_ids) {
        const seat = await trx.queryOne(
          `SELECT * FROM event_seats WHERE id = $1 AND event_id = $2 AND status = 'held' AND held_by = $3`,
          [seatId, session.event_id, session.customer_id]
        );
        if (!seat) throw new Error(`Seat ${seatId} is no longer held (hold may have expired)`);
        heldSeats.push(seat);
      }

      let total = 0;
      for (const seat of heldSeats) {
        const pricing = await trx.queryOne(
          'SELECT price FROM event_pricing WHERE event_id = $1 AND category = $2',
          [session.event_id, seat.category]
        );
        total += pricing ? Number(pricing.price) : 0;
      }

      const bookingRow = await trx.queryOne(
        `INSERT INTO bookings (booking_ref, event_id, customer_id, status, total_amount)
         VALUES ($1, $2, $3, 'confirmed', $4) RETURNING id`,
        [bookingRef, session.event_id, session.customer_id, total]
      );

      for (const seat of heldSeats) {
        const updated = await trx.query(
          `UPDATE event_seats SET status = 'booked', held_by = NULL, hold_expires_at = NULL, booking_id = $1
           WHERE id = $2 AND status = 'held' AND held_by = $3
           RETURNING id`,
          [bookingRow.id, seat.id, session.customer_id]
        );
        if (updated.length === 0) throw new Error(`Seat ${seat.id} could not be finalized (hold lost)`);
        await trx.query('INSERT INTO booking_seats (booking_id, event_seat_id) VALUES ($1, $2)', [bookingRow.id, seat.id]);
      }

      return { bookingId: bookingRow.id, seats: heldSeats, total };
    });

    const customer = await queryOne('SELECT * FROM users WHERE id = $1', [session.customer_id]);
    const qrDataUrl = await generateQrDataUrl(bookingRef);
    await query('UPDATE bookings SET qr_data_url = $1 WHERE id = $2', [qrDataUrl, bookingId]);
    await query(
      `UPDATE payment_sessions SET status = 'approved', decided_at = NOW(), booking_id = $1 WHERE id = $2`,
      [bookingId, session.id]
    );

    console.log(`[payments] ${session.payment_ref} approved -- booking ${bookingRef} confirmed, emailing ${customer.email}`);
    sendBookingConfirmation({
      to: customer.email,
      customerName: customer.name,
      event,
      seats,
      bookingRef,
      qrDataUrl,
      totalAmount: total,
    }).catch((err) => console.error('[payments] confirmation email failed:', err.message));

    res.json({
      status: 'approved',
      booking: { id: bookingId, booking_ref: bookingRef, total_amount: total, status: 'confirmed', qr_data_url: qrDataUrl },
    });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

module.exports = router;
