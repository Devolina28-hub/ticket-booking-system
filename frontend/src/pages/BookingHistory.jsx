import { useEffect, useState } from 'react';
import { api } from '../api.js';

const ICONS = {
  check: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.3 2.3L16 9.5" />
    </svg>
  ),
  cross: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  ),
  seat: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5" />
      <path d="M4 12h13a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" />
      <path d="M6 18v2M17 18v2" />
    </svg>
  ),
  rupee: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h12M6 4c4.5 0 8 1.2 8 4.5S10.5 13 6 13h9L7 20" />
    </svg>
  ),
};

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
    <div className="tickets-page">
      <div className="panel">
        <p className="eyebrow">Your tickets</p>
        <h1>My bookings</h1>
        <p className="muted">Your confirmed and past tickets.</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {bookings.length === 0 ? (
        <div className="panel center-text"><p>No bookings yet. Go find something fun to see!</p></div>
      ) : (
        <div className="stack">
          {bookings.map((b) => {
            const cancelled = b.status === 'cancelled';
            return (
              <div className="ticket-card" key={b.id}>
                <div className="ticket-banner">
                  <h3>{b.title}</h3>
                  <p>{b.venue_name}</p>
                  <p>{b.event_date} · {b.event_time}</p>
                </div>
                <div className="ticket-body">
                  {cancelled && <span className="ticket-watermark">Cancelled</span>}
                  <div className="ticket-body-left">
                    <span className={`pill-badge-icon ${cancelled ? 'danger' : 'success'}`}>
                      {cancelled ? ICONS.cross : ICONS.check}
                      {b.status.toUpperCase()}
                    </span>
                    <div className="ticket-info-row">
                      <span className="ticket-info-icon">{ICONS.seat}</span>
                      <span>Seats: {b.seats.map((s) => `${s.row_label}${s.seat_number} (${s.category})`).join(', ')}</span>
                    </div>
                    <div className="ticket-info-row">
                      <span className="ticket-info-icon">{ICONS.rupee}</span>
                      <span>₹{b.total_amount.toFixed(0)} · Ref {b.booking_ref}</span>
                    </div>
                  </div>
                  <div className="ticket-body-right">
                    {b.qr_data_url && <img src={b.qr_data_url} alt="QR" className="ticket-qr" />}
                    {!cancelled && (
                      <button className="btn btn-secondary btn-sm" onClick={() => cancel(b.id)}>Cancel booking</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
