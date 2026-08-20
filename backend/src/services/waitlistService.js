const db = require('../db');
const { sendWaitlistOffer } = require('./email');

const OFFER_TTL_MIN = Number(process.env.WAITLIST_OFFER_TTL_MINUTES || 15);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Called whenever a seat becomes available again for an event+category
 * (booking cancellation, or an offer/hold expiring). Atomically:
 *   1. Picks the next FIFO 'waiting' entry for that event+category.
 *   2. Flips the seat to 'offered' and reserves it for that customer with a TTL.
 *   3. Marks the waitlist row 'offered'.
 * All inside a single SQLite transaction so a seat is never handed to two
 * people and a waitlist entry is never double-offered.
 * Returns the offer detail (or null if nobody is waiting).
 */
function offerSeatToNextInLine(eventId, category, seatId) {
  const trx = db.transaction(() => {
    const nextInLine = db
      .prepare(
        `SELECT * FROM waitlist
         WHERE event_id = ? AND category = ? AND status = 'waiting'
         ORDER BY joined_at ASC LIMIT 1`
      )
      .get(eventId, category);

    if (!nextInLine) return null;

    const expiresAt = new Date(Date.now() + OFFER_TTL_MIN * 60 * 1000).toISOString();

    // Conditional update: only succeeds if seat is currently 'available'.
    const seatUpdate = db
      .prepare(
        `UPDATE event_seats SET status = 'offered', held_by = ?, hold_expires_at = ?
         WHERE id = ? AND status = 'available'`
      )
      .run(nextInLine.customer_id, expiresAt, seatId);

    if (seatUpdate.changes === 0) return null; // seat was not actually free; abort

    db.prepare(
      `UPDATE waitlist SET status = 'offered', offered_seat_id = ?, offer_expires_at = ?
       WHERE id = ?`
    ).run(seatId, expiresAt, nextInLine.id);

    const seat = db.prepare('SELECT * FROM event_seats WHERE id = ?').get(seatId);
    const customer = db.prepare('SELECT * FROM users WHERE id = ?').get(nextInLine.customer_id);
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);

    return { waitlistEntry: nextInLine, seat, customer, event, expiresAt };
  });

  const result = trx();

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
function expireOfferAndCascade(waitlistEntryId) {
  const trx = db.transaction(() => {
    const entry = db.prepare('SELECT * FROM waitlist WHERE id = ?').get(waitlistEntryId);
    if (!entry || entry.status !== 'offered') return null;

    db.prepare(`UPDATE waitlist SET status = 'expired' WHERE id = ?`).run(entry.id);
    db.prepare(
      `UPDATE event_seats SET status = 'available', held_by = NULL, hold_expires_at = NULL
       WHERE id = ? AND status = 'offered'`
    ).run(entry.offered_seat_id);

    return entry;
  });

  const entry = trx();
  if (entry) {
    offerSeatToNextInLine(entry.event_id, entry.category, entry.offered_seat_id);
  }
}

module.exports = { offerSeatToNextInLine, expireOfferAndCascade };
