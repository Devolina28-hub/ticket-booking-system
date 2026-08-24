// Sends email via Resend's HTTP API (https://api.resend.com/emails) instead
// of SMTP. Render's free tier blocks all outbound traffic on SMTP ports
// (25, 465, 587) as of Sept 2025, so nodemailer/SMTP simply cannot work
// here -- the connection hangs until it times out. Resend's API sends over
// normal HTTPS (port 443), which is not blocked.
//
// IMPORTANT: Resend requires a verified sending domain before it will
// deliver to real recipients. Until RESEND_FROM_DOMAIN_VERIFIED (see below)
// points at a domain you've verified in the Resend dashboard, this falls
// back to Resend's onboarding@resend.dev sandbox sender, which Resend will
// ONLY deliver to the email address you signed up to Resend with -- not to
// actual customers. Booking confirmations to real customers will silently
// fail (Resend returns a 403) until a domain is verified. See
// resend.com/domains -> Add Domain, then set SMTP_FROM to an address on
// that domain.

const RESEND_API_URL = 'https://api.resend.com/emails';
const RESEND_DOMAINS_URL = 'https://api.resend.com/domains';

function env(key) {
  const v = process.env[key];
  return v ? v.trim() : v;
}

function apiKey() {
  return env('RESEND_API_KEY');
}

// Resend's "from" field takes the same "Name <email>" string format we
// already store in SMTP_FROM, so no reshaping needed -- just fall back to
// the sandbox sender if nothing is configured.
function fromAddress() {
  return env('SMTP_FROM') || '"Encore Tickets" <onboarding@resend.dev>';
}

// Runs once at server startup (see server.js) so you get a clear pass/fail
// log line right away instead of waiting for the first real booking.
async function verifyEmailConfig() {
  const key = apiKey();
  if (!key) {
    console.error(
      '[email] RESEND_API_KEY is not set -- emails will NOT be sent.\n' +
      '  Fix: in your Resend account go to API Keys, create a key with ' +
      '"Sending access", and add it as RESEND_API_KEY in Render -> your service -> Environment.'
    );
    return;
  }
  try {
    const res = await fetch(RESEND_DOMAINS_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const verifiedDomains = (data.data || []).filter((d) => d.status === 'verified');
      console.log(`[email] Resend API key OK -- real emails will be sent.${
        verifiedDomains.length
          ? ` Verified domain(s): ${verifiedDomains.map((d) => d.name).join(', ')}.`
          : ' WARNING: no verified domain yet -- falling back to the onboarding@resend.dev ' +
            'sandbox sender, which only delivers to your own Resend account email, not real customers.'
      }`);
    } else {
      const text = await res.text().catch(() => '');
      console.error(`[email] Resend API key check FAILED (status ${res.status}): ${text}`);
    }
  } catch (err) {
    console.error('[email] Resend API check errored:', err.message);
  }
}

async function sendMail({ to, subject, html, attachments }) {
  const key = apiKey();
  if (!key) {
    const err = new Error('RESEND_API_KEY not configured');
    console.error(`[email] FAILED to send "${subject}" to ${to}: ${err.message}`);
    throw err;
  }

  const body = {
    from: fromAddress(),
    to: [to],
    subject,
    html,
  };
  if (attachments && attachments.length) {
    // Resend's API wants { filename, content } where content is base64
    // (no data: URL prefix).
    body.attachments = attachments.map((a) => ({ filename: a.filename, content: a.content }));
  }

  let res;
  try {
    res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[email] FAILED to send "${subject}" to ${to}. Network error: ${err.message}`);
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[email] FAILED to send "${subject}" to ${to}. Resend status ${res.status}: ${text}`);
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }

  const data = await res.json().catch(() => ({}));
  console.log(`[email] Sent "${subject}" to ${to} (id: ${data.id || 'n/a'})`);
  return data;
}

async function sendBookingConfirmation({ to, customerName, event, seats, bookingRef, qrDataUrl, totalAmount }) {
  const seatList = seats.map((s) => `${s.row_label}${s.seat_number} (${s.category})`).join(', ');
  const numberOfPersons = seats.length;
  const html = `
    <div style="font-family: sans-serif; max-width:520px; margin:auto;">
      <h2 style="color:#4340C9;">Booking Confirmed 🎟️</h2>
      <p>Hi ${customerName},</p>
      <p>Your booking for <strong>${event.title}</strong> on ${event.event_date} at ${event.event_time} is confirmed.</p>
      <p><strong>Booking Reference:</strong> ${bookingRef}<br/>
      <strong>Seats:</strong> ${seatList}<br/>
      <strong>Number of Persons:</strong> ${numberOfPersons}<br/>
      <strong>Total Paid:</strong> ₹${totalAmount.toFixed(0)}</p>
      <p>Show this QR code at entry — scanning it opens your digital ticket with full seat details:</p>
      <img src="${qrDataUrl}" alt="QR Code" style="width:200px;height:200px;" />
    </div>
  `;
  return sendMail({
    to,
    subject: `Booking Confirmed: ${event.title} (${bookingRef})`,
    html,
    attachments: [
      { filename: 'ticket-qr.png', content: qrDataUrl.split('base64,')[1] },
    ],
  });
}

async function sendWaitlistOffer({ to, customerName, event, seat, offerUrl, expiresAt }) {
  const html = `
    <div style="font-family: sans-serif; max-width:520px; margin:auto;">
      <h2 style="color:#4340C9;">A seat opened up! 🎉</h2>
      <p>Hi ${customerName},</p>
      <p>A <strong>${seat.category}</strong> seat for <strong>${event.title}</strong>
      (${event.event_date} ${event.event_time}) is now available for you.</p>
      <p>Complete your booking before <strong>${expiresAt}</strong> or it will be offered to the next person in line.</p>
      <p><a href="${offerUrl}" style="background:linear-gradient(135deg,#5b5cf0,#8b5cf6);color:#fff;
      padding:12px 24px;border-radius:999px;text-decoration:none;display:inline-block;">Complete Booking</a></p>
    </div>
  `;
  return sendMail({ to, subject: `Seat available for ${event.title} — act fast!`, html });
}

module.exports = { sendMail, sendBookingConfirmation, sendWaitlistOffer, verifyEmailConfig };
