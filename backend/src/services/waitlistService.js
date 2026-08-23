const { withTransaction } = require('../db');
const { sendWaitlistOffer } = require('./email');

const OFFER_TTL_MIN = Number(process.env.WAITLIST_OFFER_TTL_MINUTES || 15);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Called whenever a seat becomes available again for an event+category
 * (booking cancellation, or an offer/hold expiring). Atomically:
 *   1. Picks the next FIFO 'waiting' entry for that event+category.
 *   2. Flips the seat to 'offered' and reserves it for that customer with a TTL.
 *   3. Marks the waitlist row 'offered'.
 * All inside a single Postgres transaction so a seat is never handed to two
 * people and a waitlist entry is never double-offered.
 * Returns the offer detail (or null if nobody is waiting).
 */
async function offerSeatToNextInLine(eventId, category, seatId) {
  const result = await withTransaction(async (trx) => {
    const nextInLine = await trx.queryOne(
      `SELECT * FROM waitlist
       WHERE event_id = $1 AND category = $2 AND status = 'waiting'
       ORDER BY joined_at ASC LIMIT 1`,
      [eventId, category]
    );

    if (!nextInLine) return null;

    const expiresAt = new Date(Date.now() + OFFER_TTL_MIN * 60 * 1000).toISOString();

    // Conditional update: only succeeds if seat is currently 'available'.
    const seatUpdate = await trx.query(
      `UPDATE event_seats SET status = 'offered', held_by = $1, hold_expires_at = $2
       WHERE id = $3 AND status = 'available'
       RETURNING id`,
      [nextInLine.customer_id, expiresAt, seatId]
    );

    if (seatUpdate.length === 0) return null; // seat was not actually free; abort

    await trx.query(
      `UPDATE waitlist SET status = 'offered', offered_seat_id = $1, offer_expires_at = $2
       WHERE id = $3`,
      [seatId, expiresAt, nextInLine.id]
    );

    const seat = await trx.queryOne('SELECT * FROM event_seats WHERE id = $1', [seatId]);
    const customer = await trx.queryOne('SELECT * FROM users WHERE id = $1', [nextInLine.customer_id]);
    const event = await trx.queryOne('SELECT * FROM events WHERE id = $1', [eventId]);

    return { waitlistEntry: nextInLine, seat, customer, event, expiresAt };
  });

  if (result) {
    const offerUrl = `${FRONTEND_URL}/waitlist-offer/${result.waitlistEntry.id}`;
    sendWaitlistOffer({
      to: result.customer.email,
      customerName: result.customer.name,
      event: result.event,
      seat: result.seat,
      offerUrl,
      expiresAt: result.expiresAt,
    }).catch((err) => console.error('[waitlist] failed to send offer email:', err.message));
  }

  return result;
}

/**
 * Releases a seat that a waitlisted customer failed to book in time (or
 * whose hold otherwise expired) and immediately tries to offer it to the
 * next person in the queue. Called by the hold sweeper.
 */
async function expireOfferAndCascade(waitlistEntryId) {
  const entry = await withTransaction(async (trx) => {
    const entry = await trx.queryOne('SELECT * FROM waitlist WHERE id = $1', [waitlistEntryId]);
    if (!entry || entry.status !== 'offered') return null;

    await trx.query(`UPDATE waitlist SET status = 'expired' WHERE id = $1`, [entry.id]);
    await trx.query(
      `UPDATE event_seats SET status = 'available', held_by = NULL, hold_expires_at = NULL
       WHERE id = $1 AND status = 'offered'`,
      [entry.offered_seat_id]
    );

    return entry;
  });

  if (entry) {
    await offerSeatToNextInLine(entry.event_id, entry.category, entry.offered_seat_id);
  }
}

module.exports = { offerSeatToNextInLine, expireOfferAndCascade };
