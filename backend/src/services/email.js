// Sends email via EmailJS's REST API (https://api.emailjs.com/api/v1.0/email/send),
// which relays through a real connected Gmail account rather than a transactional
// provider. Render's free tier blocks all outbound traffic on SMTP ports (25, 465,
// 587) as of Sept 2025, so nodemailer/SMTP simply cannot work here -- the connection
// hangs until it times out. EmailJS's API sends over normal HTTPS (port 443), which
// is not blocked.
//
// Unlike Resend/Brevo/etc, EmailJS needs no domain verification -- it authenticates
// as the actual Gmail account you connected via OAuth in the EmailJS dashboard, so it
// can deliver to any real recipient from day one. Trade-off: the free tier caps out
// at 200 requests/month, and does NOT support real file attachments (needs their paid
// Personal plan). We don't need attachments anyway -- the QR code is already embedded
// as an inline base64 <img> in the HTML body (see sendBookingConfirmation below), which
// works on the free tier and displays identically in the recipient's inbox.
//
// EmailJS sends via a pre-built template with named placeholders (not raw HTML per
// request) -- the template in the EmailJS dashboard should contain exactly one field,
// {{message_html}}, so this file stays in full control of the actual email content.

const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

function env(key) {
  const v = process.env[key];
  return v ? v.trim() : v;
}

function config() {
  return {
    serviceId: env('EMAILJS_SERVICE_ID'),
    templateId: env('EMAILJS_TEMPLATE_ID'),
    publicKey: env('EMAILJS_PUBLIC_KEY'),
    privateKey: env('EMAILJS_PRIVATE_KEY'),
  };
}

// Runs once at server startup (see server.js) so you get a clear pass/fail
// log line right away instead of waiting for the first real booking.
async function verifyEmailConfig() {
  const { serviceId, templateId, publicKey, privateKey } = config();
  const missing = [
    !serviceId && 'EMAILJS_SERVICE_ID',
    !templateId && 'EMAILJS_TEMPLATE_ID',
    !publicKey && 'EMAILJS_PUBLIC_KEY',
    !privateKey && 'EMAILJS_PRIVATE_KEY',
  ].filter(Boolean);

  if (missing.length) {
    console.error(
      `[email] Missing ${missing.join(', ')} -- emails will NOT be sent.\n` +
      '  Fix: in your EmailJS dashboard, get the Service ID (Email Services), Template ID ' +
      '(Email Templates), Public Key (Account -> API Keys), and Private Key ' +
      '(Account -> Security), then add all four in Render -> your service -> Environment.'
    );
    return;
  }
  console.log(
    '[email] EmailJS credentials present -- real emails will be sent via ' +
    'your connected Gmail account (no domain verification needed, 200/month free tier).'
  );
}

async function sendMail({ to, subject, html }) {
  const { serviceId, templateId, publicKey, privateKey } = config();
  if (!serviceId || !templateId || !publicKey || !privateKey) {
    const err = new Error('EmailJS is not fully configured (missing service/template/public/private key)');
    console.error(`[email] FAILED to send "${subject}" to ${to}: ${err.message}`);
    throw err;
  }

  const body = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    accessToken: privateKey,
    template_params: {
      to_email: to,
      subject,
      message_html: html,
    },
  };

  let res;
  try {
    res = await fetch(EMAILJS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[email] FAILED to send "${subject}" to ${to}. Network error: ${err.message}`);
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[email] FAILED to send "${subject}" to ${to}. EmailJS status ${res.status}: ${text}`);
    throw new Error(`EmailJS API error ${res.status}: ${text}`);
  }

  console.log(`[email] Sent "${subject}" to ${to} via EmailJS.`);
  return { ok: true };
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
