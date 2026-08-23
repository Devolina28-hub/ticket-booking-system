const express = require('express');
const bcrypt = require('bcryptjs');
const { query, queryOne } = require('../db');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
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
    const { email, password } = req.body;
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

module.exports = router;
