// NIDA check. TEST MODE ("mock"): no call to NIDA; the date of birth is read from the NIDA number
// (it starts with YYYYMMDD) so the flow can be tested. Replace the 3 functions with the real NIDA API later;
// the routes and the limits below stay the same.
//
// The server (not the app) counts the answers:
//   NEED correct answers in a row = pass, MAX questions at most, then locked for LOCK_MS.
// State is kept in memory (one server). Move to the database / Redis before running more than one server.
const MODE = process.env.NIDA_MODE || (process.env.NODE_ENV === 'production' ? 'manual' : 'mock');
const NEED = 5;
const MAX = 8;
const LOCK_MS = 24 * 60 * 60 * 1000;
const PASS_MS = 60 * 60 * 1000; // a passed check can be linked to an account for 1 hour

const state = new Map(); // nida -> { matched, streak, asked, lockedUntil, passedUntil }
const get = (nida) => {
  if (!state.has(nida)) state.set(nida, { matched: false, streak: 0, asked: 0, lockedUntil: 0, passedUntil: 0 });
  return state.get(nida);
};
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of state) if (v.lockedUntil < now && v.passedUntil < now) state.delete(k);
}, 10 * 60 * 1000).unref();

const dobOf = (nida) => {
  const y = +nida.slice(0, 4), m = +nida.slice(4, 6), d = +nida.slice(6, 8);
  const dt = new Date(y, m - 1, d);
  const ok = y >= 1940 && y <= 2008 && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  return ok ? `${nida.slice(6, 8)}${nida.slice(4, 6)}${nida.slice(0, 4)}` : null; // DDMMYYYY
};

class NidaError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

// Do the NIDA number, names and phone belong to the same person?
async function match({ nida_number, last_name, phone }) {
  if (!/^\d{20}$/.test(nida_number) || !dobOf(nida_number)) throw new NidaError(404, 'NIDA_NOT_FOUND');
  const s = get(nida_number);
  if (s.lockedUntil > Date.now()) throw new NidaError(423, 'IDENTITY_LOCKED');
  // test rules: last name "Nomatch" or phone 700000000 do not match
  if (/^nomatch$/i.test(last_name || '')) throw new NidaError(422, 'NIDA_NAME_MISMATCH');
  if (String(phone) === '700000000') throw new NidaError(422, 'NIDA_PHONE_MISMATCH');
  Object.assign(s, { matched: true, streak: 0, asked: 0, passedUntil: 0 });
}

// One answer. Returns { correct }. Enforces the limits.
async function answer({ nida_number, question_id, answer: a }) {
  const s = get(nida_number);
  if (s.lockedUntil > Date.now()) throw new NidaError(423, 'IDENTITY_LOCKED');
  if (!s.matched) throw new NidaError(403, 'IDENTITY_NOT_VERIFIED');
  if (s.passedUntil > Date.now()) return { correct: true };

  // test rules: the date of birth must match the number; text "wrong" is wrong; the rest is accepted
  const correct =
    question_id === 'dob' ? String(a).replace(/\D/g, '') === dobOf(nida_number) : !/wrong/i.test(String(a));

  s.asked += 1;
  s.streak = correct ? s.streak + 1 : 0;
  if (s.streak >= NEED) s.passedUntil = Date.now() + PASS_MS;
  else if (s.asked >= MAX || MAX - s.asked < NEED - s.streak) {
    Object.assign(s, { matched: false, streak: 0, asked: 0, lockedUntil: Date.now() + LOCK_MS });
  }
  return { correct };
}

const hasPassed = (nida) => (state.get(nida)?.passedUntil ?? 0) > Date.now();
const nameFor = (full) => String(full || '').toUpperCase();

// Fingerprint check (test mode: always matches)
async function fingerprint() {
  if (MODE !== 'mock') throw new NidaError(501, 'NOT_BUILT');
}

module.exports = { MODE, NidaError, match, answer, hasPassed, nameFor, fingerprint };
