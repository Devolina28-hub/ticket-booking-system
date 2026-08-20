import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Events from './pages/Events.jsx';
import EventSeatMap from './pages/EventSeatMap.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import BookingHistory from './pages/BookingHistory.jsx';
import MyWaitlist from './pages/MyWaitlist.jsx';
import OrganiserDashboard from './pages/OrganiserDashboard.jsx';
import AdminVenues from './pages/AdminVenues.jsx';
import { getUser } from './api.js';

function RequireRole({ user, roles, children }) {
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(getUser());

  return (
    <div className="app-shell">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />
      <Navbar user={user} setUser={setUser} />
      <Routes>
        <Route path="/" element={<Events />} />
        <Route path="/events/:id" element={<EventSeatMap />} />
        <Route path="/login" element={<Login setUser={setUser} />} />
        <Route path="/register" element={<Register setUser={setUser} />} />
        <Route
          path="/my-bookings"
          element={<RequireRole user={user} roles={['customer']}><BookingHistory /></RequireRole>}
        />
        <Route
          path="/my-waitlist"
          element={<RequireRole user={user} roles={['customer']}><MyWaitlist /></RequireRole>}
        />
        <Route
          path="/organiser"
          element={<RequireRole user={user} roles={['organiser', 'admin']}><OrganiserDashboard /></RequireRole>}
        />
        <Route
          path="/admin/venues"
          element={<RequireRole user={user} roles={['admin']}><AdminVenues /></RequireRole>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
