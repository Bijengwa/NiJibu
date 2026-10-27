import { getItem, setItem } from '../storage';
import { ApiError } from './client';

// TEST MODE: a fake "fundi" server kept on the phone, so every screen can be tested
// before the real endpoints exist. Photos and the NIDA number are NOT stored.
const key = (userId) => `mockProvider:${userId}`;
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));

let currentUser = null;
export const setMockUser = (id) => {
  currentUser = id;
};

const cache = {}; // also keeps the data when secure storage is not available

async function read() {
  if (cache[currentUser]) return cache[currentUser];
  const raw = await getItem(key(currentUser));
  return raw ? JSON.parse(raw) : null;
}

async function write(provider) {
  cache[currentUser] = provider;
  await setItem(key(currentUser), JSON.stringify(provider));
  return provider;
}

const empty = () => ({
  status: 'incomplete',
  rejection_reason: null,
  full_name: null,
  email: null,
  nida_name: null,
  services: [],
  region: null,
  district: null,
  ward: null,
  lat: null,
  lng: null,
  experience: null,
  availability: null,
  nida_submitted: false,
  payout_set: false,
});

export async function getProvider() {
  await wait(250);
  return { provider: { ...((await read()) ?? empty()) } };
}

export async function saveDetails(_token, details) {
  await wait();
  const p = { ...((await read()) ?? empty()), ...details };
  return { provider: await write(p) };
}

export async function submitNida() {
  await wait(1200);
  const p = { ...((await read()) ?? empty()), nida_submitted: true, status: 'pending', rejection_reason: null };
  return { provider: await write(p) };
}

// Demo NIDA: finds the person and matches the fingerprint.
export async function verifyNidaFingerprint() {
  await wait(2000);
  const base = (await read()) ?? empty();
  const p = {
    ...base,
    nida_submitted: true,
    nida_name: (base.full_name ?? '').toUpperCase(),
    status: 'verified',
    rejection_reason: null,
  };
  return { provider: await write(p) };
}

// Real NIDA numbers start with the date of birth: YYYYMMDD
const dobOf = (nida) => {
  const y = +nida.slice(0, 4), m = +nida.slice(4, 6), d = +nida.slice(6, 8);
  const dt = new Date(y, m - 1, d);
  const ok = y >= 1940 && y <= 2008 && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  return ok ? `${nida.slice(6, 8)}${nida.slice(4, 6)}${nida.slice(0, 4)}` : null; // DDMMYYYY
};

// Demo: last name "Nomatch" -> names do not match NIDA; phone 700000000 -> phone does not match.
export async function matchNida(d) {
  await wait(1800);
  if (!dobOf(d.nidaNumber)) throw new ApiError('NIDA_NOT_FOUND', 404);
  if (/^nomatch$/i.test(d.lastName)) throw new ApiError('NIDA_NAME_MISMATCH', 422);
  if (d.phone === '700000000') throw new ApiError('NIDA_PHONE_MISMATCH', 422);
  return { ok: true };
}

// Demo: the date of birth must match the NIDA number; a text answer "wrong" is wrong; the rest is accepted.
export async function checkAnswer({ nidaNumber, questionId, answer }) {
  await wait(500);
  if (questionId === 'dob') return { correct: answer.replace(/\D/g, '') === dobOf(nidaNumber) };
  return { correct: !/wrong/i.test(answer) };
}

// Runs after the phone code: the names, email and NIDA result go onto the new account.
export async function submitIdentity(draft) {
  await wait(600);
  const fullName = [draft.firstName, draft.middleName, draft.lastName].filter(Boolean).join(' ');
  const p = {
    ...((await read()) ?? empty()),
    full_name: fullName,
    email: draft.email,
    nida_submitted: true,
    nida_name: fullName.toUpperCase(),
    status: 'verified',
    rejection_reason: null,
  };
  return { provider: await write(p) };
}

export async function savePayout() {
  await wait();
  const p = { ...((await read()) ?? empty()), payout_set: true };
  return { provider: await write(p) };
}

export async function getLocations() {
  await wait(250);
  throw new ApiError('NOT_FOUND', 404); // caller falls back to the sample list
}

// Testing only: pretend an admin changed the status
export async function setMockStatus(status) {
  const p = {
    ...((await read()) ?? empty()),
    status,
    rejection_reason: status === 'rejected' ? 'mockRejected' : null,
  };
  return write(p);
}
