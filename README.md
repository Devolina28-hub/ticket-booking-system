# Encore — Ticket Booking System

A full-stack ticket booking platform for movies and concerts: visual seat maps,
TTL-based seat holds that auto-release on checkout abandonment, a waitlist with
automatic seat re-assignment on cancellation, and QR-code email tickets.

- **Backend:** Node.js, Express, SQLite (`better-sqlite3`), JWT auth
- **Frontend:** React 18 + Vite, custom lavender→plum design system
- **Email:** Nodemailer (auto-provisions a free Ethereal test inbox if no SMTP is configured)
- **QR codes:** `qrcode` npm package, embedded as inline images in the confirmation email and shown in-app

---

## 1. Quick start

### Prerequisites
- Node.js 18+
- npm
- A free Neon Postgres database (see below) — this app no longer uses local SQLite,
  since that gets wiped on every restart on free hosting tiers. Neon persists properly.

### Set up your database (Neon, free)

1. Go to **https://neon.tech** and sign up free (no card required)
2. Click **Create a project** — any name/region is fine
3. On the project dashboard, find **Connection Details** and copy the connection string.
   It looks like:
   ```
   postgresql://neondb_owner:AbC123xyz@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. You'll paste this into `.env` as `DATABASE_URL` in the next step, and into Render's
   environment variables when you deploy (see section 10).

### Backend

```bash
cd backend
cp .env.example .env      # then paste your Neon connection string into DATABASE_URL
npm install
npm run seed               # creates demo users, 5 Indian venues, and 11 movie/concert/play listings
npm start                  # http://localhost:4000
```

On first run, the backend automatically creates all tables in your Neon database
(`ensureSchema()` runs before the server starts listening) — no manual migration step needed.

Demo accounts created by the seed script (password for all: `password123`):

| Role       | Email                    |
|------------|---------------------------|
| Admin      | admin@example.com         |
| Organiser  | organiser@example.com     |
| Organiser  | nina@example.com          |
| Customer   | customer@example.com      |
| Customer   | customer2@example.com     |

The seed script creates 3 venues (a cinema, an arena, and an intimate venue) and 6 events
(3 movies, 3 concerts) with realistic categories (Premium/Standard/VIP) and pricing.

### Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

The app has **three separate login portals**, matching the role-based auth requirement:
- `/login/customer` — browse events, book seats, manage tickets
- `/login/organiser` — create listings, view revenue
- `/login/admin` — manage venues and seat layouts (no public sign-up — admin accounts
  are seeded only, and the backend rejects `role: admin` on the public register endpoint
  to prevent privilege escalation)

`/login` shows a role-picker that links to each portal. Customer and organiser each also
have their own `/register/:role` sign-up page.

The Vite dev server proxies `/api/*` to `http://localhost:4000` (see `vite.config.js`).
For production, run `npm run build` and serve the `dist/` folder from any static host,
pointing it at your deployed backend URL (see the `BASE` constant in `src/api.js`).

### Real email delivery (Brevo free SMTP)

By default, if `SMTP_HOST` is not set, the backend auto-creates a free **Ethereal** test
inbox and logs a preview URL to the console — nothing lands in a real inbox. For **real**
delivery to a customer's actual email:

1. Sign up free at **https://www.brevo.com** (300 emails/day free, no card required)
2. Go to **Settings → SMTP & API → SMTP tab**
3. Copy the SMTP credentials into your `.env`:
   ```
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USER=your_brevo_login@smtp-brevo.com
   SMTP_PASS=your_brevo_smtp_key
   SMTP_FROM="Encore Tickets <your_verified_sender@yourdomain.com>"
   ```
4. **Critical step people miss:** the address in `SMTP_FROM` must be added as a
   **verified sender** in Brevo (**Settings → Senders, Domains & Dedicated IPs → Senders
   → Add a sender**) — Brevo silently rejects mail from unverified senders, which is the
   most common reason "I added the credentials but no email arrives."
5. Restart the backend. On startup, watch the logs for:
   - `[email] SMTP connection OK` → credentials are good, real emails will send
   - `[email] SMTP verification FAILED ...` → the log tells you exactly why (bad
     credentials, unverified sender, wrong host/port)
6. Also make sure `FRONTEND_URL` is set to your real deployed frontend URL — this is
   embedded in the QR code and the waitlist-offer email link, so if it's left as
   `localhost`, the QR/link won't work for anyone but you on your own machine.

---

## 2. Environment variables (`backend/.env.example`)

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API port | `4000` |
| `JWT_SECRET` | Signing secret for auth tokens | *(change in production)* |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `DATABASE_URL` | Neon Postgres connection string | *(required — no default)* |
| `SEAT_HOLD_TTL_MINUTES` | How long a seat stays held before auto-release | `10` |
| `WAITLIST_OFFER_TTL_MINUTES` | How long a waitlist offer is valid | `15` |
| `HOLD_SWEEPER_INTERVAL_SECONDS` | How often the background sweeper runs | `30` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Optional real SMTP config | *(blank → Ethereal test inbox)* |
| `FRONTEND_URL` | Used to build the link inside waitlist-offer emails | `http://localhost:5173` |

---

## 3. Database schema

Postgres (via Neon), `backend/src/db/index.js` (tables auto-created on boot via `ensureSchema()`):

```
users            id, name, email, password_hash, role(admin|organiser|customer)
venues           id, name, address, created_by
venue_seats      id, venue_id, row_label, seat_number, category          -- physical layout
events           id, title, description, type, venue_id, organiser_id, event_date, event_time
event_pricing    id, event_id, category, price
event_seats      id, event_id, venue_seat_id, row_label, seat_number, category,
                 status(available|held|offered|booked), held_by, hold_expires_at, booking_id
bookings         id, booking_ref, event_id, customer_id, status(confirmed|cancelled),
                 total_amount, qr_data_url, created_at, cancelled_at
booking_seats    id, booking_id, event_seat_id
waitlist         id, event_id, category, customer_id,
                 status(waiting|offered|expired|booked|cancelled),
                 offered_seat_id, offer_expires_at, joined_at
```

Key design point: **`event_seats` is a per-show snapshot** of `venue_seats`. Creating
an event copies the venue's layout into fresh rows, so re-using the same venue for
multiple shows gives each show an independent seat map (booking Friday's screening
doesn't touch Saturday's).

A partial unique index (`idx_waitlist_active_unique`) prevents a customer from
holding more than one *active* (`waiting`/`offered`) waitlist entry for the same
event+category.

---

## 4. Seat hold & TTL mechanism

1. `POST /api/events/:eventId/seats/hold { seat_ids }` — customer requests a hold.
2. Each seat is claimed with a **conditional UPDATE**:
   ```sql
   UPDATE event_seats SET status='held', held_by=?, hold_expires_at=?
   WHERE id=? AND event_id=? AND status='available'
   ```
   If the row's status wasn't `available` at that instant, the `RETURNING` clause
   returns zero rows and the request throws — the whole batch is wrapped in a single
   Postgres transaction, so a customer either holds **all** requested seats or **none**
   (no partial holds).
3. `hold_expires_at` is set to `now + SEAT_HOLD_TTL_MINUTES`.
4. A background sweeper (`node-cron`, every `HOLD_SWEEPER_INTERVAL_SECONDS`) runs:
   ```sql
   UPDATE event_seats SET status='available', held_by=NULL, hold_expires_at=NULL
   WHERE status='held' AND hold_expires_at < now
   ```
   releasing abandoned checkouts automatically. The same check also runs (awaited)
   on every seat-map read (`GET /api/events/:id`, `GET /api/events/:id/seats`) so the
   UI never shows a stale hold even between sweeper ticks.
5. The frontend polls the seat map every 4s and shows a live countdown for the
   customer's own hold; if it hits zero client-side, the selection is cleared and the
   user is told to reselect (the server is the source of truth either way).

## 5. Concurrency protection

Two customers hitting "hold" on the same seat at the same moment cannot both
succeed, because:
- Postgres serializes concurrent `UPDATE` statements targeting the same row: if two
  requests race for the same seat, the second `UPDATE` blocks until the first
  transaction commits (or rolls back), then re-evaluates its `WHERE status='available'`
  clause against the now-committed row — so it correctly finds the seat is no longer
  available and returns zero rows, with no explicit locking code needed.
- The hold/confirm/cancel/waitlist-offer operations all use the same **conditional
  UPDATE ... WHERE status = 'expected_status' RETURNING id** pattern. Whichever
  request's `UPDATE` is serialized first flips the row and gets a row back; the second
  request's `UPDATE` matches zero rows and is rejected with a clean `409 Conflict`,
  with no silent double-booking possible.
- This was verified with a genuine simultaneous-request test (both requests fired via
  `Promise.all`, not sequentially): exactly one returned `200`, the other `409`, and
  the seat's final status in the database was `held` by exactly one customer.

## 6. Waitlist auto-assignment & time-limited offers

- `POST /api/waitlist { event_id, category }` — join the FIFO queue for a sold-out
  category (`status='waiting'`, ordered by `joined_at`).
- On **cancellation** (`POST /api/bookings/:id/cancel`) or an **expired offer**, the
  server calls `offerSeatToNextInLine(eventId, category, seatId)`
  (`backend/src/services/waitlistService.js`):
  1. Selects the oldest `waiting` entry for that event+category.
  2. Atomically flips the seat `available → offered`, sets `held_by` to that
     customer and `hold_expires_at = now + WAITLIST_OFFER_TTL_MINUTES`.
  3. Marks the waitlist row `offered` and emails the customer a time-limited link
     (`/waitlist-offer/:id` in the frontend) to complete the booking.
- The customer calls `POST /api/waitlist/:id/complete` before the offer expires to
  convert it into a real booking (same transactional pattern as normal checkout —
  QR + confirmation email sent).
- If the offer **expires unused**, the sweeper's second pass
  (`expireOfferAndCascade`) marks the waitlist entry `expired`, releases the seat, and
  immediately re-offers it to the *next* person in line — cascading down the queue
  automatically with no manual intervention.

## 7. QR code, ticket verification & email delivery

- On booking confirmation, `generateQrDataUrl(bookingRef)` (`backend/src/services/qr.js`)
  encodes a **real URL** — `${FRONTEND_URL}/ticket/:bookingRef` — as a PNG data URL, not
  raw JSON. Scanning it with any phone camera opens a live web page, not unreadable text.
- **`FRONTEND_URL` must be set to your real deployed frontend URL in production**
  (e.g. `https://your-app.vercel.app`), or the QR will encode `localhost` links that only
  work on the machine that generated them. Set this in Render's environment variables.
- That page (`frontend/src/pages/TicketVerify.jsx`, route `/ticket/:bookingRef`) is public
  (no login required, since a venue staff member scanning a ticket isn't logged in) and
  calls `GET /api/bookings/verify/:bookingRef` (also public) to show one of three states:
  - ✅ **Valid Ticket** — booking is `confirmed`, shows event/seat/holder details
  - ⛔ **Invalid Ticket — Cancelled** — booking was cancelled after the QR was issued
  - ❓ **Ticket not found** — booking reference doesn't exist
- The QR is stored on the booking row and both shown in-app and embedded (as a CID
  attachment) in the confirmation email via `sendBookingConfirmation`
  (`backend/src/services/email.js`).
- Email delivery uses Nodemailer. If no `SMTP_HOST` is configured, it auto-creates a free
  Ethereal inbox and logs a preview link — nothing lands in a real inbox. For real delivery,
  configure Brevo (see section 1) — on startup, the backend now calls `transporter.verify()`
  and logs a clear pass/fail message to the console specifically diagnosing why email isn't
  sending (wrong credentials, unverified sender, etc.) rather than failing silently.

---

## 8. API reference

All authenticated routes expect `Authorization: Bearer <jwt>`. Roles in brackets.

### Auth
- `POST /api/auth/register` `{ name, email, password, role? }` → `{ token, user }`
  (role is limited to `customer`/`organiser` — `admin` cannot be self-registered, seeded only)
- `POST /api/auth/login` `{ email, password }` → `{ token, user }`
- `GET /api/auth/me` [any] → `{ user }`

### Venues
- `GET /api/venues` → list
- `GET /api/venues/:id` → venue + seat layout
- `POST /api/venues` [admin] `{ name, address, layout: [{row_label, seats, category}] }`

### Events
- `GET /api/events?type=&date=&q=` → list with pricing + availability (all roles can browse, including organiser/admin)
- `GET /api/events/:id` → event + pricing + full seat map
- `POST /api/events` [organiser, admin] `{ title, description, type, venue_id, event_date, event_time, pricing: [{category, price}] }`
- `GET /api/events/:id/summary` [organiser (own event only, 403 otherwise), admin (any)] → bookings, revenue, seat counts

### Seats
- `GET /api/events/:eventId/seats` → live seat statuses
- `POST /api/events/:eventId/seats/hold` [customer only — organiser/admin get 403] `{ seat_ids }` → `{ held, hold_expires_at }`
  (frontend additionally caps selection at 4 seats per booking)
- `POST /api/events/:eventId/seats/release` [customer] `{ seat_ids }`

### Bookings
- `POST /api/bookings/confirm` [customer only] `{ event_id, seat_ids }` → `{ booking, seats }`
- `GET /api/bookings/my` [customer] → booking history with seats
- `POST /api/bookings/:id/cancel` [customer (own), admin] → frees seats + triggers waitlist cascade
- `GET /api/bookings/verify/:bookingRef` [public, no auth] → `{ found, valid, booking, seats }` —
  this is what the ticket QR code links to via the frontend's `/ticket/:bookingRef` page

### Waitlist
- `POST /api/waitlist` [customer] `{ event_id, category }` → `{ id, position }`
- `GET /api/waitlist/my` [customer] → your entries + statuses
- `POST /api/waitlist/:id/complete` [customer (own)] → converts an `offered` entry into a booking

---

## 9. Project structure

```
backend/
  src/
    db/index.js          schema + migrations
    db/seed.js            demo data
    auth.js                JWT middleware
    routes/                 auth, venues, events, seats, bookings, waitlist
    services/
      holdSweeper.js         TTL release + offer expiry cron
      waitlistService.js     FIFO auto-assignment logic
      qr.js                   QR generation
      email.js                Nodemailer + Ethereal fallback
    server.js
frontend/
  src/
    pages/                  Events, EventSeatMap, Login, Register,
                             BookingHistory, MyWaitlist, OrganiserDashboard, AdminVenues
    components/             Navbar, SeatGrid
    api.js                  fetch wrapper
    styles.css              lavender → plum design system
```

## 10. Deploying

- **Database:** Neon (free tier) — create a project at https://neon.tech, copy the
  connection string, and set it as `DATABASE_URL` in your host's environment variables.
  Because Neon is a separate hosted service, data now persists across every redeploy
  and restart — this fixes the earlier problem of registered accounts and bookings
  disappearing whenever the backend host's free-tier filesystem reset.
- **Backend:** any Node host (Render, Railway, Fly.io). Set `DATABASE_URL` (from Neon),
  a real `JWT_SECRET`, SMTP vars (see section 1), and `FRONTEND_URL` (your deployed
  frontend URL). No disk/volume needed anymore since there's no local database file.
- **Frontend:** `npm run build` → deploy `dist/` to Vercel/Netlify/Render static site;
  set the API base URL (either reverse-proxy `/api` to the backend, or change
  `BASE` in `src/api.js` to the full backend URL).
