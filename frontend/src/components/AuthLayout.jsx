import { Link } from 'react-router-dom';

const ROLE_META = {
  customer: {
    badge: 'Customer portal',
    heading: 'Book your seats in seconds.',
    tagline: 'Browse movies and concerts, pick your seats on a live map, and get a QR ticket instantly.',
  },
  organiser: {
    badge: 'Organiser portal',
    heading: 'List events. Track revenue.',
    tagline: 'Create movie or concert listings with per-category pricing and watch bookings roll in.',
  },
  admin: {
    badge: 'Admin portal',
    heading: 'Manage venues & seat layouts.',
    tagline: 'Create venues, define seat categories, and keep the whole platform running smoothly.',
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
