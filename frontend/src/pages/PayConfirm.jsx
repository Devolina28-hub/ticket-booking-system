import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';

// Standalone page -- this is what opens when the "Scan to Pay" QR is
// scanned (see EventSeatMap.jsx), rendered full-screen with no site
// navigation/branding so it reads like a payment app's confirmation
// screen, not "the ticket site loading". Tapping Yes/No here is what
// actually decides the booking; the original checkout tab just polls
// /api/payments/:ref/status and reacts to whatever happens here.
const wrapStyle = {
  minHeight: '100vh',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: 'var(--surface2)',
  fontFamily: 'var(--font-body, sans-serif)',
  boxSizing: 'border-box',
};

const cardStyle = { maxWidth: 420, width: '100%', textAlign: 'center' };

export default function PayConfirm() {
  const { paymentRef } = useParams();
  const [status, setStatus] = useState(null); // full status payload from backend
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await api.paymentStatus(paymentRef);
      setStatus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentRef]);

  async function decide(approve) {
    setDeciding(true);
    setError('');
    try {
      // This is a mock payment screen -- no real gateway is called here.
      // We wait ~5s before revealing the result so the "Yes" path feels like
      // an actual payment is being processed and the confirmation email has
      // time to land, instead of flipping to "approved" instantly.
      const [data] = await Promise.all([
        api.paymentDecision(paymentRef, approve),
        approve ? new Promise((resolve) => setTimeout(resolve, 5000)) : Promise.resolve(),
      ]);
      setStatus((s) => ({ ...s, status: data.status, booking: data.booking || null }));
    } catch (err) {
      setError(err.message);
      load(); // resync in case someone else / the sweeper already resolved it
    } finally {
      setDeciding(false);
    }
  }

  if (loading) {
    return (
      <div style={wrapStyle}>
        <div className="spinner" />
      </div>
    );
  }

  if (!status) {
    return (
      <div style={wrapStyle}>
        <div className="panel center-text" style={cardStyle}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>❓</div>
          <h2 style={{ color: 'var(--red)' }}>Payment link not found</h2>
          <p className="muted">{error || `No payment session matches ${paymentRef}.`}</p>
        </div>
      </div>
    );
  }

  const { event, amount, seat_count } = status;

  if (status.status === 'approved') {
    return (
      <div style={wrapStyle}>
        <div className="panel" style={cardStyle}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
          <h2 style={{ color: 'var(--green)' }}>Payment confirmed</h2>
          <p className="muted" style={{ marginBottom: 4 }}>{event?.title}</p>
          {status.booking && (
            <p className="muted">Booking reference · <strong>{status.booking.booking_ref}</strong></p>
          )}
          <p style={{ marginTop: 16 }}>You can go back to the device you started checkout on -- your ticket is ready there.</p>
        </div>
      </div>
    );
  }

  if (status.status === 'declined') {
    return (
      <div style={wrapStyle}>
        <div className="panel" style={cardStyle}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>⛔</div>
          <h2 style={{ color: 'var(--red)' }}>Payment declined</h2>
          <p className="muted">No booking was made and your seats have been released.</p>
        </div>
      </div>
    );
  }

  if (status.status === 'expired') {
    return (
      <div style={wrapStyle}>
        <div className="panel" style={cardStyle}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>⏰</div>
          <h2 style={{ color: 'var(--amber)' }}>This payment link expired</h2>
          <p className="muted">The 10-minute window closed before a decision was made. No booking was made.</p>
        </div>
      </div>
    );
  }

  // status.status === 'pending'
  return (
    <div style={wrapStyle}>
      <div className="panel" style={cardStyle}>
        <p className="eyebrow" style={{ marginBottom: 4 }}>CONFIRM PAYMENT</p>
        <h2 style={{ marginBottom: 4 }}>{event?.title}</h2>
        <p className="muted" style={{ marginBottom: 20 }}>
          {event?.venue_name} · {event?.event_date} · {event?.event_time}
        </p>

        <div className="pay-detail-box">
          <div className="pay-detail-row"><span>Seats</span><span>{seat_count}</span></div>
          <div className="pay-detail-row"><span>Number of Persons</span><span>{seat_count}</span></div>
          <div className="pay-detail-row pay-detail-total"><span>Amount</span><span>₹{Number(amount).toFixed(0)}</span></div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <p style={{ marginBottom: 16, fontWeight: 700 }}>Continue with this payment?</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn btn-secondary" disabled={deciding} onClick={() => decide(false)}>
            No, cancel
          </button>
          <button className="btn btn-primary" disabled={deciding} onClick={() => decide(true)}>
            {deciding ? 'Please wait…' : 'Yes, pay now'}
          </button>
        </div>
        {deciding && (
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Confirming your payment and sending the ticket email — this takes about 5 seconds.
          </p>
        )}
        <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>
          This is a simulated "Scan to Pay" screen for demo purposes only. No real payment
          gateway is connected and no money moves — tapping Yes/No only updates the booking
          status.
        </p>
      </div>
    </div>
  );
}
