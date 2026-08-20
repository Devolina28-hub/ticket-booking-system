require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./index');

function upsertUser(name, email, password, role) {
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user) return user;
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, hash, role);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

const admin = upsertUser('Ada Admin', 'admin@example.com', 'password123', 'admin');
const organiser = upsertUser('Oscar Organiser', 'organiser@example.com', 'password123', 'organiser');
const customer = upsertUser('Carla Customer', 'customer@example.com', 'password123', 'customer');
const customer2 = upsertUser('Dev Doe', 'customer2@example.com', 'password123', 'customer');

let venue = db.prepare('SELECT * FROM venues WHERE name = ?').get('Grand Cinema Hall 1');
if (!venue) {
  const trx = db.transaction(() => {
    const venueInfo = db
      .prepare('INSERT INTO venues (name, address, created_by) VALUES (?, ?, ?)')
      .run('Grand Cinema Hall 1', '123 Main Street, Springfield', admin.id);
    const venueId = venueInfo.lastInsertRowid;
    const insertSeat = db.prepare('INSERT INTO venue_seats (venue_id, row_label, seat_number, category) VALUES (?, ?, ?, ?)');
    // Small deliberately-scarce layout so the waitlist flow is easy to demo:
    // Row A = Premium (6 seats), Row B/C = Standard (8 seats each)
    for (let n = 1; n <= 6; n++) insertSeat.run(venueId, 'A', n, 'Premium');
    for (let n = 1; n <= 8; n++) insertSeat.run(venueId, 'B', n, 'Standard');
    for (let n = 1; n <= 8; n++) insertSeat.run(venueId, 'C', n, 'Standard');
    return venueId;
  });
  const venueId = trx();
  venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId);
}

let event = db.prepare('SELECT * FROM events WHERE title = ?').get('Interstellar: Re-Release');
if (!event) {
  const venueSeats = db.prepare('SELECT * FROM venue_seats WHERE venue_id = ?').all(venue.id);
  const trx = db.transaction(() => {
    const eventInfo = db
      .prepare(
        `INSERT INTO events (title, description, type, venue_id, organiser_id, event_date, event_time)
         VALUES (?, ?, 'movie', ?, ?, ?, ?)`
      )
      .run('Interstellar: Re-Release', 'IMAX re-release on the big screen.', venue.id, organiser.id, '2026-09-15', '19:30');
    const eventId = eventInfo.lastInsertRowid;
    db.prepare('INSERT INTO event_pricing (event_id, category, price) VALUES (?, ?, ?)').run(eventId, 'Premium', 25.0);
    db.prepare('INSERT INTO event_pricing (event_id, category, price) VALUES (?, ?, ?)').run(eventId, 'Standard', 15.0);
    const insertEventSeat = db.prepare(
      `INSERT INTO event_seats (event_id, venue_seat_id, row_label, seat_number, category, status) VALUES (?, ?, ?, ?, ?, 'available')`
    );
    for (const vs of venueSeats) insertEventSeat.run(eventId, vs.id, vs.row_label, vs.seat_number, vs.category);
    return eventId;
  });
  const eventId = trx();
  event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
}

console.log('Seed complete.');
console.log('Login credentials (all passwords: password123):');
console.log('  Admin:     admin@example.com');
console.log('  Organiser: organiser@example.com');
console.log('  Customer:  customer@example.com');
console.log('  Customer2: customer2@example.com');
console.log(`Demo event id: ${event.id} (${event.title})`);
