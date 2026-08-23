const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    '[db] DATABASE_URL is not set. Create a free Postgres database at https://neon.tech, ' +
    'copy its connection string into backend/.env as DATABASE_URL, and restart.'
  );
}

// Neon (and most hosted Postgres) require SSL. rejectUnauthorized: false is the
// standard setting for Neon's connection string in a plain Node environment
// that doesn't have Neon's CA certificate installed locally.
// Neon (and most hosted Postgres) require SSL; a local/self-hosted Postgres
// usually does not support it at all. Auto-detect: only enable SSL for
// non-local hosts, unless PGSSL explicitly forces it either way.
function shouldUseSSL(connStr) {
  if (process.env.PGSSL === 'true') return true;
  if (process.env.PGSSL === 'false') return false;
  if (!connStr) return false;
  return !/localhost|127\.0\.0\.1/.test(connStr);
}

const pool = new Pool({
  connectionString,
  ssl: shouldUseSSL(connectionString) ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle Postgres client:', err.message);
});

// Simple query helper: query(text, params) -> rows array
async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

// Simple query helper for a single row (or null)
async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}

/**
 * Runs `fn` inside a BEGIN/COMMIT/ROLLBACK transaction on a dedicated client.
 * fn receives a `client` with the same query(text, params) signature as above.
 * This is the Postgres equivalent of better-sqlite3's synchronous db.transaction():
 * if fn throws, everything is rolled back and the error propagates to the caller.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  const clientQuery = async (text, params = []) => (await client.query(text, params)).rows;
  const clientQueryOne = async (text, params = []) => {
    const rows = await clientQuery(text, params);
    return rows[0] || null;
  };
  try {
    await client.query('BEGIN');
    const result = await fn({ query: clientQuery, queryOne: clientQueryOne });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','organiser','customer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Physical seat layout of a venue (rows x seat numbers), each seat has a category.
CREATE TABLE IF NOT EXISTS venue_seats (
  id SERIAL PRIMARY KEY,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  row_label TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  category TEXT NOT NULL,
  UNIQUE(venue_id, row_label, seat_number)
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('movie','concert','event')) DEFAULT 'event',
  venue_id INTEGER NOT NULL REFERENCES venues(id),
  organiser_id INTEGER NOT NULL REFERENCES users(id),
  event_date TEXT NOT NULL,
  event_time TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-category pricing for an event
CREATE TABLE IF NOT EXISTS event_pricing (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  UNIQUE(event_id, category)
);

-- One row per seat PER EVENT (a "show" instance). This is the row concurrency
-- control operates on: status transitions are guarded by conditional UPDATEs.
CREATE TABLE IF NOT EXISTS event_seats (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_seat_id INTEGER NOT NULL REFERENCES venue_seats(id),
  row_label TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('available','held','booked','offered')) DEFAULT 'available',
  held_by INTEGER REFERENCES users(id),
  hold_expires_at TIMESTAMPTZ,
  booking_id INTEGER,
  UNIQUE(event_id, venue_seat_id)
);

CREATE INDEX IF NOT EXISTS idx_event_seats_event ON event_seats(event_id);
CREATE INDEX IF NOT EXISTS idx_event_seats_status ON event_seats(event_id, status);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  booking_ref TEXT NOT NULL UNIQUE,
  event_id INTEGER NOT NULL REFERENCES events(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('confirmed','cancelled')) DEFAULT 'confirmed',
  total_amount REAL NOT NULL,
  qr_data_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS booking_seats (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_seat_id INTEGER NOT NULL REFERENCES event_seats(id)
);

-- Waitlist queue, FIFO per (event, category)
CREATE TABLE IF NOT EXISTS waitlist (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('waiting','offered','expired','booked','cancelled')) DEFAULT 'waiting',
  offered_seat_id INTEGER REFERENCES event_seats(id),
  offer_expires_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A customer may only have ONE active (waiting/offered) waitlist entry per event+category.
-- Enforced via a partial unique index (application logic also double-checks this).
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_active_unique
  ON waitlist(event_id, category, customer_id)
  WHERE status IN ('waiting','offered');

CREATE INDEX IF NOT EXISTS idx_waitlist_queue ON waitlist(event_id, category, status, joined_at);
`;

let schemaReadyPromise = null;

// Called once at server startup (and by the seed script) before any queries run.
async function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = pool.query(schema).then(() => {
      console.log('[db] Schema ready (Postgres/Neon).');
    });
  }
  return schemaReadyPromise;
}

module.exports = { pool, query, queryOne, withTransaction, ensureSchema };
