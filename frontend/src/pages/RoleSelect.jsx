import { Link } from 'react-router-dom';

const ROLES = [
  { key: 'customer', icon: '🎟️', title: 'Customer', desc: 'Browse events, book seats, and manage your tickets.', loginTo: '/login/customer', registerTo: '/register/customer' },
  { key: 'organiser', icon: '🎬', title: 'Organiser', desc: 'Create listings and track revenue for your events.', loginTo: '/login/organiser', registerTo: '/register/organiser' },
  { key: 'admin', icon: '🏛️', title: 'Admin', desc: 'Manage venues and seat layouts across the platform.', loginTo: '/login/admin', registerTo: null },
];

export default function RoleSelect() {
  return (
    <div className="center-text" style={{ maxWidth: 900, margin: '50px auto' }}>
      <p className="eyebrow">Welcome to Encore</p>
      <h1>How would you like to sign in?</h1>
      <p className="muted" style={{ maxWidth: 480, margin: '0 auto' }}>
        Choose your role to continue to the right portal.
      </p>
      <div className="role-select-grid">
        {ROLES.map((r) => (
          <div className="role-card" key={r.key}>
            <div className="role-icon">{r.icon}</div>
            <h3>{r.title}</h3>
            <p style={{ marginBottom: 20 }}>{r.desc}</p>
            <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
              <Link to={r.loginTo} className="btn btn-primary btn-sm btn-block">Log in</Link>
              {r.registerTo && <Link to={r.registerTo} className="btn btn-secondary btn-sm btn-block">Sign up</Link>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
