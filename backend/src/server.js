require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { ensureSchema } = require('./db');
const authRoutes = require('./routes/auth');
const venueRoutes = require('./routes/venues');
const eventRoutes = require('./routes/events');
const seatRoutes = require('./routes/seats');
const bookingRoutes = require('./routes/bookings');
const paymentRoutes = require('./routes/payments');
const waitlistRoutes = require('./routes/waitlist');
const { startHoldSweeper } = require('./services/holdSweeper');
const { verifyEmailConfig } = require('./services/email');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/events/:eventId/seats', seatRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/waitlist', waitlistRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

// Schema must be ready before we start accepting requests, since every route
// queries the database immediately.
ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Ticket Booking API listening on http://localhost:${PORT}`);
      startHoldSweeper();
      // Kick off the SMTP check now instead of waiting for the first real
      // booking -- gives a clear pass/fail log line right at boot.
      verifyEmailConfig().catch((err) => console.error('[email] Startup check errored:', err.message));
    });
  })
  .catch((err) => {
    console.error('[server] Failed to initialize database schema:', err.message);
    process.exit(1);
  });

