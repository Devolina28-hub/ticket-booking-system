const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

function generateBookingRef() {
  return 'BK-' + uuidv4().split('-')[0].toUpperCase();
}

// The QR encodes a real URL to the public ticket-verification page, so
// scanning it with a phone camera opens a page showing live booking status
// (valid / cancelled / not found) instead of raw, unreadable JSON text.
async function generateQrDataUrl(bookingRef) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const verifyUrl = `${frontendUrl.replace(/\/$/, '')}/ticket/${bookingRef}`;
  return QRCode.toDataURL(verifyUrl, { errorCorrectionLevel: 'M', margin: 1, width: 300 });
}

module.exports = { generateBookingRef, generateQrDataUrl };
