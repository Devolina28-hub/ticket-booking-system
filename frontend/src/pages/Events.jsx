import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import PosterImageLayer from '../components/PosterImageLayer.jsx';

const POSTER_CLASSES = ['p1', 'p2', 'p3', 'p4'];

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

  // The Featured Experience card highlights one specific show rather than
  // just "whichever event sorts first" -- change FEATURED_TITLE_MATCH to
  // feature a different show later.
  const FEATURED_TITLE_MATCH = 'rocky aur rani';
  const featured = events.find((e) => e.title.toLowerCase().includes(FEATURED_TITLE_MATCH)) || events[0];

  return (
    <div>
      <section className="hero">
        <div>
          <p className="eyebrow">Your seat. Your experience.</p>
          <h1>Find your next <em>moment.</em></h1>
          <p style={{ maxWidth: 480 }}>
            Discover movies, concerts and live events. Choose your seat, secure it for a few minutes,
            and get your digital QR ticket instantly.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); load(); }}
            style={{ display: 'flex', background: '#fff', border: '1px solid var(--line)', padding: 7, borderRadius: 13, marginTop: 26, boxShadow: 'var(--shadow)', maxWidth: 480 }}
          >
            <input
              placeholder="Search movies, concerts & events…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: 1, border: 0, outline: 0, padding: '12px 14px', background: 'transparent' }}
            />
            <button className="btn btn-dark">Search</button>
          </form>
        </div>
        <div className="hero-art">
          <PosterImageLayer title={featured?.title} posterUrl={featured?.poster_url} />
          <div className="hero-card">
            <small>FEATURED EXPERIENCE</small>
            <h2>{featured ? featured.title : 'Discover something new'}</h2>
            <p>{featured ? `${featured.event_date} · ${featured.event_time}` : 'Browse what’s on right now'}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="row-between" style={{ marginBottom: 20 }}>
          <h2>Trending now</h2>
          <span className="muted" style={{ fontSize: 13 }}>Curated for you</span>
        </div>
        <div className="filters">
          {['', 'movie', 'concert', 'event'].map((t) => (
            <button
              key={t}
              className={`filter-pill ${type === t ? 'active' : ''}`}
              onClick={() => setType(t)}
            >
              {t === '' ? 'All' : t[0].toUpperCase() + t.slice(1) + 's'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="center-text"><div className="spinner" style={{ margin: '40px auto' }} /></div>
        ) : events.length === 0 ? (
          <div className="panel center-text"><p>No events found. Try a different filter.</p></div>
        ) : (
          <div className="grid grid-4">
            {events.map((ev, i) => {
              const totalAvailable = ev.availability.reduce((sum, a) => sum + a.available, 0);
              const soldOut = totalAvailable === 0;
              const posterClass = POSTER_CLASSES[i % POSTER_CLASSES.length];
              const minPrice = ev.pricing.length ? Math.min(...ev.pricing.map((p) => p.price)) : null;
              return (
                <Link to={`/events/${ev.id}`} className="event-card" key={ev.id}>
                  <div className={`poster ${posterClass}`}>
                    <PosterImageLayer title={ev.title} posterUrl={ev.poster_url} />
                    <div className="poster-content">
                      <small>{ev.type.toUpperCase()}</small>
                      <strong>{ev.title}</strong>
                    </div>
                  </div>
                  <div className="event-info">
                    <h3>{ev.title}</h3>
                    <p>{ev.venue_name} · {ev.event_date} · {ev.event_time}</p>
                    <div className="row-between" style={{ marginTop: 10 }}>
                      {minPrice !== null && <div className="event-price">From ₹{minPrice.toFixed(0)}</div>}
                      {soldOut ? (
                        <span className="pill-badge danger">Sold out</span>
                      ) : (
                        <span className="pill-badge">{totalAvailable} left</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
