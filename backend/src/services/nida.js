// NIDA check. ONE request to NIDA carries everything: the NIDA number, the names, the phone and the answer to ONE question.
// NIDA answers each part separately, so the worker is told exactly what to correct. A second request is allowed only
// for corrections (see verificationFee.js: 2 hits per paid try), so NIDA is not called again and again.
//
// NIDA_MODE = mock (default in development) | manual (default in production: an admin checks the photos) | live (real NIDA, see nidaLive.js).
//
// DEMO MODE ("mock"): no call to NIDA. Rules to test every result:
//   - a NIDA number that is not 20 digits is "not found"
//   - last name "Nomatch"            -> the names do not match
//   - phone 700000000                -> the phone does not match
//   - an answer containing "wrong"   -> the answer is wrong
//   - a NIDA number ending in 99     -> NIDA's own number differs (it ends in 00): the worker is asked to accept it
//   - anything else is right
const MODE = process.env.NIDA_MODE || (process.env.NODE_ENV === 'production' ? 'manual' : 'mock');

// The questions NIDA can check. The app asks one; the second try uses a different one.
const QUESTIONS = ['dob', 'fatherMiddle', 'motherMiddle'];

class NidaError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

// Returns { nida_ok, name_ok, phone_ok, answer_ok, record_number }
//   nida_ok       the number exists at NIDA (when false, nothing else can be judged)
//   record_number the number NIDA has for this person (can differ from the typed one)
async function check(input) {
  if (MODE === 'live') return require('./nidaLive').check(input);
  if (MODE !== 'mock') throw new NidaError(501, 'NOT_BUILT');
  const { nida_number: n, last_name, phone, answer } = input;
  return {
    nida_ok: /^\d{20}$/.test(n),
    name_ok: !/^nomatch$/i.test(last_name || ''),
    phone_ok: !String(phone).endsWith('700000000'),
    answer_ok: !/wrong/i.test(String(answer)),
    record_number: n.endsWith('99') ? `${n.slice(0, 18)}00` : n,
  };
}

const nameFor = (full) => String(full || '').toUpperCase();

module.exports = { MODE, NidaError, QUESTIONS, check, nameFor };
