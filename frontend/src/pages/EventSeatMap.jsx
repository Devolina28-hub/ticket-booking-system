import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, getUser } from '../api.js';
import SeatGrid from '../components/SeatGrid.jsx';

const MAX_SEATS = 4;
const BOOKING_FEE = 49;

export default function EventSeatMap() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = getUser();
  const isPreviewOnly = user && user.role !== 'customer'; // organiser/admin can look, not book

  const [event, setEvent] = useState(null);
  const [pricing, setPricing] = useState([]);
  const [seats, setSeats] = useState([]);
  const [selected, setSelected] = useState([]);
  const [holdExpiresAt, setHoldExpiresAt] = useState(null);
  const [remainingSec, setRemainingSec] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [payment, setPayment] = useState(null); // { payment_ref, qr_data_url, amount, expires_at }
  const [paymentStatus, setPaymentStatus] = useState(null); // 'pending' | 'declined' | 'expired'
  const pollRef = useRef(null);
  const paymentPollRef = useRef(null);

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
    if (isPreviewOnly) {
      setError(`${user.role === 'admin' ? 'Admin' : 'Organiser'} accounts can preview shows but cannot book tickets. Log in as a customer to book.`);
      return;
    }
    setError('');

    if (selected.some((s) => s.id === seat.id)) {
      if (holdExpiresAt) {
        try { await api.releaseSeats(id, [seat.id]); } catch { /* ignore */ }
      }
      setSelected((sel) => sel.filter((s) => s.id !== seat.id));
      return;
    }

    if (seat.status !== 'available') return;

    if (selected.length >= MAX_SEATS) {
      setError(`You can select up to ${MAX_SEATS} seats at a time.`);
      return;
    }

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

  // Step 1: "Continue to payment" no longer books directly -- it opens a
  // scan-to-pay QR. The actual booking only happens once someone (on
  // whatever device scans it) taps Yes on the /pay/:paymentRef page.
  async function checkout() {
    setBusy(true);
    setError('');
    try {
      const data = await api.initiatePayment({ event_id: Number(id), seat_ids: selected.map((s) => s.id) });
      setPayment(data);
      setPaymentStatus('pending');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Poll the payment session while the QR screen is up. Reacts to whatever
  // decision gets made on the /pay/:paymentRef page (or a timeout).
  useEffect(() => {
    if (!payment || paymentStatus !== 'pending') {
      if (paymentPollRef.current) clearInterval(paymentPollRef.current);
      return;
    }
    paymentPollRef.current = setInterval(async () => {
      try {
        const data = await api.paymentStatus(payment.payment_ref);
        if (data.status === 'approved') {
          setConfirmedBooking(data.booking);
          setSelected([]);
          setHoldExpiresAt(null);
          setPayment(null);
          setPaymentStatus(null);
          const seatsData = await api.getSeats(id);
          setSeats(seatsData.seats);
        } else if (data.status !== 'pending') {
          setPaymentStatus(data.status); // 'declined' | 'expired'
        }
      } catch { /* ignore transient errors, keep polling */ }
    }, 3000);
    return () => clearInterval(paymentPollRef.current);
  }, [payment, paymentStatus, id]);

  // Countdown for the QR screen, mirroring the seat-hold timer above.
  const [paymentRemainingSec, setPaymentRemainingSec] = useState(null);
  useEffect(() => {
    if (!payment || paymentStatus !== 'pending') { setPaymentRemainingSec(null); return; }
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(payment.expires_at) - new Date()) / 1000));
      setPaymentRemainingSec(diff);
      if (diff === 0) setPaymentStatus('expired');
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [payment, paymentStatus]);

  async function cancelPayment() {
    if (!payment) return;
    try { await api.paymentDecision(payment.payment_ref, false); } catch { /* best-effort */ }
    setPaymentStatus('declined');
  }

  function backToSeats() {
    setPayment(null);
    setPaymentStatus(null);
    setSelected([]);
    setHoldExpiresAt(null);
  }

  async function joinWaitlist(category) {
    if (!user) { navigate('/login'); return; }
    if (isPreviewOnly) {
      setError(`${user.role === 'admin' ? 'Admin' : 'Organiser'} accounts cannot join waitlists. Log in as a customer.`);
      return;
    }
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
  const fee = selected.length ? BOOKING_FEE : 0;
  const grandTotal = total + fee;

  const categoryAvailability = {};
  for (const s of seats) {
    categoryAvailability[s.category] = categoryAvailability[s.category] || { available: 0, total: 0 };
    categoryAvailability[s.category].total++;
    if (s.status === 'available') categoryAvailability[s.category].available++;
  }
  const soldOutCategory = Object.entries(categoryAvailability).find(([, v]) => v.available === 0);

  if (payment && paymentStatus === 'pending') {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto' }}>
        <p className="status-live">● AWAITING PAYMENT</p>
        <div className="panel center-text">
          <h2 style={{ marginBottom: 4 }}>Scan to pay</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            Scan this QR with another device to confirm payment of <strong>₹{Number(payment.amount).toFixed(0)}</strong>.
          </p>
          <div className="qr-panel" style={{ borderRadius: 14, marginBottom: 16 }}>
            <img src={payment.qr_data_url} alt="Scan to pay QR" style={{ width: 220, borderRadius: 8 }} />
          </div>
          {paymentRemainingSec !== null && (
            <div className="timer-box" style={{ color: 'var(--muted)' }}>
              EXPIRES IN <strong>{Math.floor(paymentRemainingSec / 60)}:{String(paymentRemainingSec % 60).padStart(2, '0')}</strong>
              <div className="timerbar"><i style={{ width: `${(paymentRemainingSec / 600) * 100}%`, background: 'var(--indigo)' }} /></div>
            </div>
          )}
          <p className="muted" style={{ marginBottom: 16 }}>Waiting for confirmation…</p>
          <button className="btn btn-secondary" onClick={cancelPayment}>Cancel payment</button>
        </div>
      </div>
    );
  }

  if (paymentStatus === 'declined' || paymentStatus === 'expired') {
    const isDeclined = paymentStatus === 'declined';
    return (
      <div style={{ maxWidth: 480, margin: '40px auto' }}>
        <div className="panel center-text">
          <div style={{ fontSize: 44, marginBottom: 8 }}>{isDeclined ? '⛔' : '⏰'}</div>
          <h2 style={{ color: isDeclined ? 'var(--red)' : 'var(--amber)', marginBottom: 4 }}>
            {isDeclined ? 'Payment failed' : 'Payment window expired'}
          </h2>
          <p className="muted" style={{ marginBottom: 20 }}>No booking was made and your seats have been released.</p>
          <button className="btn btn-primary" onClick={backToSeats}>Back to seat selection</button>
        </div>
      </div>
    );
  }

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
              Amount paid · ₹{confirmedBooking.total_amount.toFixed(0)}
            </p>
            <p className="muted">A confirmation email with this QR code has also been sent to you. Scanning the QR opens your digital ticket with full seat details.</p>
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

      {isPreviewOnly && (
        <div className="alert" style={{ background: 'var(--amber-soft, #fff3de)', color: 'var(--amber, #c27a18)' }}>
          You're viewing this as {user.role === 'admin' ? 'an admin' : 'an organiser'} — you can preview the show and seat map, but booking is only available to customer accounts.
        </div>
      )}

      <div className="event-header" style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 28, marginBottom: 32 }}>
        <div style={{
          height: 260, borderRadius: 16, padding: 20, color: '#fff', display: 'flex', alignItems: 'end',
          background: 'linear-gradient(145deg, #221f4b, #5b5cf0)',
        }}>
          <div>
            <small style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.85 }}>{event.venue_name?.toUpperCase()}</small>
            <div style={{ font: '700 22px var(--font-display)', marginTop: 6 }}>{event.title}</div>
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
                <p>₹{p.price.toFixed(0)} per seat</p>
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
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="pill-badge">Max {MAX_SEATS} seats</span>
                {remainingSec !== null && (
                  <span className="pill-badge accent">Held for {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}</span>
                )}
              </div>
            </div>
            <SeatGrid seats={seats} selectedIds={selected.map((s) => s.id)} onToggle={toggleSeat} disabled={isPreviewOnly} />
          </div>

          {soldOutCategory && !isPreviewOnly && (
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
          <div className="price-row"><span>Seats ({selected.length}/{MAX_SEATS})</span><span>₹{total.toFixed(0)}</span></div>
          <div className="price-row"><span>Booking fee</span><span>₹{fee.toFixed(0)}</span></div>
          <div className="dark-line" />
          <div className="price-row total"><span>Total</span><span>₹{grandTotal.toFixed(0)}</span></div>
          <button className="btn btn-primary btn-block" disabled={busy || selected.length === 0 || isPreviewOnly} onClick={checkout}>
            {isPreviewOnly ? 'Booking disabled for this role' : busy ? 'Booking…' : 'Continue to payment →'}
          </button>
        </aside>
      </div>
    </div>
  );
}
