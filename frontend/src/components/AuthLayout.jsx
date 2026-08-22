import { Link } from 'react-router-dom';

const ROLE_META = {
  customer: {
    badge: 'Customer portal',
    heading: 'Book your seats in seconds.',
    tagline: 'Browse movies and concerts, pick your seats on a live map, and get a QR ticket instantly.',
    stats: [
      { value: '10k+', label: 'Tickets booked' },
      { value: '4.8★', label: 'Average rating' },
    ],
  },
  organiser: {
    badge: 'Organiser portal',
    heading: 'List events. Track revenue.',
    tagline: 'Create movie or concert listings with per-category pricing and watch bookings roll in.',
    stats: [
      { value: '500+', label: 'Events hosted' },
      { value: '98%', label: 'Sell-through rate' },
    ],
  },
  admin: {
    badge: 'Admin portal',
    heading: 'Manage venues & seat layouts.',
    tagline: 'Create venues, define seat categories, and keep the whole platform running smoothly.',
    stats: [
      { value: '120+', label: 'Venues managed' },
      { value: '24/7', label: 'Platform uptime' },
    ],
  },
};

export default function AuthLayout({ role, children }) {
  const meta = ROLE_META[role] || ROLE_META.customer;
  return (
    <div className="auth-split">
      <div className="auth-side">
        <div className="auth-side-content">
          <span className="auth-role-badge">{meta.badge}</span>
          <h1>{meta.heading}</h1>
          <p>{meta.tagline}</p>
          <div className="auth-stats">
            {meta.stats.map((s) => (
              <div key={s.label}>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="auth-form-side">
        <div className="auth-form-card">
          <Link to="/" className="brand">
            <span className="brand-dot" />
            <span className="brand-text">Encore</span>
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
