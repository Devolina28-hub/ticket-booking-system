import { useState } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { api, saveSession } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import BackButton from '../components/BackButton.jsx';

const ROLE_LABELS = { customer: 'Customer', organiser: 'Organiser' };

export default function Register({ setUser }) {
  const { role } = useParams();
  const roleLabel = ROLE_LABELS[role] || 'Customer';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.register({ ...form, role });
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
      <p className="eyebrow">{roleLabel} sign up</p>
      <h2 style={{ marginBottom: 6 }}>Create your account</h2>
      <p className="muted" style={{ marginBottom: 24 }}>
        {role === 'organiser' ? 'List your movies or concerts and start selling seats.' : 'Book tickets for movies and concerts in a few clicks.'}
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={onSubmit} className="stack">
        <div className="field">
          <label>Full name</label>
          <div className="field-icon-wrap">
            <span className="field-icon">👤</span>
            <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label>Email address</label>
          <div className="field-icon-wrap">
            <span className="field-icon">✉️</span>
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label>Password</label>
          <div className="field-icon-wrap">
            <span className="field-icon">🔒</span>
            <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={6} />
          </div>
        </div>
        <button className="btn btn-primary btn-block" disabled={loading}>{loading ? 'Creating…' : 'Sign up'}</button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        Already have an account? <Link to={`/login/${role}`}>Log in</Link>
      </p>
      <div style={{ marginTop: 8 }}>
        <BackButton to="/login" style={{ padding: '6px 12px 6px 8px', fontSize: 13 }}>Choose a different portal</BackButton>
      </div>
    </AuthLayout>
  );
}
