import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function AdminVenues() {
  const [venues, setVenues] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [layout, setLayout] = useState([{ row_label: 'A', seats: 8, category: 'Premium' }]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const listRef = useRef(null);
  const newItemRef = useRef(null);

  async function load() {
    const data = await api.listVenues();
    setVenues(data.venues);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (highlightId && newItemRef.current) {
      newItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = setTimeout(() => setHighlightId(null), 2200);
      return () => clearTimeout(t);
    }
  }, [highlightId, venues]);

  function updateRow(i, key, value) {
    setLayout((l) => l.map((row, idx) => idx === i ? { ...row, [key]: value } : row));
  }

  async function createVenue(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      const { venue: created } = await api.createVenue({
        name,
        address,
        layout: layout.map((r) => ({ row_label: r.row_label, seats: Number(r.seats), category: r.category })),
      });
      setSuccess('Venue added successfully.');
      setName(''); setAddress('');
      setLayout([{ row_label: 'A', seats: 8, category: 'Premium' }]);
      await load();
      if (created?.id) {
        setHighlightId(created.id);
      } else {
        listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteVenue(v) {
    const confirmed = window.confirm(`Delete "${v.name}"? This can't be undone.`);
    if (!confirmed) return;
    setDeleteError('');
    setDeletingId(v.id);
    try {
      await api.deleteVenue(v.id);
      await load();
    } catch (err) {
      // Backend returns a 409 with a clear explanation when bookings exist
      // for the venue or any event under it -- surfaced here verbatim.
      setDeleteError(err.message);
    } finally {
      setDeletingId(null);
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

      <div className="panel" ref={listRef}>
        <h2>Existing venues</h2>
        {deleteError && <div className="alert alert-error">{deleteError}</div>}
        <div className="stack">
          {venues.map((v) => (
            <div
              key={v.id}
              ref={v.id === highlightId ? newItemRef : null}
              className={`row-between listing-row${v.id === highlightId ? ' listing-row-new' : ''}`}
              style={{ padding: '10px 0' }}
            >
              <div>
                <strong>{v.name}</strong>
                <p className="muted" style={{ margin: 0 }}>{v.address}</p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                disabled={deletingId === v.id}
                onClick={() => deleteVenue(v)}
                style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
              >
                {deletingId === v.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
