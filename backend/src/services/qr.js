const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

function generateBookingRef() {
  return 'BK-' + uuidv4().split('-')[0].toUpperCase();
}

function generatePaymentRef() {
  return 'PAY-' + uuidv4().split('-')[0].toUpperCase();
}

// Shared helper: turns any app-relative path into a QR pointing at it on the
// deployed frontend. Requires frontend/vercel.json's SPA rewrite so a direct
// hit to that URL (not client-side navigation) serves index.html instead of
// a 404.
async function generateQrForPath(path) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://ticket-booking-system-delta-six.vercel.app';
  const url = `${frontendUrl.replace(/\/$/, '')}${path}`;
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 300 });
}

// The ticket QR encodes a URL to the standalone ticket-display page (see
// frontend/src/pages/TicketVerify.jsx), which renders full-screen with no
// site navigation/branding -- so scanning it looks like a proper digital
// ticket, not "the app opening".
async function generateQrDataUrl(bookingRef) {
  return generateQrForPath(`/ticket/${bookingRef}`);
}

// The payment QR encodes a URL to the standalone scan-to-pay confirmation
// page (see frontend/src/pages/PayConfirm.jsx).
async function generatePaymentQrDataUrl(paymentRef) {
  return generateQrForPath(`/pay/${paymentRef}`);
}

module.exports = {
  generateBookingRef,
  generateQrDataUrl,
  generatePaymentRef,
  generatePaymentQrDataUrl,
  generateQrForPath,
};
