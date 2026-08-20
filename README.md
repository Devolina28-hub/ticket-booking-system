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

### Backend

```bash
cd backend
cp .env.example .env      # edit values if you want, defaults work out of the box
npm install
npm run seed               # creates demo users, a venue, and a demo event
npm start                  # http://localhost:4000
```

Demo accounts created by the seed script (password for all: `password123`):

| Role      | Email                  |
|-----------|-------------------------|
| Admin     | admin@example.com       |
| Organiser | organiser@example.com   |
| Customer  | customer@example.com    |
| Customer  | customer2@example.com   |

### Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:4000` (see `vite.config.js`).
For production, run `npm run build` and serve the `dist/` folder from any static host,
pointing it at your deployed backend URL (or reverse-proxy `/api` to it).

### Email preview

If you don't set `SMTP_HOST` in `.env`, the backend automatically creates a free
**Ethereal** test inbox on startup and logs a preview URL to the console every time
an email is sent — open that link to see the actual rendered confirmation/offer email
with the QR code attached. To send real email, set `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS` in `.env` (any standard SMTP provider works, e.g. Gmail
app passwords, SendGrid, Mailgun free tiers, etc).

---

## 2. Environment variables (`backend/.env.example`)

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API port | `4000` |
| `JWT_SECRET` | Signing secret for auth tokens | *(change in production)* |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `DB_PATH` | SQLite file location | `./data/app.db` |
| `SEAT_HOLD_TTL_MINUTES` | How long a seat stays held before auto-release | `10` |
| `WAITLIST_OFFER_TTL_MINUTES` | How long a waitlist offer is valid | `15` |
| `HOLD_SWEEPER_INTERVAL_SECONDS` | How often the background sweeper runs | `30` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Optional real SMTP config | *(blank → Ethereal test inbox)* |
| `FRONTEND_URL` | Used to build the link inside waitlist-offer emails | `http://localhost:5173` |

---

## 3. Database schema

SQLite, `backend/src/db/index.js` (auto-migrated on boot):

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
   If the row's status wasn't `available` at that instant, `changes = 0` and the
   request throws — the whole batch is wrapped in a single SQLite transaction, so a
   customer either holds **all** requested seats or **none** (no partial holds).
3. `hold_expires_at` is set to `now + SEAT_HOLD_TTL_MINUTES`.
4. A background sweeper (`node-cron`, every `HOLD_SWEEPER_INTERVAL_SECONDS`) runs:
   ```sql
   UPDATE event_seats SET status='available', held_by=NULL, hold_expires_at=NULL
   WHERE status='held' AND hold_expires_at < now
   ```
   releasing abandoned checkouts automatically. The same check also runs synchronously
   on every seat-map read (`GET /api/events/:id`, `GET /api/events/:id/seats`) so the
   UI never shows a stale hold even between sweeper ticks.
5. The frontend polls the seat map every 4s and shows a live countdown for the
   customer's own hold; if it hits zero client-side, the selection is cleared and the
   user is told to reselect (the server is the source of truth either way).

## 5. Concurrency protection

Two customers hitting "hold" on the same seat at the same moment cannot both
succeed, because:
- SQLite runs in **WAL mode** with `busy_timeout=5000`, so concurrent writers queue
  rather than error out.
- The hold/confirm/cancel/waitlist-offer operations all use the same **conditional
  UPDATE ... WHERE status = 'expected_status'** pattern. Whichever request's UPDATE
  is serialized first flips the row and gets `changes = 1`; the second request's
  UPDATE matches zero rows (the status has already moved on) and is rejected with a
  clean `409 Conflict`, with no silent double-booking possible.
- This was verified with an actual concurrent-style test (see `SYSTEM_DESIGN.md`):
  holding the same seats as a second user after a first hold returns
  `409 — Seat A1 is held`.

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

## 7. QR code & email delivery

- On booking confirmation, `generateQrDataUrl({ bookingRef, eventId, customerId })`
  (`backend/src/services/qr.js`) encodes the booking reference + IDs as a PNG data URL
  (`qrcode` package).
- The QR is stored on the booking row and both shown in-app and embedded (as a CID
  attachment) in the confirmation email via `sendBookingConfirmation`
  (`backend/src/services/email.js`).
- Email delivery uses Nodemailer; if no SMTP is configured it auto-creates a free
  Ethereal inbox and logs a preview link — no signup needed to see it working.

---

## 8. API reference

All authenticated routes expect `Authorization: Bearer <jwt>`. Roles in brackets.

### Auth
- `POST /api/auth/register` `{ name, email, password, role? }` → `{ token, user }`
- `POST /api/auth/login` `{ email, password }` → `{ token, user }`
- `GET /api/auth/me` [any] → `{ user }`

### Venues
- `GET /api/venues` → list
- `GET /api/venues/:id` → venue + seat layout
- `POST /api/venues` [admin] `{ name, address, layout: [{row_label, seats, category}] }`

### Events
- `GET /api/events?type=&date=&q=` → list with pricing + availability
- `GET /api/events/:id` → event + pricing + full seat map
- `POST /api/events` [organiser, admin] `{ title, description, type, venue_id, event_date, event_time, pricing: [{category, price}] }`
- `GET /api/events/:id/summary` [organiser (own), admin] → bookings, revenue, seat counts

### Seats
- `GET /api/events/:eventId/seats` → live seat statuses
- `POST /api/events/:eventId/seats/hold` [customer] `{ seat_ids }` → `{ held, hold_expires_at }`
- `POST /api/events/:eventId/seats/release` [customer] `{ seat_ids }`

### Bookings
- `POST /api/bookings/confirm` [customer] `{ event_id, seat_ids }` → `{ booking, seats }`
- `GET /api/bookings/my` [customer] → booking history with seats
- `POST /api/bookings/:id/cancel` [customer (own), admin] → frees seats + triggers waitlist cascade

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

- **Backend:** any Node host (Render, Railway, Fly.io). SQLite file persists on a
  mounted volume; set `DB_PATH` accordingly. Set real `JWT_SECRET` and SMTP vars.
- **Frontend:** `npm run build` → deploy `dist/` to Vercel/Netlify/Render static site;
  set the API base URL (either reverse-proxy `/api` to the backend, or change
  `BASE` in `src/api.js` to the full backend URL).
