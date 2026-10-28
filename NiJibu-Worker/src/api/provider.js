import { request } from './client';

// Fundi (provider) API.
//   GET  /api/provider          -> { provider }   (status, details, nida_submitted, payout_set, is_online)
//   PUT  /api/provider          body: { services[] (slugs), lat, lng, experience, availability }
//   POST /api/provider/nida     multipart: nida_number, selfie, id_photo   (private storage, admin only)
//   PUT  /api/provider/payout   body: { network, number }
//   POST /api/provider/identity/match | /answer   (sign-up check, before the account exists)
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

export const submitNida = (token, { nidaNumber, selfie, idPhoto }) => {
  const form = new FormData();
  form.append('nida_number', nidaNumber);
  form.append('selfie', file(selfie, 'selfie'));
  form.append('id_photo', file(idPhoto, 'id'));
  return request('/api/provider/nida', { method: 'POST', token, body: form, timeout: 60000 });
};

// Do the NIDA number, the names and the phone belong to the same person in NIDA?
// errors: NIDA_NOT_FOUND, NIDA_NAME_MISMATCH, NIDA_PHONE_MISMATCH, IDENTITY_LOCKED
export const matchNida = (d) =>
  request('/api/provider/identity/match', {
    method: 'POST',
    body: { nida_number: d.nidaNumber, first_name: d.firstName, middle_name: d.middleName, last_name: d.lastName, phone: d.phone },
    timeout: 30000,
  });

// One answer. The server counts them: 5 correct in a row passes, 8 questions at most, then locked for 24 hours.
export const checkAnswer = ({ nidaNumber, questionId, answer }) =>
  request('/api/provider/identity/answer', { method: 'POST', body: { nida_number: nidaNumber, question_id: questionId, answer } });

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
