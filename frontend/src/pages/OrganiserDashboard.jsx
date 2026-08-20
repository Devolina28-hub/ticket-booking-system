import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function OrganiserDashboard() {
  const [venues, setVenues] = useState([]);
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', type: 'movie', venue_id: '', event_date: '', event_time: '' });
  const [pricing, setPricing] = useState([{ category: 'Premium', price: 25 }, { category: 'Standard', price: 15 }]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedSummary, setSelectedSummary] = useState(null);

  async function load() {
    const [venueData, eventData] = await Promise.all([api.listVenues(), api.listEvents()]);
    setVenues(venueData.venues);
    setEvents(eventData.events);
  }

  useEffect(() => { load(); }, []);

  function updateForm(key, value) { setForm((f) => ({ ...f, [key]: value })); }
  function updatePricing(i, key, value) {
    setPricing((p) => p.map((row, idx) => idx === i ? { ...row, [key]: value } : row));
  }

  async function createEvent(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await api.createEvent({
        ...form,
        venue_id: Number(form.venue_id),
        pricing: pricing.map((p) => ({ category: p.category, price: Number(p.price) })),
      });
      setSuccess('Event created!');
      setForm({ title: '', description: '', type: 'movie', venue_id: '', event_date: '', event_time: '' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function viewSummary(eventId) {
    const data = await api.eventSummary(eventId);
    setSelectedSummary(data);
  }

  return (
    <div>
      <div className="panel">
        <h1>Organiser dashboard</h1>
        <p className="muted">Create movie or event listings and track revenue.</p>
      </div>

      <div className="panel">
        <h2>Create a new listing</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
        <form onSubmit={createEvent} className="stack">
          <div className="grid grid-2">
            <div className="field">
              <label>Title</label>
              <input value={form.title} onChange={(e) => updateForm('title', e.target.value)} required />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={form.type} onChange={(e) => updateForm('type', e.target.value)}>
                <option value="movie">Movie</option>
                <option value="concert">Concert</option>
                <option value="event">Other event</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => updateForm('description', e.target.value)} />
          </div>
          <div className="grid grid-3">
            <div className="field">
              <label>Venue</label>
              <select value={form.venue_id} onChange={(e) => updateForm('venue_id', e.target.value)} required>
                <option value="">Select venue…</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={form.event_date} onChange={(e) => updateForm('event_date', e.target.value)} required />
            </div>
            <div className="field">
              <label>Time</label>
              <input type="time" value={form.event_time} onChange={(e) => updateForm('event_time', e.target.value)} required />
            </div>
          </div>

          <p className="label-sm">Per-category pricing</p>
          {pricing.map((p, i) => (
            <div className="grid grid-2" key={i}>
              <div className="field">
                <label>Category</label>
                <input value={p.category} onChange={(e) => updatePricing(i, 'category', e.target.value)} required />
              </div>
              <div className="field">
                <label>Price ($)</label>
                <input type="number" min="0" step="0.01" value={p.price} onChange={(e) => updatePricing(i, 'price', e.target.value)} required />
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => setPricing((p) => [...p, { category: '', price: 0 }])}>
            + Add category
          </button>

          <button className="btn btn-primary btn-block">Create listing</button>
        </form>
      </div>

      <div className="panel">
        <h2>Your listings</h2>
        <div className="stack">
          {events.map((ev) => (
            <div key={ev.id} className="row-between" style={{ padding: '12px 0', borderBottom: '1px solid rgba(98,61,112,0.1)' }}>
              <div>
                <strong>{ev.title}</strong>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>{ev.venue_name} · {ev.event_date}</p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => viewSummary(ev.id)}>View revenue</button>
            </div>
          ))}
        </div>
      </div>

      {selectedSummary && (
        <div className="panel">
          <h2>{selectedSummary.event.title} — Summary</h2>
          <p style={{ fontWeight: 700, fontSize: '1.3rem' }}>Revenue: ${selectedSummary.revenue.toFixed(2)}</p>
          <div className="grid grid-4" style={{ marginBottom: 20 }}>
            {selectedSummary.seatCounts.map((sc, i) => (
              <div className={`feature-card fc-${(i % 4) + 1}`} key={sc.status}>
                <h4>{sc.status}</h4>
                <p>{sc.count} seats</p>
              </div>
            ))}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid rgba(98,61,112,0.15)' }}>
                <th style={{ padding: 8 }}>Ref</th><th style={{ padding: 8 }}>Customer</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {selectedSummary.bookings.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid rgba(98,61,112,0.08)' }}>
                  <td style={{ padding: 8 }}>{b.booking_ref}</td>
                  <td style={{ padding: 8 }}>{b.customer_name}</td>
                  <td style={{ padding: 8 }}>{b.status}</td>
                  <td style={{ padding: 8 }}>${b.total_amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
