import { useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUS_LABEL = {
  waiting: 'Waiting in queue',
  offered: 'Offer available — act now!',
  expired: 'Offer expired',
  booked: 'Booked',
  cancelled: 'Cancelled',
};

export default function MyWaitlist() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.myWaitlist();
      setEntries(data.entries);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  async function complete(id) {
    setBusyId(id);
    setError('');
    try {
      await api.completeWaitlistOffer(id);
      await load();
      alert('Booking confirmed! Check My Bookings for your QR ticket.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="center-text"><div className="spinner" style={{ margin: '60px auto' }} /></div>;

  return (
    <div>
      <div className="panel">
        <h1>My waitlist</h1>
        <p className="muted">When a seat opens up, you'll get a time-limited offer here and by email.</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {entries.length === 0 ? (
        <div className="panel center-text"><p>You're not on any waitlists right now.</p></div>
      ) : (
        <div className="stack">
          {entries.map((e) => (
            <div className="panel" key={e.id} style={{ marginBottom: 0 }}>
              <div className="row-between">
                <div>
                  <span className="pill-badge">{e.category}</span>
                  <h3 style={{ margin: '8px 0 4px' }}>{e.title}</h3>
                  <p className="muted" style={{ margin: 0 }}>{e.event_date} at {e.event_time}</p>
                  <p style={{ fontWeight: 700, margin: '6px 0 0' }}>{STATUS_LABEL[e.status] || e.status}</p>
                  {e.status === 'offered' && e.offer_expires_at && (
                    <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                      Offer expires: {new Date(e.offer_expires_at).toLocaleString()}
                    </p>
                  )}
                </div>
                {e.status === 'offered' && (
                  <button className="btn btn-primary" disabled={busyId === e.id} onClick={() => complete(e.id)}>
                    {busyId === e.id ? 'Booking…' : 'Complete booking'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
