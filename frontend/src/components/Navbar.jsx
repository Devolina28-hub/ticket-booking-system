import { Link, NavLink, useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../api.js';

export default function Navbar({ user, setUser }) {
  const navigate = useNavigate();

  function logout() {
    clearSession();
    setUser(null);
    navigate('/');
  }

  return (
    <nav className="navbar">
      <Link to="/" className="brand">cine</Link>
      <ul className="nav-links">
        <li><NavLink to="/" end className={({isActive}) => isActive ? 'active' : ''}>Browse</NavLink></li>
        {user?.role === 'customer' && (
          <>
            <li><NavLink to="/my-bookings" className={({isActive}) => isActive ? 'active' : ''}>My Tickets</NavLink></li>
            <li><NavLink to="/my-waitlist" className={({isActive}) => isActive ? 'active' : ''}>Waitlist</NavLink></li>
          </>
        )}
        {(user?.role === 'organiser' || user?.role === 'admin') && (
          <li><NavLink to="/organiser" className={({isActive}) => isActive ? 'active' : ''}>Organiser</NavLink></li>
        )}
        {user?.role === 'admin' && (
          <li><NavLink to="/admin/venues" className={({isActive}) => isActive ? 'active' : ''}>Venues</NavLink></li>
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
            <Link to="/register" className="btn btn-primary btn-sm">Sign up</Link>
          </>
        )}
      </div>
    </nav>
  );
}
