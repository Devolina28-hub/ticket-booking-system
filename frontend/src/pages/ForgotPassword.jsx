import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import BackButton from '../components/BackButton.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Backend always returns the same generic message whether or not the
      // email is registered -- don't add any client-side branching that
      // would undo that (e.g. never call GET /users?email= first to "check").
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout role="customer">
      <p className="eyebrow">Account recovery</p>
      <h2 style={{ marginBottom: 6 }}>Forgot your password?</h2>
      <p className="muted" style={{ marginBottom: 24 }}>
        Enter your registered email and we'll send you a link to reset it.
      </p>

      {submitted ? (
        <div className="alert alert-success">
          If an account exists with this email, a password reset link has been sent.
          Check your inbox — the link expires in 20 minutes.
        </div>
      ) : (
        <>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={onSubmit} className="stack">
            <div className="field">
              <label>Email address</label>
              <div className="field-icon-wrap">
                <span className="field-icon">✉️</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>
            </div>
            <button className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <BackButton to="/login/customer" style={{ padding: '6px 12px 6px 8px', fontSize: 13 }}>Back to log in</BackButton>
      </div>
      <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
        Not a customer? <Link to="/login" className="portal-switch-link">Choose a different portal</Link>
      </p>
    </AuthLayout>
  );
}
