import { useState } from 'react';
import { useNavigate, Link, useParams, useLocation } from 'react-router-dom';
import { api, saveSession } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import BackButton from '../components/BackButton.jsx';

const ROLE_LABELS = { customer: 'Customer', organiser: 'Organiser', admin: 'Admin' };
const DEMO_EMAILS = { customer: 'customer@example.com', organiser: 'organiser@example.com', admin: 'admin@example.com' };

export default function Login({ setUser }) {
  const { role } = useParams();
  const location = useLocation();
  const roleLabel = ROLE_LABELS[role] || 'Customer';
  const [email, setEmail] = useState(DEMO_EMAILS[role] || '');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login({ email, password });
      if (data.user.role !== role) {
        setError(`This account is registered as ${data.user.role}, not ${roleLabel.toLowerCase()}. Try the ${data.user.role} portal instead.`);
        setLoading(false);
        return;
      }
      saveSession(data.token, data.user);
      setUser(data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout role={role}>
      <p className="eyebrow">{roleLabel} log in</p>
      <h2 style={{ marginBottom: 6 }}>Welcome back</h2>
      <p className="muted" style={{ marginBottom: 24 }}>Enter your details to access your {roleLabel.toLowerCase()} account.</p>
      {location.state?.resetSuccess && (
        <div className="alert alert-success">Password reset successful — log in with your new password.</div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={onSubmit} className="stack">
        <div className="field">
          <label>Email address</label>
          <div className="field-icon-wrap">
            <span className="field-icon">✉️</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label>Password</label>
          <div className="field-icon-wrap">
            <span className="field-icon">🔒</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <p style={{ margin: '6px 0 0', textAlign: 'right' }}>
            <Link to="/forgot-password" className="portal-switch-link" style={{ fontSize: 13 }}>Forgot Password?</Link>
          </p>
        </div>
        <button className="btn btn-primary btn-block" disabled={loading}>{loading ? 'Logging in…' : 'Log in'}</button>
      </form>
      {role !== 'admin' && (
        <p className="muted" style={{ marginTop: 16 }}>
          Don't have an account? <Link to={`/register/${role}`}>Sign up</Link>
        </p>
      )}
      <div style={{ marginTop: 8 }}>
        <BackButton to="/login" style={{ padding: '6px 12px 6px 8px', fontSize: 13 }}>Choose a different portal</BackButton>
      </div>
      <hr className="divider" />
      <p className="label-sm">Demo account (password123)</p>
      <p className="muted" style={{ fontSize: '0.85rem' }}>{DEMO_EMAILS[role] || DEMO_EMAILS.customer}</p>
    </AuthLayout>
  );
}
