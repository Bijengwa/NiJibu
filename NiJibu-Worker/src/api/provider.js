import { request } from './client';

// Fundi (provider) API.
//   GET  /api/provider          -> { provider }   (status, details, fee_paid, payout_set, is_online)
//   PUT  /api/provider          body: { services[] (slugs), lat, lng, experience, availability }
//   PUT  /api/provider/payout   body: { network, number }
//   GET  /api/provider/registration/fee, POST /pay, GET /pay/:id   (the one-time registration fee, after the phone code)
//
// provider.status: 'incomplete' (fee not paid yet) | 'pending' | 'verified' | 'rejected'
// provider.rejection_reason: text written by the admin (or null)

export const getProvider = (token) => request('/api/provider', { token });

export const saveDetails = (token, details) => request('/api/provider', { method: 'PUT', token, body: details });

// --- Registration fee (the worker is logged in: the phone code is already confirmed) ---
// How much, and whether this worker already paid -> { amount, currency, paid }
export const getFee = (token) => request('/api/provider/registration/fee', { token });

// payPhone = the number the worker typed to pay from (no network to choose)
//   -> { fee: { id, status: 'paid' | 'pending' | 'failed', amount, failure } }
export const payFee = (token, { payPhone }) =>
  request('/api/provider/registration/pay', { method: 'POST', token, body: { pay_phone: payPhone }, timeout: 45000 });

export const feeStatus = (token, id) => request(`/api/provider/registration/pay/${id}`, { token });

export const savePayout = (token, { network, number }) => request('/api/provider/payout', { method: 'PUT', token, body: { network, number } });
