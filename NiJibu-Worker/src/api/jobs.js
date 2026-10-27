import { USE_MOCK_PROVIDER } from '../config';
import { request } from './client';
import * as mock from './jobsMock';

// Requests from customers. Proposed routes for the NiJibu backend:
//
//   PUT  /api/provider/online                 body: { online, lat, lng }   (going online needs the location)
//   PUT  /api/provider/location               body: { lat, lng }   (every ~15 s or 50 m while online; the server keeps the last point)
//   GET  /api/provider/requests               -> { requests: [Request] }  (new + the accepted one)
//   POST /api/provider/requests/:id/accept    -> { request }  (now includes customer_phone)
//   POST /api/provider/requests/:id/decline   -> { ok: true }
//   POST /api/provider/requests/:id/complete  -> { request }
//   GET  /api/provider/jobs                   -> { jobs: [Request] }  (finished jobs, newest first)
//
// Request: { id, service, customer_name, area, landmark, lat, lng, distance_km, note, status, created_at, customer_phone? }
// The customer's lat/lng (and phone) are only sent after 'accepted'.
// status: 'new' | 'accepted' | 'done'. The phone is only sent after 'accepted'.

const use = (real, fake) => (USE_MOCK_PROVIDER ? fake : real);

export const POLL_MS = USE_MOCK_PROVIDER ? 3000 : 10000;

export const setOnline = (token, online, coords) =>
  use(
    () => request('/api/provider/online', { method: 'PUT', token, body: { online, lat: coords?.lat, lng: coords?.lng } }),
    () => mock.setOnline(online, coords)
  )();

export const sendLocation = (token, coords) =>
  use(
    () => request('/api/provider/location', { method: 'PUT', token, body: { lat: coords.lat, lng: coords.lng } }),
    () => mock.setPosition(coords)
  )();

export const listRequests = (token) =>
  use(() => request('/api/provider/requests', { token }), () => mock.list())();

export const acceptRequest = (token, id) =>
  use(() => request(`/api/provider/requests/${id}/accept`, { method: 'POST', token }), () => mock.accept(id))();

export const declineRequest = (token, id) =>
  use(() => request(`/api/provider/requests/${id}/decline`, { method: 'POST', token }), () => mock.decline(id))();

export const completeRequest = (token, id) =>
  use(() => request(`/api/provider/requests/${id}/complete`, { method: 'POST', token }), () => mock.complete(id))();

export const listJobs = (token) =>
  use(() => request('/api/provider/jobs', { token }), async () => ({ jobs: mock.doneJobs().reverse() }))();

export const simulateRequest = mock.simulate;
