const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

function generateBookingRef() {
  return 'BK-' + uuidv4().split('-')[0].toUpperCase();
}

// The QR encodes a URL to the standalone ticket-display page (see
// frontend/src/pages/TicketVerify.jsx), which renders full-screen with no
// site navigation/branding -- so scanning it looks like a proper digital
// ticket, not "the app opening". Requires frontend/vercel.json's SPA
// rewrite so a direct hit to this URL (not client-side navigation) serves
// index.html instead of a 404.
async function generateQrDataUrl(bookingRef) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://ticket-booking-system-delta-six.vercel.app';
  const verifyUrl = `${frontendUrl.replace(/\/$/, '')}/ticket/${bookingRef}`;
  return QRCode.toDataURL(verifyUrl, { errorCorrectionLevel: 'M', margin: 1, width: 300 });
}

module.exports = { generateBookingRef, generateQrDataUrl };
