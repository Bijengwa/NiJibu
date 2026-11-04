import { request } from './client';

// Fundi (provider) API.
//   GET  /api/provider          -> { provider }   (status, details, nida_submitted, payout_set, is_online)
//   PUT  /api/provider          body: { services[] (slugs), lat, lng, experience, availability }
//   PUT  /api/provider/payout   body: { network, number }
//   GET|POST /api/provider/identity/fee, POST /check, POST /accept   (registration fee + NIDA check)
//   POST /api/provider/identity                   (after the phone code: links the checked NIDA to the account)
//
// provider.status: 'incomplete' | 'pending' | 'verified' | 'rejected'
// provider.rejection_reason: text written by the admin (or null)

export const getProvider = (token) => request('/api/provider', { token });

export const saveDetails = (token, details) => request('/api/provider', { method: 'PUT', token, body: details });

// asset = { uri, mimeType } from the image picker
const file = (asset, name) => {
  const type = asset.mimeType || 'image/jpeg';
  return { uri: asset.uri, name: `${name}.${type.split('/')[1] || 'jpg'}`, type };
};

// --- Registration fee + NIDA check (the account may not exist yet, so these calls have no token) ---
// Every try costs the registration fee (no refund). A try = ONE NIDA hit with everything together,
// and a second hit only to correct mistakes.
export const getFee = () => request('/api/provider/identity/fee');

// phone = the account phone, payPhone = the number the worker typed to pay from (no network to choose)
//   -> { fee: { id, status: 'paid' | 'pending' | 'failed', amount, failure } }
export const payFee = ({ phone, payPhone }) => request('/api/provider/identity/fee', { method: 'POST', body: { phone, pay_phone: payPhone }, timeout: 45000 });

export const feeStatus = ({ id, phone }) => request(`/api/provider/identity/fee/${id}?phone=${encodeURIComponent(phone)}`);

// ONE NIDA hit. Answer: { result: 'passed' | 'retry' | 'failed' | 'number_differs', wrong?: ['name'|'nida'|'phone'|'answer'], hits_left, nida_number? }
// errors: FEE_REQUIRED, CHECK_CLOSED, QUESTION_REPEATED, NOT_BUILT
export const checkIdentity = ({ feeId, phone, nidaNumber, firstName, middleName, lastName, questionId, answer }) =>
  request('/api/provider/identity/check', {
    method: 'POST',
    body: { fee_id: feeId, phone, nida_number: nidaNumber, first_name: firstName, middle_name: middleName, last_name: lastName, question_id: questionId, answer },
    timeout: 30000,
  });

// NIDA's own number differs from the typed one. accept = true: use it (no new NIDA hit).
export const acceptNida = ({ feeId, phone, accept }) =>
  request('/api/provider/identity/accept', { method: 'POST', body: { fee_id: feeId, phone, accept } });

// After the phone code: link the checked NIDA number and names to the new account.
export const submitIdentity = (token, draft) =>
  request('/api/provider/identity', {
    method: 'POST',
    token,
    body: {
      first_name: draft.firstName, middle_name: draft.middleName, last_name: draft.lastName,
      email: draft.email, nida_number: draft.nidaNumber,
    },
  });

export const savePayout = (token, { network, number }) => request('/api/provider/payout', { method: 'PUT', token, body: { network, number } });
