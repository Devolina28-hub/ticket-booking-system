import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, saveSession } from '../api.js';

export default function Register({ setUser }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer' });
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
      const data = await api.register(form);
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
      <h2>Create your account</h2>
      <p className="muted">Book tickets for movies and concerts in a few clicks.</p>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={onSubmit} className="stack">
        <div className="field">
          <label>Name</label>
          <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={6} />
        </div>
        <div className="field">
          <label>Account type</label>
          <select value={form.role} onChange={(e) => update('role', e.target.value)}>
            <option value="customer">Customer — book tickets</option>
            <option value="organiser">Organiser — create events</option>
          </select>
        </div>
        <button className="btn btn-primary btn-block" disabled={loading}>{loading ? 'Creating…' : 'Sign up'}</button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
