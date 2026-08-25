import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password);
      // Backend has already invalidated this token (and any other
      // outstanding ones for this user) at this point -- redirect to login
      // with a success message rather than leaving them on a dead form.
      navigate('/login/customer', { state: { resetSuccess: true } });
    } catch (err) {
      // Backend gives one generic message for "not found" / "expired" /
      // "already used" -- surfaced here verbatim, with a way to request a
      // fresh link below.
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout role="customer">
        <p className="eyebrow">Reset password</p>
        <h2 style={{ marginBottom: 6 }}>Missing reset link</h2>
        <p className="muted" style={{ marginBottom: 20 }}>
          This page needs a reset token from the link in your email.
        </p>
        <Link to="/forgot-password" className="btn btn-primary btn-block" style={{ textAlign: 'center' }}>
          Request a new reset link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout role="customer">
      <p className="eyebrow">Reset password</p>
      <h2 style={{ marginBottom: 6 }}>Choose a new password</h2>
      <p className="muted" style={{ marginBottom: 24 }}>
        Enter and confirm your new password below.
      </p>
      {error && (
        <div className="alert alert-error">
          {error}
          {/only used|expired|invalid/i.test(error) && (
            <>
              {' '}<Link to="/forgot-password" style={{ fontWeight: 700 }}>Request a new link</Link>
            </>
          )}
        </div>
      )}
      <form onSubmit={onSubmit} className="stack">
        <div className="field">
          <label>New password</label>
          <div className="field-icon-wrap">
            <span className="field-icon">🔒</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <div className="field-icon-wrap">
            <span className="field-icon">🔒</span>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
          </div>
        </div>
        <button className="btn btn-primary btn-block" disabled={loading}>
          {loading ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </AuthLayout>
  );
}
