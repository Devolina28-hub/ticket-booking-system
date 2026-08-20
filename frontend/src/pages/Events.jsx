import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (type) params.type = type;
      if (q) params.q = q;
      const data = await api.listEvents(params);
      setEvents(data.events);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [type]);

  return (
    <div>
      <div className="panel">
        <h1>Find your next night out</h1>
        <p className="muted">Browse movies and concerts, pick your seats on a live seat map, and get a QR ticket by email.</p>
        <div className="row-between" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['', 'movie', 'concert', 'event'].map((t) => (
              <button
                key={t}
                className={`btn btn-sm ${type === t ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setType(t)}
              >
                {t === '' ? 'All' : t[0].toUpperCase() + t.slice(1) + 's'}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Search title…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid rgba(98,61,112,0.25)', background: 'rgba(255,255,255,0.6)' }}
            />
            <button className="btn btn-secondary btn-sm">Search</button>
          </form>
        </div>
      </div>

      {loading ? (
        <div className="center-text"><div className="spinner" style={{ margin: '40px auto' }} /></div>
      ) : events.length === 0 ? (
        <div className="panel center-text"><p>No events found. Try a different filter.</p></div>
      ) : (
        <div className="grid grid-3">
          {events.map((ev) => {
            const totalAvailable = ev.availability.reduce((sum, a) => sum + a.available, 0);
            const soldOut = totalAvailable === 0;
            return (
              <Link to={`/events/${ev.id}`} className="event-card" key={ev.id}>
                <span className="pill-badge" style={{ marginBottom: 10, display: 'inline-block' }}>{ev.type}</span>
                <h3 style={{ marginBottom: 4 }}>{ev.title}</h3>
                <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                  {ev.venue_name} · {ev.event_date} at {ev.event_time}
                </p>
                <div className="row-between">
                  <span className="label-sm">
                    {ev.pricing.map((p) => `${p.category} $${p.price}`).join(' · ')}
                  </span>
                  {soldOut ? (
                    <span className="pill-badge" style={{ background: 'rgba(178,40,60,0.15)', color: '#7a1f30' }}>Sold out</span>
                  ) : (
                    <span className="pill-badge">{totalAvailable} seats left</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
