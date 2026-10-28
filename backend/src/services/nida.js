// NIDA check. DEMO MODE ("mock"): no call to NIDA. Any 20-digit number is accepted, then the fundi gets 6 questions:
//   the FIRST answer is always wrong (so the app shows what a wrong answer looks like) and the next 5 are right,
//   so 5 right in a row is reached on question 6. An answer containing the word "wrong" is also wrong (to test a fail).
// Replace match / answer with the real NIDA API later; the routes and the limits below stay the same.
//
// The server (not the app) counts the answers:
//   NEED correct answers in a row = pass, MAX questions at most, then locked for LOCK_MS.
// State is kept in memory (one server). Move to the database / Redis before running more than one server.
const MODE = process.env.NIDA_MODE || (process.env.NODE_ENV === 'production' ? 'manual' : 'mock');
const NEED = 5;
const MAX = MODE === 'mock' ? 6 : 8; // demo: exactly 6 questions (1 wrong + 5 right)
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

// (kept for the real NIDA later) date of birth from the number: DDMMYYYY
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
  if (MODE !== 'mock') throw new NidaError(501, 'NOT_BUILT');
  if (!/^\d{20}$/.test(nida_number)) throw new NidaError(404, 'NIDA_NOT_FOUND');
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
  if (MODE !== 'mock') throw new NidaError(501, 'NOT_BUILT');
  if (s.passedUntil > Date.now()) return { correct: true };
  // Demo: the questions can also start from the details screen (no sign-up "match" step before), so no match is needed
  s.matched = true;

  // demo rules: the first answer is wrong, the rest are right unless the text says "wrong"
  const correct = s.asked > 0 && !/wrong/i.test(String(a));

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

module.exports = { MODE, NidaError, match, answer, hasPassed, nameFor };
