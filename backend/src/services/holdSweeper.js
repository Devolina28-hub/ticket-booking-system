const cron = require('node-cron');
const { query } = require('../db');
const { expireOfferAndCascade } = require('./waitlistService');

const INTERVAL_SECONDS = Number(process.env.HOLD_SWEEPER_INTERVAL_SECONDS || 30);

/**
 * Runs periodically (also awaited on-demand before reads, see call sites in
 * routes) to:
 *  1. Auto-release plain 'held' seats (checkout abandonment) back to 'available'.
 *  2. Expire 'offered' waitlist seats whose time-limited offer window passed,
 *     and cascade the seat to the next person in the waitlist queue.
 */
async function releaseExpiredHoldsNow() {
  const now = new Date().toISOString();

  // 1. Plain abandoned holds -> back to available, seat map updates immediately.
  //    This also covers seats held for an in-progress QR payment, since
  //    /payments/initiate re-extends hold_expires_at to match the payment
  //    session's own 10-minute expiry.
  await query(
    `UPDATE event_seats SET status = 'available', held_by = NULL, hold_expires_at = NULL
     WHERE status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at < $1`,
    [now]
  );

  // 1b. Mark any pending payment sessions whose scan-to-pay window has
  // passed as 'expired' (their seats are already freed above).
  await query(
    `UPDATE payment_sessions SET status = 'expired' WHERE status = 'pending' AND expires_at < $1`,
    [now]
  );

  // 2. Expired waitlist offers -> cascade to next in line.
  const expiredOffers = await query(
    `SELECT id FROM waitlist
     WHERE status = 'offered' AND offer_expires_at IS NOT NULL AND offer_expires_at < $1`,
    [now]
  );

  for (const row of expiredOffers) {
    await expireOfferAndCascade(row.id);
  }
}

function startHoldSweeper() {
  releaseExpiredHoldsNow().catch((err) => console.error('[holdSweeper] initial run error:', err.message));
  cron.schedule(`*/${INTERVAL_SECONDS} * * * * *`, async () => {
    try {
      await releaseExpiredHoldsNow();
    } catch (err) {
      console.error('[holdSweeper] error:', err.message);
    }
  });
  console.log(`[holdSweeper] running every ${INTERVAL_SECONDS}s`);
}

module.exports = { startHoldSweeper, releaseExpiredHoldsNow };
