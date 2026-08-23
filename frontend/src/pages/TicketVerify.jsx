import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';

export default function TicketVerify() {
  const { bookingRef } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.verifyTicket(bookingRef).then(setResult).finally(() => setLoading(false));
  }, [bookingRef]);

  if (loading) {
    return <div className="center-text"><div className="spinner" style={{ margin: '80px auto' }} /></div>;
  }

  if (!result || !result.found) {
    return (
      <div className="panel center-text" style={{ maxWidth: 480, margin: '60px auto' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>❓</div>
        <h2 style={{ color: 'var(--red)' }}>Ticket not found</h2>
        <p className="muted">No booking matches reference <strong>{bookingRef}</strong>.</p>
      </div>
    );
  }

  const { booking, seats } = result;
  const isValid = result.valid;

  return (
    <div className="panel" style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 44, marginBottom: 8 }}>{isValid ? '✅' : '⛔'}</div>
      <h2 style={{ color: isValid ? 'var(--green)' : 'var(--red)' }}>
        {isValid ? 'Valid Ticket' : 'Invalid Ticket — Cancelled'}
      </h2>
      <p className="muted" style={{ marginBottom: 20 }}>Reference {booking.booking_ref}</p>

      <div style={{ textAlign: 'left', background: 'var(--surface2)', borderRadius: 14, padding: 20 }}>
        <h3 style={{ marginBottom: 4 }}>{booking.title}</h3>
        <p className="muted" style={{ margin: '2px 0' }}>{booking.venue_name}</p>
        <p className="muted" style={{ margin: '2px 0' }}>{booking.event_date} at {booking.event_time}</p>
        <p className="muted" style={{ margin: '2px 0' }}>
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
  );
}
