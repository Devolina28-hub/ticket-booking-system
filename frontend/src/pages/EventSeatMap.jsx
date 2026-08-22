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
  const fee = selected.length ? 2 : 0;
  const grandTotal = total + fee;

  const categoryAvailability = {};
  for (const s of seats) {
    categoryAvailability[s.category] = categoryAvailability[s.category] || { available: 0, total: 0 };
    categoryAvailability[s.category].total++;
    if (s.status === 'available') categoryAvailability[s.category].available++;
  }
  const soldOutCategory = Object.entries(categoryAvailability).find(([, v]) => v.available === 0);

  if (confirmedBooking) {
    return (
      <div style={{ maxWidth: 640, margin: '40px auto' }}>
        <p className="status-live">● BOOKING CONFIRMED</p>
        <div className="confirm-card">
          <div className="confirm-main">
            <h2>{event.title}</h2>
            <p>Booking reference · <strong>{confirmedBooking.booking_ref}</strong></p>
            <p>
              Date · {event.event_date}<br />
              Time · {event.event_time}<br />
              Amount paid · ${confirmedBooking.total_amount.toFixed(2)}
            </p>
            <p className="muted">A confirmation email with this QR code has also been sent to you.</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => navigate('/my-bookings')}>View my tickets</button>
              <button className="btn btn-dark" onClick={() => navigate('/')}>Browse more</button>
            </div>
          </div>
          {confirmedBooking.qr_data_url && (
            <div className="qr-panel">
              <img src={confirmedBooking.qr_data_url} alt="QR ticket" style={{ width: 130, borderRadius: 8 }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="back-link" style={{ marginBottom: 20 }}>
        <button className="btn-link" onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}>← Back to events</button>
      </div>

      <div className="event-header" style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 28, marginBottom: 32 }}>
        <div style={{
          height: 260, borderRadius: 16, padding: 20, color: '#fff', display: 'flex', alignItems: 'end',
          background: 'linear-gradient(145deg, #4A171D, #A2212A)',
        }}>
          <div>
            <small style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em' }}>{event.venue_name?.toUpperCase()}</small>
            <div style={{ font: '500 22px var(--font-display)', marginTop: 6 }}>{event.title}</div>
          </div>
        </div>
        <div>
          <p className="eyebrow">Now booking</p>
          <h1>{event.title}</h1>
          <div style={{ display: 'flex', gap: 18, color: 'var(--muted)', fontSize: 14, flexWrap: 'wrap', marginBottom: 10 }}>
            <span>{event.event_date}</span>
            <span>{event.event_time}</span>
            <span>{event.venue_name}</span>
          </div>
          {event.description && <p>{event.description}</p>}
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        {pricing.map((p, i) => {
          const avail = categoryAvailability[p.category] || { available: 0, total: 0 };
          return (
            <div className={`feature-card fc-${(i % 4) + 1}`} key={p.category}>
              <div>
                <h4>{p.category}</h4>
                <p>${p.price.toFixed(2)} per seat</p>
              </div>
              {avail.available === 0 ? (
                <button className="btn btn-secondary btn-sm" style={{ background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }} onClick={() => joinWaitlist(p.category)}>Join waitlist</button>
              ) : (
                <p style={{ margin: 0, fontWeight: 700, color: '#fff', opacity: 0.9 }}>{avail.available} / {avail.total} available</p>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 330px', gap: 24 }} className="booking-grid">
        <div>
          <div className="panel">
            <div className="row-between" style={{ marginBottom: 10 }}>
              <h2>Select your seats</h2>
              {remainingSec !== null && (
                <span className="pill-badge crimson">Held for {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}</span>
              )}
            </div>
            <SeatGrid seats={seats} selectedIds={selected.map((s) => s.id)} onToggle={toggleSeat} />
          </div>

          {soldOutCategory && (
            <div className="waitlist-card">
              <h3>Can't find a seat?</h3>
              <p>Join the waitlist for <strong>{soldOutCategory[0]}</strong> seats. If a booking is cancelled, the next person in line gets a time-limited offer by email.</p>
              <button className="btn btn-secondary" onClick={() => joinWaitlist(soldOutCategory[0])}>Join {soldOutCategory[0]} Waitlist</button>
            </div>
          )}
        </div>

        <aside className="summary-dark">
          <small>YOUR TICKET</small>
          <h2>{event.title}</h2>
          <div className="sub">{event.venue_name} · {event.event_date} · {event.event_time}</div>
          <div className="chips">
            {selected.length ? selected.map((s) => <span className="chip" key={s.id}>{s.row_label}{s.seat_number}</span>) : <span className="chip">No seats selected</span>}
          </div>
          {remainingSec !== null && (
            <div className="timer-box">
              SEATS HELD FOR <strong>{Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}</strong>
              <div className="timerbar"><i style={{ width: `${(remainingSec / 600) * 100}%` }} /></div>
            </div>
          )}
          <div className="price-row"><span>Seats</span><span>${total.toFixed(2)}</span></div>
          <div className="price-row"><span>Booking fee</span><span>${fee.toFixed(2)}</span></div>
          <div className="dark-line" />
          <div className="price-row total"><span>Total</span><span>${grandTotal.toFixed(2)}</span></div>
          <button className="btn btn-primary btn-block" disabled={busy || selected.length === 0} onClick={checkout}>
            {busy ? 'Booking…' : 'Continue to payment →'}
          </button>
        </aside>
      </div>
    </div>
  );
}
