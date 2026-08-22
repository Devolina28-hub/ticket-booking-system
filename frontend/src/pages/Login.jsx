import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, saveSession } from '../api.js';

export default function Login({ setUser }) {
  const [email, setEmail] = useState('customer@example.com');
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
    <div className="panel" style={{ maxWidth: 440, margin: '40px auto' }}>
      <p className="eyebrow">Welcome back</p>
      <h2>Log in to CinePass</h2>
      <p className="muted">Book seats, join waitlists, and manage your tickets.</p>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={onSubmit} className="stack">
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary btn-block" disabled={loading}>{loading ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        No account? <Link to="/register">Sign up</Link>
      </p>
      <hr className="divider" />
      <p className="label-sm">Demo accounts (password123)</p>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        admin@example.com · organiser@example.com · customer@example.com
      </p>
    </div>
  );
}
