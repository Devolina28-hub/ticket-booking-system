const crypto = require('crypto');
const { query, queryOne } = require('../db');

const TOKEN_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 20); // 15-30 min window
const RATE_LIMIT_MAX = Number(process.env.PASSWORD_RESET_RATE_LIMIT_MAX || 3);
const RATE_LIMIT_WINDOW_MINUTES = Number(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES || 15);

// Simple in-memory rate limiter keyed by normalized email. Fine for a single
// backend instance (this app's deployment target); if this ever runs across
// multiple instances/processes, swap this Map for a shared store (Redis etc.)
// so limits are enforced globally instead of per-instance.
const rateLimitLog = new Map(); // email -> array of request timestamps (ms)

function isRateLimited(email) {
  const now = Date.now();
  const windowMs = RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
  const timestamps = (rateLimitLog.get(email) || []).filter((t) => now - t < windowMs);
  rateLimitLog.set(email, timestamps);
  return timestamps.length >= RATE_LIMIT_MAX;
}

function recordAttempt(email) {
  const timestamps = rateLimitLog.get(email) || [];
  timestamps.push(Date.now());
  rateLimitLog.set(email, timestamps);
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generates a cryptographically secure raw token, stores only its SHA-256
 * hash (never the raw token itself -- a DB leak alone can't be replayed),
 * and returns the raw token for embedding in the one email sent to the user.
 */
async function createResetToken(userId) {
  const rawToken = crypto.randomBytes(32).toString('hex'); // 256 bits of entropy
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  await query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );

  return { rawToken, expiresAt };
}

/**
 * Verifies a raw token against stored hashes. Checks existence, expiry, and
 * single-use (not already used) -- all three explicitly, with distinct
 * reasons, so callers can log/debug precisely without ever revealing which
 * check failed to the end user (the route layer collapses all failures to
 * one generic "invalid or expired" message).
 */
async function verifyResetToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return { valid: false, reason: 'missing' };
  const tokenHash = hashToken(rawToken);
  const row = await queryOne('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
  if (!row) return { valid: false, reason: 'not_found' };
  if (row.used_at) return { valid: false, reason: 'already_used' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { valid: false, reason: 'expired' };
  return { valid: true, row };
}

async function markTokenUsed(tokenId) {
  await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenId]);
}

// Invalidates any other still-usable tokens for this user -- e.g. if someone
// requested 3 reset emails and only clicks the newest link, the older two
// stop working the moment ANY of them is successfully used.
async function invalidateAllTokensForUser(userId) {
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
}

module.exports = {
  TOKEN_TTL_MINUTES,
  isRateLimited,
  recordAttempt,
  createResetToken,
  verifyResetToken,
  markTokenUsed,
  invalidateAllTokensForUser,
};
