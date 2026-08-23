import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';

// Standalone page — deliberately rendered outside the app-shell/Navbar (see
// App.jsx) so that scanning the ticket QR shows the seat details immediately,
// full-screen, rather than looking like the whole booking site loading.
const wrapStyle = {
  minHeight: '100vh',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: 'var(--surface2)',
  fontFamily: 'var(--font-body, sans-serif)',
  boxSizing: 'border-box',
};

export default function TicketVerify() {
  const { bookingRef } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.verifyTicket(bookingRef).then(setResult).finally(() => setLoading(false));
  }, [bookingRef]);

  if (loading) {
    return (
      <div style={wrapStyle}>
        <div className="spinner" />
      </div>
    );
  }

  if (!result || !result.found) {
    return (
      <div style={wrapStyle}>
        <div className="panel center-text" style={{ maxWidth: 420, width: '100%' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>❓</div>
          <h2 style={{ color: 'var(--red)' }}>Ticket not found</h2>
          <p className="muted">No booking matches reference <strong>{bookingRef}</strong>.</p>
        </div>
      </div>
    );
  }

  const { booking, seats } = result;
  const isValid = result.valid;

  return (
    <div style={wrapStyle}>
      <div className="panel" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>{isValid ? '✅' : '⛔'}</div>
        <h2 style={{ color: isValid ? 'var(--green)' : 'var(--red)', marginBottom: 4 }}>
          {isValid ? 'Valid Ticket' : 'Invalid Ticket — Cancelled'}
        </h2>
        <p className="muted" style={{ marginBottom: 20 }}>Reference {booking.booking_ref}</p>

        <div style={{ textAlign: 'left', background: 'var(--surface2)', borderRadius: 14, padding: 20 }}>
          <h3 style={{ marginBottom: 4 }}>{booking.title}</h3>
          <p className="muted" style={{ margin: '2px 0' }}>{booking.venue_name}</p>
          <p className="muted" style={{ margin: '2px 0' }}>{booking.event_date} at {booking.event_time}</p>
          <p style={{ margin: '10px 0 2px', fontWeight: 700, fontSize: 16 }}>
            Seats: {seats.map((s) => `${s.row_label}${s.seat_number} (${s.category})`).join(', ')}
          </p>
          <p style={{ margin: '10px 0 0', fontWeight: 700 }}>
            Ticket holder: {booking.customer_name}
          </p>
        </div>

        {!isValid && (
          <p style={{ marginTop: 18, color: 'var(--red)', fontWeight: 700 }}>
            This booking was cancelled and is not valid for entry.
          </p>
        )}
      </div>
    </div>
  );
}
