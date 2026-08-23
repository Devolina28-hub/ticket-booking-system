require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, queryOne, withTransaction, ensureSchema } = require('./index');

async function upsertUser(name, email, password, role) {
  let user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
  if (user) return user;
  const hash = bcrypt.hashSync(password, 10);
  const inserted = await queryOne(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
    [name, email, hash, role]
  );
  return inserted;
}

async function upsertVenue(name, address, createdBy, layout) {
  let venue = await queryOne('SELECT * FROM venues WHERE name = $1', [name]);
  if (venue) return venue;
  const venueId = await withTransaction(async (trx) => {
    const v = await trx.queryOne(
      'INSERT INTO venues (name, address, created_by) VALUES ($1, $2, $3) RETURNING id',
      [name, address, createdBy]
    );
    for (const rowDef of layout) {
      for (let n = 1; n <= rowDef.seats; n++) {
        await trx.query(
          'INSERT INTO venue_seats (venue_id, row_label, seat_number, category) VALUES ($1, $2, $3, $4)',
          [v.id, rowDef.row, n, rowDef.category]
        );
      }
    }
    return v.id;
  });
  return queryOne('SELECT * FROM venues WHERE id = $1', [venueId]);
}

async function upsertEvent({ title, description, type, venueId, organiserId, date, time, pricing }) {
  let event = await queryOne('SELECT * FROM events WHERE title = $1 AND event_date = $2', [title, date]);
  if (event) return event;
  const venueSeats = await query('SELECT * FROM venue_seats WHERE venue_id = $1', [venueId]);
  const eventId = await withTransaction(async (trx) => {
    const e = await trx.queryOne(
      `INSERT INTO events (title, description, type, venue_id, organiser_id, event_date, event_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [title, description, type, venueId, organiserId, date, time]
    );
    for (const [category, price] of Object.entries(pricing)) {
      await trx.query('INSERT INTO event_pricing (event_id, category, price) VALUES ($1, $2, $3)', [e.id, category, price]);
    }
    for (const vs of venueSeats) {
      await trx.query(
        `INSERT INTO event_seats (event_id, venue_seat_id, row_label, seat_number, category, status)
         VALUES ($1, $2, $3, $4, $5, 'available')`,
        [e.id, vs.id, vs.row_label, vs.seat_number, vs.category]
      );
    }
    return e.id;
  });
  return queryOne('SELECT * FROM events WHERE id = $1', [eventId]);
}

async function main() {
  await ensureSchema();

  // ---- Users ----
  const admin = await upsertUser('Ada Admin', 'admin@example.com', 'password123', 'admin');
  const organiser = await upsertUser('Oscar Organiser', 'organiser@example.com', 'password123', 'organiser');
  const organiser2 = await upsertUser('Nina Nightshow', 'nina@example.com', 'password123', 'organiser');
  await upsertUser('Carla Customer', 'customer@example.com', 'password123', 'customer');
  await upsertUser('Dev Doe', 'customer2@example.com', 'password123', 'customer');

  // ---- Venues (Indian cities) ----
  const pvr = await upsertVenue('PVR ICON, Mumbai', 'Phoenix Marketcity, Kurla, Mumbai', admin.id, [
    { row: 'A', seats: 6, category: 'Premium' },
    { row: 'B', seats: 6, category: 'Premium' },
    { row: 'C', seats: 8, category: 'Standard' },
    { row: 'D', seats: 8, category: 'Standard' },
  ]);

  const inoxDelhi = await upsertVenue('INOX, Nehru Place, Delhi', 'Nehru Place, New Delhi', admin.id, [
    { row: 'A', seats: 6, category: 'Premium' },
    { row: 'B', seats: 8, category: 'Standard' },
    { row: 'C', seats: 8, category: 'Standard' },
  ]);

  const nsciDome = await upsertVenue('NSCI Dome, Worli', 'Worli, Mumbai', admin.id, [
    { row: 'FLOOR', seats: 12, category: 'VIP' },
    { row: 'LWR-A', seats: 14, category: 'Standard' },
    { row: 'LWR-B', seats: 14, category: 'Standard' },
  ]);

  const jln = await upsertVenue('Jawaharlal Nehru Stadium', 'Lodhi Road, New Delhi', admin.id, [
    { row: 'FLOOR', seats: 12, category: 'VIP' },
    { row: 'STAND-A', seats: 16, category: 'Standard' },
    { row: 'STAND-B', seats: 16, category: 'Standard' },
  ]);

  const prithvi = await upsertVenue('Prithvi Theatre', 'Juhu Church Road, Mumbai', admin.id, [
    { row: 'A', seats: 8, category: 'Standard' },
    { row: 'B', seats: 8, category: 'Standard' },
  ]);

  // ---- Events: Bollywood movies, Indian artist concerts, and stage plays ----
  const events = [
    {
      title: 'Jawan',
      description: 'A high-octane action drama about a man righting the wrongs of society.',
      type: 'movie', venueId: pvr.id, organiserId: organiser.id,
      date: '2026-09-15', time: '19:30',
      pricing: { Premium: 400, Standard: 250 },
    },
    {
      title: 'Rocky Aur Rani Kii Prem Kahaani',
      description: 'A vibrant romantic drama about two families and their clashing worlds.',
      type: 'movie', venueId: pvr.id, organiserId: organiser.id,
      date: '2026-09-18', time: '18:00',
      pricing: { Premium: 380, Standard: 220 },
    },
    {
      title: 'Gangubai Kathiawadi',
      description: 'The powerful story of a woman who rises to become a formidable force in Mumbai.',
      type: 'movie', venueId: inoxDelhi.id, organiserId: organiser.id,
      date: '2026-09-20', time: '21:00',
      pricing: { Premium: 350, Standard: 200 },
    },
    {
      title: '12th Fail',
      description: 'An inspiring true story of grit and determination against all odds.',
      type: 'movie', venueId: inoxDelhi.id, organiserId: organiser.id,
      date: '2026-09-22', time: '17:00',
      pricing: { Premium: 320, Standard: 180 },
    },
    {
      title: 'Karan Aujla — Live in Concert',
      description: 'Punjabi hip-hop sensation Karan Aujla brings his chart-topping hits live on stage.',
      type: 'concert', venueId: nsciDome.id, organiserId: organiser2.id,
      date: '2026-09-25', time: '20:00',
      pricing: { VIP: 3500, Standard: 1800 },
    },
    {
      title: 'Arijit Singh — Soulful Nights Tour',
      description: "India's most beloved playback singer performs his greatest hits live.",
      type: 'concert', venueId: jln.id, organiserId: organiser2.id,
      date: '2026-10-02', time: '19:00',
      pricing: { VIP: 5000, Standard: 2200 },
    },
    {
      title: 'Diljit Dosanjh — Dil-Luminati Live',
      description: 'Diljit Dosanjh lights up the stage with a high-energy Punjabi and Bollywood set.',
      type: 'concert', venueId: nsciDome.id, organiserId: organiser2.id,
      date: '2026-10-05', time: '20:30',
      pricing: { VIP: 4000, Standard: 2000 },
    },
    {
      title: 'Shreya Ghoshal — Melodies Live',
      description: 'An enchanting evening of timeless melodies with playback icon Shreya Ghoshal.',
      type: 'concert', venueId: jln.id, organiserId: organiser2.id,
      date: '2026-10-08', time: '19:30',
      pricing: { VIP: 4500, Standard: 2000 },
    },
    {
      title: 'Mahabharat — The Epic Retold',
      description: 'A gripping theatrical retelling of the timeless epic of duty, war, and destiny.',
      type: 'event', venueId: prithvi.id, organiserId: organiser2.id,
      date: '2026-09-28', time: '19:00',
      pricing: { Standard: 600 },
    },
    {
      title: 'Ramayana — A Stage Odyssey',
      description: 'A moving theatrical journey through the legend of Rama, Sita, and Hanuman.',
      type: 'event', venueId: prithvi.id, organiserId: organiser2.id,
      date: '2026-10-01', time: '19:00',
      pricing: { Standard: 600 },
    },
    {
      title: 'Hamlet',
      description: "Shakespeare's timeless tragedy of betrayal, madness, and revenge, performed live.",
      type: 'event', venueId: prithvi.id, organiserId: organiser2.id,
      date: '2026-10-04', time: '20:00',
      pricing: { Standard: 550 },
    },
  ];

  for (const e of events) await upsertEvent(e);

  console.log('Seed complete.');
  console.log('Login credentials (all passwords: password123):');
  console.log('  Admin:      admin@example.com');
  console.log('  Organiser:  organiser@example.com');
  console.log('  Organiser2: nina@example.com');
  console.log('  Customer:   customer@example.com');
  console.log('  Customer2:  customer2@example.com');
  console.log(`Seeded ${events.length} events across 5 venues (${pvr.name}, ${inoxDelhi.name}, ${nsciDome.name}, ${jln.name}, ${prithvi.name}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
