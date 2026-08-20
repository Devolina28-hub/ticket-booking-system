const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

function generateBookingRef() {
  return 'BK-' + uuidv4().split('-')[0].toUpperCase();
}

// The QR encodes the booking reference (plus event id) so a scanner/admin
// can look up the booking. Returned as a data URL, stored directly in the DB
// and also embedded in the confirmation email.
async function generateQrDataUrl(payload) {
  const text = JSON.stringify(payload);
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 300 });
}

module.exports = { generateBookingRef, generateQrDataUrl };
