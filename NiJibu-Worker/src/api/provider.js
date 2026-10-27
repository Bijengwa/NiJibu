import { USE_MOCK_PROVIDER } from '../config';
import { SAMPLE_LOCATIONS } from '../data/locations';
import { request } from './client';
import * as mock from './providerMock';

// Fundi (provider) API. Proposed routes for the NiJibu backend:
//
//   GET  /api/provider          -> { provider }   (status, details, nida_submitted, payout_set)
//   PUT  /api/provider          body: { services[], lat, lng, experience, availability }   (lat/lng = where the fundi works)
//   PUT  /api/provider/location body: { lat, lng }   (live position while online, see jobs.js)
//   POST /api/provider/nida     multipart: nida_number, selfie, id_photo   (private storage, admin only)
//   POST /api/provider/nida/fingerprint  body: { nida_number, ... }  -> { provider }  (NOT BUILT: needs the NIDA service)
//   PUT  /api/provider/payout   body: { network, number }
//
// provider.status: 'incomplete' | 'pending' | 'verified' | 'rejected'
// provider.rejection_reason: text written by the admin (or null)

const use = (real, fake) => (USE_MOCK_PROVIDER ? fake : real);

export const setMockUser = mock.setMockUser;

export const getProvider = (token) =>
  use(() => request('/api/provider', { token }), () => mock.getProvider())();

export const saveDetails = (token, details) =>
  use(
    () => request('/api/provider', { method: 'PUT', token, body: details }),
    () => mock.saveDetails(token, details)
  )();

// asset = { uri, mimeType } from the image picker
const file = (asset, name) => {
  const type = asset.mimeType || 'image/jpeg';
  return { uri: asset.uri, name: `${name}.${type.split('/')[1] || 'jpg'}`, type };
};

export const submitNida = (token, { nidaNumber, selfie, idPhoto }) =>
  use(
    () => {
      const form = new FormData();
      form.append('nida_number', nidaNumber);
      form.append('selfie', file(selfie, 'selfie'));
      form.append('id_photo', file(idPhoto, 'id'));
      return request('/api/provider/nida', { method: 'POST', token, body: form, timeout: 60000 });
    },
    () => mock.submitNida()
  )();

// Fingerprint check against NIDA. In test mode the phone fingerprint only simulates it.
export const verifyNidaFingerprint = (token, { nidaNumber }) =>
  use(
    () => request('/api/provider/nida/fingerprint', { method: 'POST', token, body: { nida_number: nidaNumber }, timeout: 30000 }),
    () => mock.verifyNidaFingerprint()
  )();

// --- Sign-up identity check (before the account exists). All three are NOT BUILT: they need the NIDA service.
//
// 1. Do the NIDA number, the names and the phone belong to the same person in NIDA?
//    POST /api/provider/identity/match {nida_number, first_name, middle_name, last_name, phone}
//    errors: NIDA_NOT_FOUND, NIDA_NAME_MISMATCH, NIDA_PHONE_MISMATCH
export const matchNida = (d) =>
  use(
    () => request('/api/provider/identity/match', { method: 'POST', body: {
      nida_number: d.nidaNumber, first_name: d.firstName, middle_name: d.middleName, last_name: d.lastName, phone: d.phone,
    }, timeout: 30000 }),
    () => mock.matchNida(d)
  )();

// 2. One answer. The SERVER picks the questions (random, from NIDA's record), counts the tries,
//    and ends the session after 5 correct in a row or 8 questions. A failed person is locked for 24 hours.
//    POST /api/provider/identity/answer {nida_number, question_id, answer} -> { correct }
export const checkAnswer = ({ nidaNumber, questionId, answer }) =>
  use(
    () => request('/api/provider/identity/answer', { method: 'POST', body: { nida_number: nidaNumber, question_id: questionId, answer } }),
    () => mock.checkAnswer({ nidaNumber, questionId, answer })
  )();

// 3. After the phone code: link the checked NIDA number and names to the new account.
//    POST /api/provider/identity {first_name, middle_name, last_name, email, nida_number}
export const submitIdentity = (token, draft) =>
  use(
    () => request('/api/provider/identity', { method: 'POST', token, body: {
      first_name: draft.firstName, middle_name: draft.middleName, last_name: draft.lastName,
      email: draft.email, nida_number: draft.nidaNumber,
    } }),
    () => mock.submitIdentity(draft)
  )();

export const savePayout = (token, { network, number }) =>
  use(
    () => request('/api/provider/payout', { method: 'PUT', token, body: { network, number } }),
    () => mock.savePayout()
  )();

export async function getLocations(token) {
  try {
    return await use(() => request('/api/locations', { token }), () => mock.getLocations())();
  } catch {
    return SAMPLE_LOCATIONS;
  }
}

export const setMockStatus = mock.setMockStatus;
