const BASE = 'https://ticket-booking-system-taz8.onrender.com/api';


function getToken() {
  return localStorage.getItem('token');
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, password) => request('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false }),

  listVenues: () => request('/venues', { auth: false }),
  getVenue: (id) => request(`/venues/${id}`, { auth: false }),
  createVenue: (payload) => request('/venues', { method: 'POST', body: payload }),
  deleteVenue: (id) => request(`/venues/${id}`, { method: 'DELETE' }),

  listEvents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/events${qs ? `?${qs}` : ''}`, { auth: false });
  },
  getEvent: (id) => request(`/events/${id}`, { auth: false }),
  createEvent: (payload) => request('/events', { method: 'POST', body: payload }),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),
  eventSummary: (id) => request(`/events/${id}/summary`),

  getSeats: (eventId) => request(`/events/${eventId}/seats`, { auth: false }),
  holdSeats: (eventId, seatIds) => request(`/events/${eventId}/seats/hold`, { method: 'POST', body: { seat_ids: seatIds } }),
  releaseSeats: (eventId, seatIds) => request(`/events/${eventId}/seats/release`, { method: 'POST', body: { seat_ids: seatIds } }),

  confirmBooking: (payload) => request('/bookings/confirm', { method: 'POST', body: payload }),
  myBookings: () => request('/bookings/my'),
  cancelBooking: (id) => request(`/bookings/${id}/cancel`, { method: 'POST' }),

  initiatePayment: (payload) => request('/payments/initiate', { method: 'POST', body: payload }),
  paymentStatus: (paymentRef) => request(`/payments/${paymentRef}/status`, { auth: false }),
  paymentDecision: (paymentRef, approve) =>
    request(`/payments/${paymentRef}/decision`, { method: 'POST', body: { approve }, auth: false }),

  joinWaitlist: (payload) => request('/waitlist', { method: 'POST', body: payload }),
  myWaitlist: () => request('/waitlist/my'),
  completeWaitlistOffer: (id) => request(`/waitlist/${id}/complete`, { method: 'POST' }),
  leaveWaitlist: (id) => request(`/waitlist/${id}/leave`, { method: 'POST' }),

  verifyTicket: async (bookingRef) => {
    const res = await fetch(BASE + `/bookings/verify/${bookingRef}`);
    return res.json();
  },
};

export function saveSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}
