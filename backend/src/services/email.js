const nodemailer = require('nodemailer');

let transporterPromise = null;

function env(key) {
  const v = process.env[key];
  return v ? v.trim() : v;
}

// Lazily creates a transporter. If SMTP_HOST is not configured, we create a
// free Ethereal test account on the fly (no signup needed) and log a preview
// URL to the console instead of actually delivering to a real inbox. If a
// real SMTP_HOST (e.g. Brevo) IS configured, we verify() the connection
// immediately and log a clear pass/fail message -- this is the single most
// useful diagnostic for "emails aren't sending", since createTransport()
// alone never throws even with wrong credentials; only verify()/sendMail()
// actually talk to the server and reveal auth problems.
async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    const host = env('SMTP_HOST');
    if (host) {
      const transporter = nodemailer.createTransport({
        host,
        port: Number(env('SMTP_PORT') || 587),
        secure: Number(env('SMTP_PORT')) === 465,
        auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
      });
      try {
        await transporter.verify();
        console.log(`[email] SMTP connection OK (${host}) -- real emails will be sent.`);
      } catch (err) {
        console.error(
          `[email] SMTP verification FAILED for ${host}. Emails will NOT be delivered until this is fixed.\n` +
          `  Reason: ${err.message}\n` +
          `  Common causes: (1) SMTP_USER/SMTP_PASS wrong or has extra spaces, ` +
          `(2) the SMTP_FROM address is not a VERIFIED sender in your Brevo account ` +
          `(Brevo -> Senders, Domains & Dedicated IPs -> Senders), ` +
          `(3) SMTP_PORT/host mismatch.`
        );
      }
      return transporter;
    }
    const testAccount = await nodemailer.createTestAccount();
    console.log('[email] No SMTP_HOST configured -- using Ethereal test inbox (emails are NOT real, only previewable):', testAccount.user);
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

async function sendMail({ to, subject, html, attachments }) {
  const transporter = await getTransporter();
  try {
    const info = await transporter.sendMail({
      from: env('SMTP_FROM') || '"Encore Tickets" <no-reply@ticketbooking.local>',
      to,
      subject,
      html,
      attachments,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[email] Ethereal preview (${subject} -> ${to}): ${previewUrl}`);
    } else {
      console.log(`[email] Sent "${subject}" to ${to} (messageId: ${info.messageId})`);
    }
    return { info, previewUrl };
  } catch (err) {
    console.error(
      `[email] FAILED to send "${subject}" to ${to}.\n` +
      `  Error: ${err.message}${err.response ? `\n  Server response: ${err.response}` : ''}`
    );
    throw err;
  }
}

async function sendBookingConfirmation({ to, customerName, event, seats, bookingRef, qrDataUrl, totalAmount }) {
  const seatList = seats.map((s) => `${s.row_label}${s.seat_number} (${s.category})`).join(', ');
  const qrCid = 'qrcode';
  const html = `
    <div style="font-family: sans-serif; max-width:520px; margin:auto;">
      <h2 style="color:#4340C9;">Booking Confirmed 🎟️</h2>
      <p>Hi ${customerName},</p>
      <p>Your booking for <strong>${event.title}</strong> on ${event.event_date} at ${event.event_time} is confirmed.</p>
      <p><strong>Booking Reference:</strong> ${bookingRef}<br/>
      <strong>Seats:</strong> ${seatList}<br/>
      <strong>Total Paid:</strong> ₹${totalAmount.toFixed(0)}</p>
      <p>Show this QR code at entry — scanning it opens a live ticket-status page:</p>
      <img src="cid:${qrCid}" alt="QR Code" style="width:200px;height:200px;" />
    </div>
  `;
  return sendMail({
    to,
    subject: `Booking Confirmed: ${event.title} (${bookingRef})`,
    html,
    attachments: [
      {
        filename: 'ticket-qr.png',
        content: qrDataUrl.split('base64,')[1],
        encoding: 'base64',
        cid: qrCid,
      },
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

module.exports = { sendMail, sendBookingConfirmation, sendWaitlistOffer };
