import { Link } from 'react-router-dom';

const ICONS = {
  ticket: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3z" />
      <path d="M13 5v2M13 11v2M13 17v2" />
    </svg>
  ),
  calendar: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
    </svg>
  ),
  shield: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
};

const ROLES = [
  { key: 'customer', icon: ICONS.ticket, title: 'Customer', desc: 'Discover events, book seats, and manage your tickets.', cta: 'Continue as Customer', loginTo: '/login/customer' },
  { key: 'organiser', icon: ICONS.calendar, title: 'Organiser', desc: 'Create events, manage listings, and track sales.', cta: 'Organiser portal', loginTo: '/login/organiser' },
  { key: 'admin', icon: ICONS.shield, title: 'Admin', desc: 'Manage venues, events, and platform operations.', cta: 'Admin portal', loginTo: '/login/admin' },
];

export default function RoleSelect() {
  return (
    <div className="role-hero">
      <div className="role-hero-inner">
        <p className="eyebrow center-text">Welcome to Encore</p>
        <h1 className="center-text role-hero-title">
          Your next experience<br />starts <span className="text-gradient">here</span>.
        </h1>
        <p className="muted center-text" style={{ maxWidth: 420, margin: '0 auto' }}>
          Choose how you want to continue.
        </p>

        <div className="role-select-grid">
          {ROLES.map((r) => (
            <div className="role-card" key={r.key}>
              <div className="role-icon">{r.icon}</div>
              <h3>{r.title}</h3>
              <p style={{ marginBottom: 20 }}>{r.desc}</p>
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                <Link to={r.loginTo} className="btn btn-primary btn-sm btn-block">{r.cta} →</Link>
                <Link to={r.loginTo} className="btn btn-secondary btn-sm btn-block">Learn more</Link>
              </div>
            </div>
          ))}
        </div>

        <div className="role-cta-bar">
          <div className="role-cta-icon">{ICONS.calendar}</div>
          <div className="role-cta-text">
            <strong>Looking for something to do?</strong>
            <span>Explore upcoming concerts, movies, and live events near you.</span>
          </div>
          <Link to="/" className="btn btn-secondary btn-sm">Explore events →</Link>
        </div>
      </div>
    </div>
  );
}
