import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Events from './pages/Events.jsx';
import EventSeatMap from './pages/EventSeatMap.jsx';
import TicketVerify from './pages/TicketVerify.jsx';
import PayConfirm from './pages/PayConfirm.jsx';
import RoleSelect from './pages/RoleSelect.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
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
    <Routes>
      {/* Scanned straight from the QR code — a standalone ticket display with
          no site navigation/branding shell, so it reads as "here's your
          ticket" rather than the app loading. */}
      <Route path="/ticket/:bookingRef" element={<TicketVerify />} />

      {/* Scanned from the "Scan to Pay" QR shown mid-checkout -- also a
          standalone page with no site shell, so it reads like a payment
          app's confirmation screen. */}
      <Route path="/pay/:paymentRef" element={<PayConfirm />} />

      <Route
        path="*"
        element={
          <div className="app-shell">
            <Navbar user={user} setUser={setUser} />
            <Routes>
              <Route path="/" element={<Events />} />
              <Route path="/events/:id" element={<EventSeatMap />} />

              <Route path="/login" element={<RoleSelect />} />
              <Route path="/login/:role" element={<Login setUser={setUser} />} />
              <Route path="/register/:role" element={<Register setUser={setUser} />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

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
        }
      />
    </Routes>
  );
}
