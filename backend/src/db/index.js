const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './data/app.db';
const resolvedPath = path.resolve(process.cwd(), dbPath);
const dir = path.dirname(resolvedPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(resolvedPath);

// Pragmas for safety + concurrency behaviour.
// WAL mode allows concurrent readers while a writer is active, and
// busy_timeout makes concurrent writers queue instead of failing immediately
// -- this is a core part of how we prevent double-booking of the same seat.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','organiser','customer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Physical seat layout of a venue (rows x seat numbers), each seat has a category.
CREATE TABLE IF NOT EXISTS venue_seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  row_label TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  category TEXT NOT NULL,
  UNIQUE(venue_id, row_label, seat_number)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('movie','concert','event')) DEFAULT 'event',
  venue_id INTEGER NOT NULL REFERENCES venues(id),
  organiser_id INTEGER NOT NULL REFERENCES users(id),
  event_date TEXT NOT NULL,
  event_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-category pricing for an event
CREATE TABLE IF NOT EXISTS event_pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  UNIQUE(event_id, category)
);

-- One row per seat PER EVENT (a "show" instance). This is the row concurrency
-- control operates on: status transitions are guarded by conditional UPDATEs.
CREATE TABLE IF NOT EXISTS event_seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_seat_id INTEGER NOT NULL REFERENCES venue_seats(id),
  row_label TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('available','held','booked','offered')) DEFAULT 'available',
  held_by INTEGER REFERENCES users(id),
  hold_expires_at TEXT,
  booking_id INTEGER,
  UNIQUE(event_id, venue_seat_id)
);

CREATE INDEX IF NOT EXISTS idx_event_seats_event ON event_seats(event_id);
CREATE INDEX IF NOT EXISTS idx_event_seats_status ON event_seats(event_id, status);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_ref TEXT NOT NULL UNIQUE,
  event_id INTEGER NOT NULL REFERENCES events(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('confirmed','cancelled')) DEFAULT 'confirmed',
  total_amount REAL NOT NULL,
  qr_data_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS booking_seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_seat_id INTEGER NOT NULL REFERENCES event_seats(id)
);

-- Waitlist queue, FIFO per (event, category)
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('waiting','offered','expired','booked','cancelled')) DEFAULT 'waiting',
  offered_seat_id INTEGER REFERENCES event_seats(id),
  offer_expires_at TEXT,
  joined_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- A customer may only have ONE active (waiting/offered) waitlist entry per event+category.
-- Enforced via a partial unique index (application logic also double-checks this).
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_active_unique
  ON waitlist(event_id, category, customer_id)
  WHERE status IN ('waiting','offered');

CREATE INDEX IF NOT EXISTS idx_waitlist_queue ON waitlist(event_id, category, status, joined_at);
`;

db.exec(schema);

module.exports = db;
