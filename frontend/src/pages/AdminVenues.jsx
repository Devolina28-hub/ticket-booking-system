import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function AdminVenues() {
  const [venues, setVenues] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [layout, setLayout] = useState([{ row_label: 'A', seats: 8, category: 'Premium' }]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const data = await api.listVenues();
    setVenues(data.venues);
  }
  useEffect(() => { load(); }, []);

  function updateRow(i, key, value) {
    setLayout((l) => l.map((row, idx) => idx === i ? { ...row, [key]: value } : row));
  }

  async function createVenue(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await api.createVenue({
        name,
        address,
        layout: layout.map((r) => ({ row_label: r.row_label, seats: Number(r.seats), category: r.category })),
      });
      setSuccess('Venue created with seat layout!');
      setName(''); setAddress('');
      setLayout([{ row_label: 'A', seats: 8, category: 'Premium' }]);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="panel">
        <p className="eyebrow">Admin</p>
        <h1>Manage venues</h1>
        <p className="muted">Create venues and define their seat layout by row, count, and category.</p>
      </div>

      <div className="panel">
        <h2>New venue</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
        <form onSubmit={createVenue} className="stack">
          <div className="grid grid-2">
            <div className="field">
              <label>Venue name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>

          <p className="label-sm">Seat layout rows</p>
          {layout.map((row, i) => (
            <div className="grid grid-3" key={i}>
              <div className="field">
                <label>Row label</label>
                <input value={row.row_label} onChange={(e) => updateRow(i, 'row_label', e.target.value)} required />
              </div>
              <div className="field">
                <label>Seats in row</label>
                <input type="number" min="1" value={row.seats} onChange={(e) => updateRow(i, 'seats', e.target.value)} required />
              </div>
              <div className="field">
                <label>Category</label>
                <input value={row.category} onChange={(e) => updateRow(i, 'category', e.target.value)} required />
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => setLayout((l) => [...l, { row_label: '', seats: 8, category: 'Standard' }])}>
            + Add row
          </button>

          <button className="btn btn-primary btn-block">Create venue</button>
        </form>
      </div>

      <div className="panel">
        <h2>Existing venues</h2>
        <div className="stack">
          {venues.map((v) => (
            <div key={v.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(98,61,112,0.1)' }}>
              <strong>{v.name}</strong>
              <p className="muted" style={{ margin: 0 }}>{v.address}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
