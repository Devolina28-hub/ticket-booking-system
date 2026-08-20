import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, getUser } from '../api.js';
import SeatGrid from '../components/SeatGrid.jsx';

export default function EventSeatMap() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = getUser();

  const [event, setEvent] = useState(null);
  const [pricing, setPricing] = useState([]);
  const [seats, setSeats] = useState([]);
  const [selected, setSelected] = useState([]);
  const [holdExpiresAt, setHoldExpiresAt] = useState(null);
  const [remainingSec, setRemainingSec] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const pollRef = useRef(null);

  const loadEvent = useCallback(async () => {
    const data = await api.getEvent(id);
    setEvent(data.event);
    setPricing(data.pricing);
    setSeats(data.seats);
  }, [id]);

  useEffect(() => {
    loadEvent();
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.getSeats(id);
        setSeats(data.seats);
      } catch { /* ignore transient errors */ }
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [id, loadEvent]);

  // Countdown for the active hold
  useEffect(() => {
    if (!holdExpiresAt) { setRemainingSec(null); return; }
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(holdExpiresAt) - new Date()) / 1000));
      setRemainingSec(diff);
      if (diff === 0) {
        setSelected([]);
        setHoldExpiresAt(null);
        setError('Your seat hold expired and was released. Please select seats again.');
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [holdExpiresAt]);

  function priceFor(category) {
    const p = pricing.find((x) => x.category === category);
    return p ? p.price : 0;
  }

  async function toggleSeat(seat) {
    if (!user) { navigate('/login'); return; }
    if (user.role !== 'customer') { setError('Only customer accounts can book seats.'); return; }
    setError('');

    if (selected.some((s) => s.id === seat.id)) {
      // Deselect: release just this seat if we already hold it
      if (holdExpiresAt) {
        try { await api.releaseSeats(id, [seat.id]); } catch { /* ignore */ }
      }
      setSelected((sel) => sel.filter((s) => s.id !== seat.id));
      return;
    }

    if (seat.status !== 'available') return;

    const newSelection = [...selected, seat];
    setBusy(true);
    try {
      const data = await api.holdSeats(id, newSelection.map((s) => s.id));
      setSelected(newSelection);
      setHoldExpiresAt(data.hold_expires_at);
      const seatsData = await api.getSeats(id);
      setSeats(seatsData.seats);
    } catch (err) {
      setError(err.message);
      const seatsData = await api.getSeats(id);
      setSeats(seatsData.seats);
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    setBusy(true);
    setError('');
    try {
      const data = await api.confirmBooking({ event_id: Number(id), seat_ids: selected.map((s) => s.id) });
      setConfirmedBooking(data.booking);
      setSelected([]);
      setHoldExpiresAt(null);
      const seatsData = await api.getSeats(id);
      setSeats(seatsData.seats);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinWaitlist(category) {
    if (!user) { navigate('/login'); return; }
    try {
      const data = await api.joinWaitlist({ event_id: Number(id), category });
      setError('');
      alert(`You're on the waitlist for ${category} (position ${data.position}). We'll email you if a seat opens up.`);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!event) return <div className="center-text"><div className="spinner" style={{ margin: '60px auto' }} /></div>;

  const total = selected.reduce((sum, s) => sum + priceFor(s.category), 0);
  const categoryAvailability = {};
  for (const s of seats) {
    categoryAvailability[s.category] = categoryAvailability[s.category] || { available: 0, total: 0 };
    categoryAvailability[s.category].total++;
    if (s.status === 'available') categoryAvailability[s.category].available++;
  }

  if (confirmedBooking) {
    return (
      <div className="panel" style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
        <h2>Booking confirmed 🎟️</h2>
        <p className="muted">Reference: <strong>{confirmedBooking.booking_ref}</strong></p>
        {confirmedBooking.qr_data_url && (
          <img src={confirmedBooking.qr_data_url} alt="QR ticket" style={{ width: 220, margin: '20px auto', borderRadius: 16 }} />
        )}
        <p className="muted">A confirmation with this QR code has also been emailed to you.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/my-bookings')}>View my bookings</button>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Browse more events</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="panel">
        <span className="pill-badge">{event.type}</span>
        <h1 style={{ marginTop: 10 }}>{event.title}</h1>
        <p className="muted">{event.venue_name} · {event.venue_address}</p>
        <p className="muted">{event.event_date} at {event.event_time}</p>
        {event.description && <p>{event.description}</p>}

        <div className="grid grid-4" style={{ marginTop: 20 }}>
          {pricing.map((p, i) => {
            const avail = categoryAvailability[p.category] || { available: 0, total: 0 };
            return (
              <div className={`feature-card fc-${(i % 4) + 1}`} key={p.category}>
                <div>
                  <h4>{p.category}</h4>
                  <p>${p.price.toFixed(2)} per seat</p>
                </div>
                {avail.available === 0 ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => joinWaitlist(p.category)}>Join waitlist</button>
                ) : (
                  <p style={{ margin: 0, fontWeight: 700 }}>{avail.available} / {avail.total} available</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="row-between">
          <h2>Select your seats</h2>
          {remainingSec !== null && (
            <span className="pill-badge">Hold expires in {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}</span>
          )}
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <SeatGrid seats={seats} selectedIds={selected.map((s) => s.id)} onToggle={toggleSeat} />
      </div>

      {selected.length > 0 && (
        <div className="panel">
          <div className="row-between">
            <div>
              <p className="label-sm">Selected seats</p>
              <p style={{ fontWeight: 700 }}>
                {selected.map((s) => `${s.row_label}${s.seat_number}`).join(', ')} — ${total.toFixed(2)}
              </p>
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={checkout}>
              {busy ? 'Booking…' : `Confirm booking · $${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
