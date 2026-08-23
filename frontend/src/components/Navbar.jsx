import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../api.js';

export default function Navbar({ user, setUser }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function logout() {
    clearSession();
    setUser(null);
    navigate('/');
    setMenuOpen(false);
  }

  const linkClass = ({ isActive }) => isActive ? 'active' : '';

  return (
    <nav className="navbar">
      <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
        <span className="brand-dot" />
        <span className="brand-text">Encore</span>
      </Link>

      <ul className="nav-links">
        <li><NavLink to="/" end className={linkClass}>Browse</NavLink></li>
        {user?.role === 'customer' && (
          <>
            <li><NavLink to="/my-bookings" className={linkClass}>My Tickets</NavLink></li>
            <li><NavLink to="/my-waitlist" className={linkClass}>Waitlist</NavLink></li>
          </>
        )}
        {(user?.role === 'organiser' || user?.role === 'admin') && (
          <li><NavLink to="/organiser" className={linkClass}>Organiser</NavLink></li>
        )}
        {user?.role === 'admin' && (
          <li><NavLink to="/admin/venues" className={linkClass}>Venues</NavLink></li>
        )}
      </ul>

      <div className="nav-actions">
        {user ? (
          <>
            <span className="pill-badge">{user.name} · {user.role}</span>
            <button className="btn btn-dark btn-sm" onClick={logout}>Log out</button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-secondary btn-sm">Log in</Link>
            <Link to="/login" className="btn btn-primary btn-sm">Sign up</Link>
          </>
        )}
      </div>

      <button
        className={`nav-burger ${menuOpen ? 'open' : ''}`}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span /><span /><span />
      </button>

      {menuOpen && (
        <div className="nav-mobile-menu">
          <ul className="nav-links">
            <li><NavLink to="/" end className={linkClass} onClick={() => setMenuOpen(false)}>Browse</NavLink></li>
            {user?.role === 'customer' && (
              <>
                <li><NavLink to="/my-bookings" className={linkClass} onClick={() => setMenuOpen(false)}>My Tickets</NavLink></li>
                <li><NavLink to="/my-waitlist" className={linkClass} onClick={() => setMenuOpen(false)}>Waitlist</NavLink></li>
              </>
            )}
            {(user?.role === 'organiser' || user?.role === 'admin') && (
              <li><NavLink to="/organiser" className={linkClass} onClick={() => setMenuOpen(false)}>Organiser</NavLink></li>
            )}
            {user?.role === 'admin' && (
              <li><NavLink to="/admin/venues" className={linkClass} onClick={() => setMenuOpen(false)}>Venues</NavLink></li>
            )}
          </ul>
          <div className="nav-mobile-actions">
            {user ? (
              <>
                <span className="pill-badge">{user.name} · {user.role}</span>
                <button className="btn btn-dark btn-sm btn-block" onClick={logout}>Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-secondary btn-sm btn-block" onClick={() => setMenuOpen(false)}>Log in</Link>
                <Link to="/login" className="btn btn-primary btn-sm btn-block" onClick={() => setMenuOpen(false)}>Sign up</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
