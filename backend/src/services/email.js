// Sends email via Brevo's HTTP API (https://api.brevo.com/v3/smtp/email)
// instead of SMTP. Render's free tier blocks all outbound traffic on SMTP
// ports (25, 465, 465, 587) as of Sept 2025, so nodemailer/SMTP simply
// cannot work here -- the connection hangs until it times out. The HTTP
// API sends over normal HTTPS (port 443), which is not blocked, and uses
// the same Brevo account.

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_ACCOUNT_URL = 'https://api.brevo.com/v3/account';

function env(key) {
  const v = process.env[key];
  return v ? v.trim() : v;
}

function apiKey() {
  return env('BREVO_API_KEY');
}

// "Encore Tickets <no-reply@ticketbooking.local>" -> { name, email }
function parseSender() {
  const raw = env('SMTP_FROM') || '"Encore Tickets" <no-reply@ticketbooking.local>';
  const match = raw.match(/^"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim() || undefined, email: match[2].trim() };
  }
  return { email: raw };
}

// Runs once at server startup (see server.js) so you get a clear pass/fail
// log line right away instead of waiting for the first real booking.
async function verifyEmailConfig() {
  const key = apiKey();
  if (!key) {
    console.error(
      '[email] BREVO_API_KEY is not set -- emails will NOT be sent.\n' +
      '  Fix: in your Brevo account go to Settings -> SMTP & API -> API Keys tab, ' +
      'create a key, and add it as BREVO_API_KEY in Render -> your service -> Environment.'
    );
    return;
  }
  try {
    const res = await fetch(BREVO_ACCOUNT_URL, { headers: { 'api-key': key } });
    if (res.ok) {
      console.log('[email] Brevo API key OK -- real emails will be sent.');
    } else {
      const text = await res.text().catch(() => '');
      console.error(`[email] Brevo API key check FAILED (status ${res.status}): ${text}`);
    }
  } catch (err) {
    console.error('[email] Brevo API check errored:', err.message);
  }
}

async function sendMail({ to, subject, html, attachments }) {
  const key = apiKey();
  if (!key) {
    const err = new Error('BREVO_API_KEY not configured');
    console.error(`[email] FAILED to send "${subject}" to ${to}: ${err.message}`);
    throw err;
  }

  const body = {
    sender: parseSender(),
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };
  if (attachments && attachments.length) {
    // Brevo's API wants { name, content } where content is base64 (no data:
    // URL prefix) and name must end in a real file extension.
    body.attachment = attachments.map((a) => ({ name: a.filename, content: a.content }));
  }

  let res;
  try {
    res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'api-key': key },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[email] FAILED to send "${subject}" to ${to}. Network error: ${err.message}`);
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[email] FAILED to send "${subject}" to ${to}. Brevo status ${res.status}: ${text}`);
    throw new Error(`Brevo API error ${res.status}: ${text}`);
  }

  const data = await res.json().catch(() => ({}));
  console.log(`[email] Sent "${subject}" to ${to} (messageId: ${data.messageId || 'n/a'})`);
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
