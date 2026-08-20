import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function BookingHistory() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await api.myBookings();
      setBookings(data.bookings);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function cancel(bookingId) {
    if (!confirm('Cancel this booking? The seat will be released and, if there is a waitlist, offered to the next customer.')) return;
    setError('');
    try {
      await api.cancelBooking(bookingId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div className="center-text"><div className="spinner" style={{ margin: '60px auto' }} /></div>;

  return (
    <div>
      <div className="panel">
        <h1>My bookings</h1>
        <p className="muted">Your confirmed and past tickets.</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {bookings.length === 0 ? (
        <div className="panel center-text"><p>No bookings yet. Go find something fun to see!</p></div>
      ) : (
        <div className="stack">
          {bookings.map((b) => (
            <div className="panel" key={b.id} style={{ marginBottom: 0 }}>
              <div className="row-between">
                <div>
                  <span className={`pill-badge`} style={b.status === 'cancelled' ? { background: 'rgba(178,40,60,0.15)', color: '#7a1f30' } : {}}>
                    {b.status}
                  </span>
                  <h3 style={{ margin: '8px 0 4px' }}>{b.title}</h3>
                  <p className="muted" style={{ margin: 0 }}>{b.venue_name} · {b.event_date} at {b.event_time}</p>
                  <p className="muted" style={{ margin: '4px 0' }}>
                    Seats: {b.seats.map((s) => `${s.row_label}${s.seat_number} (${s.category})`).join(', ')}
                  </p>
                  <p style={{ fontWeight: 700, margin: 0 }}>${b.total_amount.toFixed(2)} · Ref {b.booking_ref}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                  {b.qr_data_url && <img src={b.qr_data_url} alt="QR" style={{ width: 90, borderRadius: 10 }} />}
                  {b.status === 'confirmed' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => cancel(b.id)}>Cancel booking</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
