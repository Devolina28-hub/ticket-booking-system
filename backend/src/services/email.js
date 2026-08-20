const nodemailer = require('nodemailer');

let transporterPromise = null;

// Lazily creates a transporter. If SMTP_HOST is not configured, we create a
// free Ethereal test account on the fly (no signup needed) and log a preview
// URL to the console instead of actually delivering to a real inbox -- this
// satisfies the "any free tier service" requirement out of the box while
// still letting a real SMTP provider be plugged in via .env.
async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (process.env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    }
    const testAccount = await nodemailer.createTestAccount();
    console.log('[email] No SMTP_HOST configured -- using Ethereal test inbox:', testAccount.user);
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
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Ticket Booking" <no-reply@ticketbooking.local>',
    to,
    subject,
    html,
    attachments,
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) console.log(`[email] Preview URL (${subject} -> ${to}): ${previewUrl}`);
  return { info, previewUrl };
}

async function sendBookingConfirmation({ to, customerName, event, seats, bookingRef, qrDataUrl, totalAmount }) {
  const seatList = seats.map((s) => `${s.row_label}${s.seat_number} (${s.category})`).join(', ');
  const qrCid = 'qrcode';
  const html = `
    <div style="font-family: sans-serif; max-width:520px; margin:auto;">
      <h2 style="color:#623D70;">Booking Confirmed 🎟️</h2>
      <p>Hi ${customerName},</p>
      <p>Your booking for <strong>${event.title}</strong> on ${event.event_date} at ${event.event_time} is confirmed.</p>
      <p><strong>Booking Reference:</strong> ${bookingRef}<br/>
      <strong>Seats:</strong> ${seatList}<br/>
      <strong>Total Paid:</strong> $${totalAmount.toFixed(2)}</p>
      <p>Show this QR code at entry:</p>
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
      <h2 style="color:#623D70;">A seat opened up! 🎉</h2>
      <p>Hi ${customerName},</p>
      <p>A <strong>${seat.category}</strong> seat for <strong>${event.title}</strong>
      (${event.event_date} ${event.event_time}) is now available for you.</p>
      <p>Complete your booking before <strong>${expiresAt}</strong> or it will be offered to the next person in line.</p>
      <p><a href="${offerUrl}" style="background:linear-gradient(135deg,#B77DB4,#623D70);color:#fff;
      padding:12px 24px;border-radius:999px;text-decoration:none;display:inline-block;">Complete Booking</a></p>
    </div>
  `;
  return sendMail({ to, subject: `Seat available for ${event.title} — act fast!`, html });
}

module.exports = { sendMail, sendBookingConfirmation, sendWaitlistOffer };
