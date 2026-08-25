const express = require('express');
const bcrypt = require('bcryptjs');
const { query, queryOne } = require('../db');
const { signToken, requireAuth } = require('../auth');
const { sendPasswordReset } = require('../services/email');
const {
  TOKEN_TTL_MINUTES,
  isRateLimited,
  recordAttempt,
  createResetToken,
  verifyResetToken,
  markTokenUsed,
  invalidateAllTokensForUser,
} = require('../services/passwordReset');

const router = express.Router();

// Generic response used for BOTH "email exists" and "email doesn't exist" --
// never reveal which one it was, or this endpoint becomes a way to enumerate
// registered accounts.
const GENERIC_RESET_RESPONSE = { message: 'If an account exists with this email, a password reset link has been sent.' };

router.post('/register', async (req, res) => {
  try {
    const { name, password, role } = req.body;
    // Normalize so "User@Example.com" and "user@example.com" are always the
    // same account -- Postgres compares email = $1 byte-for-byte otherwise,
    // and phone keyboards frequently auto-capitalize the first letter of an
    // email field even with type="email" set.
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    const allowedRoles = ['customer', 'organiser'];
    const finalRole = allowedRoles.includes(role) ? role : 'customer';

    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = bcrypt.hashSync(password, 10);
    const inserted = await queryOne(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, hash, finalRole]
    );

    const user = { id: inserted.id, name, email, role: finalRole };
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await queryOne('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * ALWAYS returns the same generic message regardless of whether the email is
 * registered, to avoid leaking which addresses have accounts. Rate-limited
 * per email to prevent using this endpoint to spam someone's inbox with
 * reset emails.
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required' });

    if (isRateLimited(email)) {
      // Still return the generic response -- a 429 here would itself leak
      // "this email has been requested a lot," which is its own small signal.
      // Silently no-op instead: no new token, no new email sent.
      return res.json(GENERIC_RESET_RESPONSE);
    }
    recordAttempt(email);

    const user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
    if (user) {
      const { rawToken, expiresAt } = await createResetToken(user.id);
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
      const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

      sendPasswordReset({
        to: user.email,
        customerName: user.name,
        resetUrl,
        expiresInMinutes: TOKEN_TTL_MINUTES,
      }).catch((err) => console.error('[auth] password reset email failed:', err.message));

      console.log(`[auth] password reset token issued for user ${user.id}, expires ${expiresAt}`);
    }
    // No `else` branch that does anything different -- same response either way.

    res.json(GENERIC_RESET_RESPONSE);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 *
 * Verifies the token exists, hasn't expired, and hasn't already been used,
 * then hashes the new password with the same bcrypt mechanism /register
 * uses, updates it, and marks the token (and any other outstanding tokens
 * for that user) used so it can never be replayed.
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const { valid, row } = await verifyResetToken(token);
    if (!valid) {
      // Deliberately one generic message for every failure reason (not
      // found / expired / already used) -- distinguishing them to the
      // client would help someone probe for valid-but-expired tokens.
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, row.user_id]);
    await markTokenUsed(row.id);
    await invalidateAllTokensForUser(row.user_id);

    res.json({ success: true, message: 'Password has been reset. You can now log in with your new password.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
