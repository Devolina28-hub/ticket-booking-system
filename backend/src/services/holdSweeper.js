const cron = require('node-cron');
const db = require('../db');
const { expireOfferAndCascade } = require('./waitlistService');

const INTERVAL_SECONDS = Number(process.env.HOLD_SWEEPER_INTERVAL_SECONDS || 30);

/**
 * Runs periodically (also runnable on-demand / synchronously before reads,
 * see releaseExpiredHoldsNow) to:
 *  1. Auto-release plain 'held' seats (checkout abandonment) back to 'available'.
 *  2. Expire 'offered' waitlist seats whose time-limited offer window passed,
 *     and cascade the seat to the next person in the waitlist queue.
 */
function releaseExpiredHoldsNow() {
  const now = new Date().toISOString();

  // 1. Plain abandoned holds -> back to available, seat map updates immediately.
  db.prepare(
    `UPDATE event_seats SET status = 'available', held_by = NULL, hold_expires_at = NULL
     WHERE status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at < ?`
  ).run(now);

  // 2. Expired waitlist offers -> cascade to next in line.
  const expiredOffers = db
    .prepare(
      `SELECT w.id FROM waitlist w
       WHERE w.status = 'offered' AND w.offer_expires_at IS NOT NULL AND w.offer_expires_at < ?`
    )
    .all(now);

  for (const row of expiredOffers) {
    expireOfferAndCascade(row.id);
  }
}

function startHoldSweeper() {
  releaseExpiredHoldsNow();
  cron.schedule(`*/${INTERVAL_SECONDS} * * * * *`, () => {
    try {
      releaseExpiredHoldsNow();
    } catch (err) {
      console.error('[holdSweeper] error:', err);
    }
  });
  console.log(`[holdSweeper] running every ${INTERVAL_SECONDS}s`);
}

module.exports = { startHoldSweeper, releaseExpiredHoldsNow };
