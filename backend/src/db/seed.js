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

function upsertVenue(name, address, createdBy, layout) {
  let venue = db.prepare('SELECT * FROM venues WHERE name = ?').get(name);
  if (venue) return venue;
  const trx = db.transaction(() => {
    const info = db.prepare('INSERT INTO venues (name, address, created_by) VALUES (?, ?, ?)').run(name, address, createdBy);
    const venueId = info.lastInsertRowid;
    const insertSeat = db.prepare('INSERT INTO venue_seats (venue_id, row_label, seat_number, category) VALUES (?, ?, ?, ?)');
    for (const rowDef of layout) {
      for (let n = 1; n <= rowDef.seats; n++) insertSeat.run(venueId, rowDef.row, n, rowDef.category);
    }
    return venueId;
  });
  const venueId = trx();
  return db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId);
}

function upsertEvent({ title, description, type, venueId, organiserId, date, time, pricing }) {
  let event = db.prepare('SELECT * FROM events WHERE title = ? AND event_date = ?').get(title, date);
  if (event) return event;
  const venueSeats = db.prepare('SELECT * FROM venue_seats WHERE venue_id = ?').all(venueId);
  const trx = db.transaction(() => {
    const info = db
      .prepare(`INSERT INTO events (title, description, type, venue_id, organiser_id, event_date, event_time) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(title, description, type, venueId, organiserId, date, time);
    const eventId = info.lastInsertRowid;
    const insertPricing = db.prepare('INSERT INTO event_pricing (event_id, category, price) VALUES (?, ?, ?)');
    for (const [category, price] of Object.entries(pricing)) insertPricing.run(eventId, category, price);
    const insertEventSeat = db.prepare(
      `INSERT INTO event_seats (event_id, venue_seat_id, row_label, seat_number, category, status) VALUES (?, ?, ?, ?, ?, 'available')`
    );
    for (const vs of venueSeats) insertEventSeat.run(eventId, vs.id, vs.row_label, vs.seat_number, vs.category);
    return eventId;
  });
  const eventId = trx();
  return db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
}

// ---- Users ----
const admin = upsertUser('Ada Admin', 'admin@example.com', 'password123', 'admin');
const organiser = upsertUser('Oscar Organiser', 'organiser@example.com', 'password123', 'organiser');
const organiser2 = upsertUser('Nina Nightshow', 'nina@example.com', 'password123', 'organiser');
upsertUser('Carla Customer', 'customer@example.com', 'password123', 'customer');
upsertUser('Dev Doe', 'customer2@example.com', 'password123', 'customer');

// ---- Venues ----
const cineplex = upsertVenue('Grand Cineplex — Screen 4', '123 Main Street, Springfield', admin.id, [
  { row: 'A', seats: 6, category: 'Premium' },
  { row: 'B', seats: 6, category: 'Premium' },
  { row: 'C', seats: 8, category: 'Standard' },
  { row: 'D', seats: 8, category: 'Standard' },
]);

const arena = upsertVenue('Skyline Arena', '88 Festival Avenue, Springfield', admin.id, [
  { row: 'FLOOR', seats: 10, category: 'VIP' },
  { row: 'LWR-A', seats: 12, category: 'Standard' },
  { row: 'LWR-B', seats: 12, category: 'Standard' },
]);

const indieHouse = upsertVenue('The Velvet Room', '17 Arts Lane, Springfield', admin.id, [
  { row: 'A', seats: 8, category: 'Standard' },
  { row: 'B', seats: 8, category: 'Standard' },
]);

// ---- Events: mix of movies and concerts ----
const events = [
  {
    title: 'Interstellar: Re-Release',
    description: 'IMAX re-release on the big screen — a visual and emotional journey through space and time.',
    type: 'movie', venueId: cineplex.id, organiserId: organiser.id,
    date: '2026-09-15', time: '19:30',
    pricing: { Premium: 25, Standard: 15 },
  },
  {
    title: 'The Last Signal',
    description: 'A gripping sci-fi thriller about first contact gone wrong.',
    type: 'movie', venueId: cineplex.id, organiserId: organiser.id,
    date: '2026-09-18', time: '18:00',
    pricing: { Premium: 22, Standard: 14 },
  },
  {
    title: 'Midnight Frequency',
    description: 'A neo-noir mystery set across three timezones in one long night.',
    type: 'movie', venueId: cineplex.id, organiserId: organiser.id,
    date: '2026-09-20', time: '21:00',
    pricing: { Premium: 24, Standard: 16 },
  },
  {
    title: 'Afterlight Live — World Tour',
    description: 'Electronic duo Afterlight brings their world tour to Skyline Arena.',
    type: 'concert', venueId: arena.id, organiserId: organiser2.id,
    date: '2026-09-25', time: '20:00',
    pricing: { VIP: 89, Standard: 49 },
  },
  {
    title: 'City Lights Festival',
    description: 'A night of indie and alternative acts under the stars.',
    type: 'concert', venueId: arena.id, organiserId: organiser2.id,
    date: '2026-10-02', time: '19:00',
    pricing: { VIP: 65, Standard: 35 },
  },
  {
    title: 'Acoustic Sessions: Live at The Velvet Room',
    description: 'An intimate unplugged evening with singer-songwriter Wren Halloway.',
    type: 'concert', venueId: indieHouse.id, organiserId: organiser2.id,
    date: '2026-09-28', time: '20:30',
    pricing: { Standard: 28 },
  },
];

for (const e of events) upsertEvent(e);

console.log('Seed complete.');
console.log('Login credentials (all passwords: password123):');
console.log('  Admin:      admin@example.com');
console.log('  Organiser:  organiser@example.com');
console.log('  Organiser2: nina@example.com');
console.log('  Customer:   customer@example.com');
console.log('  Customer2:  customer2@example.com');
console.log(`Seeded ${events.length} events across 3 venues (${cineplex.name}, ${arena.name}, ${indieHouse.name}).`);
