const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

function generateBookingRef() {
  return 'BK-' + uuidv4().split('-')[0].toUpperCase();
}

// The QR encodes the ticket's own details as plain text (not a URL), so
// scanning it with any phone camera/QR reader shows the seat info directly
// in the scan result -- no webpage, no app, nothing to load.
async function generateQrDataUrl({ bookingRef, customerName, event, seats }) {
  const seatList = seats.map((s) => `${s.row_label}${s.seat_number} (${s.category})`).join(', ');
  const text = [
    'ENCORE TICKET',
    `Event: ${event.title}`,
    `Date: ${event.event_date} ${event.event_time}`,
    `Seats: ${seatList}`,
    `Booking Ref: ${bookingRef}`,
    `Name: ${customerName}`,
  ].join('\n');
  // errorCorrectionLevel 'M' + wider margin keeps it reliably scannable even
  // with this much text encoded (plain-text QRs need more modules than a URL).
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 340 });
}

module.exports = { generateBookingRef, generateQrDataUrl };
