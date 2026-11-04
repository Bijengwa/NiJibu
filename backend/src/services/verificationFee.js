// The registration fee a worker pays before each identity check (default 1,000 TSh, no refund).
// One paid fee = one try = at most 2 NIDA hits (the 2nd is only for corrections).
// Money goes through the same provider as job payments (PAYMENTS_MODE: mock | selcom).
//   mock: a phone ending 0000 is declined, ending 1111 waits about 8 seconds (like a USSD prompt), anything else pays at once.
const db = require('../db');
const { HttpError } = require('../lib/httpError');
const provider = require('./paymentProvider');
const secret = require('../lib/secret');

const NETWORKS = ['mpesa', 'mixx', 'airtel', 'halopesa'];
const MAX_HITS = 2;
const PASS_MS = 60 * 60 * 1000; // a passed check can be linked to an account for 1 hour
const PENDING_MS = 10 * 60 * 1000; // a prompt the worker never approved is closed after 10 minutes
const MOCK_PENDING_MS = 8000;
const PREFIX = 'NJV'; // order ids of fees start with this (job payments use NJP)

const amount = () => {
  const n = Number(process.env.REGISTRATION_FEE ?? 1000);
  return Number.isInteger(n) && n >= 100 ? n : 1000;
};

// 795259567 | 0795259567 | 255795259567  ->  255795259567
function msisdn(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  const m = d.length === 9 ? `255${d}` : d.startsWith('0') && d.length === 10 ? `255${d.slice(1)}` : d;
  return /^255[67]\d{8}$/.test(m) ? m : null;
}

// Selcom needs only the amount and the phone number, so the worker does not choose a network.
// We still keep the network in our records: a best guess from the start of the number (can be wrong, never used for money).
function networkOf(m) {
  const p = String(m).slice(3, 5); // 255 7 5 ... -> "75"
  if (['74', '75', '76'].includes(p)) return 'mpesa';
  if (['65', '67', '71', '77'].includes(p)) return 'mixx';
  if (['68', '69', '78'].includes(p)) return 'airtel';
  if (['61', '62'].includes(p)) return 'halopesa';
  return null;
}

const view = (f) => ({ id: f.id, status: f.status, amount: f.amount, failure: f.failure, outcome: f.outcome, hits_left: Math.max(0, MAX_HITS - f.hits) });

// The worker pays. Returns the fee row view: paid | pending (approve on the phone) | failed
// phone     = the account phone (the check and the account link use it)
// pay_phone = the number the worker typed to pay from (mobile money). Defaults to the account phone.
async function pay({ phone, pay_phone }) {
  const m = msisdn(phone);
  const payer = pay_phone === undefined || pay_phone === null || pay_phone === '' ? m : msisdn(pay_phone);
  if (!m || !payer) throw new HttpError(400, 'VALIDATION', 'Check the phone numbers');
  const network = networkOf(payer);

  // Already paid and not used yet (for example the app closed after paying): never charge twice for one try
  const unused = await db('verification_fees').where({ phone: m, status: 'paid', outcome: 'open' }).where('hits', '<', MAX_HITS).orderBy('id', 'desc').first();
  if (unused) return view(unused);
  // A prompt is already waiting on the phone
  const waiting = await db('verification_fees').where({ phone: m, pay_phone: payer, status: 'pending' }).where('created_at', '>', new Date(Date.now() - PENDING_MS)).orderBy('id', 'desc').first();
  if (waiting) return view(waiting);

  const [fee] = await db('verification_fees').insert({ phone: m, pay_phone: payer, amount: amount(), network }).returning('*');
  const orderId = `${PREFIX}${fee.id}`;
  let result;
  try {
    result = await provider.collect({ amount: fee.amount, phone: payer, network, orderId, buyer: { name: 'NiJibu worker' } });
  } catch (e) {
    await db('verification_fees').where({ id: fee.id }).update({ status: 'failed', failure: String(e.code || 'ERROR').slice(0, 100) });
    throw e;
  }
  if (!result.ok) {
    const failure = String(result.failure || 'DECLINED').slice(0, 100);
    const [row] = await db('verification_fees').where({ id: fee.id }).update({ status: 'failed', failure }).returning('*');
    changed();
    return view(row);
  }
  if (result.pending) {
    const [row] = await db('verification_fees').where({ id: fee.id }).update({ reference: orderId }).returning('*');
    return view(row);
  }
  const [row] = await db('verification_fees').where({ id: fee.id }).update({ status: 'paid', reference: result.reference || orderId, paid_at: db.fn.now() }).returning('*');
  changed();
  return view(row);
}

// Close a fee that was waiting for the worker. Safe to call twice.
async function settle(orderId, outcome) {
  const fee = await db('verification_fees').where({ reference: orderId, status: 'pending' }).first();
  if (!fee) return null;
  const patch = outcome.state === 'paid' ? { status: 'paid', paid_at: db.fn.now(), failure: null }
    : outcome.state === 'failed' ? { status: 'failed', failure: String(outcome.failure || 'DECLINED').slice(0, 100) } : null;
  if (!patch) return null;
  const n = await db('verification_fees').where({ id: fee.id, status: 'pending' }).update(patch);
  if (!n) return null;
  changed();
  return db('verification_fees').where({ id: fee.id }).first();
}

// The app asks: is my payment done? Only the phone that paid can ask.
async function status(id, phone) {
  const m = msisdn(phone);
  let fee = m && Number.isInteger(id) ? await db('verification_fees').where({ id, phone: m }).first() : null;
  if (!fee) throw new HttpError(404, 'NOT_FOUND', 'Payment not found');
  if (fee.status === 'pending') {
    const age = Date.now() - new Date(fee.created_at).getTime();
    let s = { state: 'pending' };
    if (provider.MODE === 'mock') {
      if (age > MOCK_PENDING_MS) s = { state: 'paid' };
    } else if (fee.reference) {
      s = await provider.status({ orderId: fee.reference });
    }
    if (s.state === 'pending' && age > PENDING_MS) s = { state: 'failed', failure: 'TIMEOUT' };
    if (s.state !== 'pending') fee = (await settle(fee.reference || `${PREFIX}${fee.id}`, s)) || (await db('verification_fees').where({ id }).first());
  }
  return view(fee);
}

// A paid, still open fee for this try, or an error the app turns into "pay first"
async function open(id, phone) {
  const m = msisdn(phone);
  const fee = m && Number.isInteger(id) ? await db('verification_fees').where({ id, phone: m }).first() : null;
  if (!fee || fee.status !== 'paid') throw new HttpError(402, 'FEE_REQUIRED', 'Pay the registration fee first');
  if (fee.outcome !== 'open' || fee.hits >= MAX_HITS) throw new HttpError(409, 'CHECK_CLOSED', 'This try is finished. Pay again to try again.');
  return fee;
}

// Use one NIDA hit. Atomic: two taps cannot use the same hit twice.
async function startHit(id, phone, questionId) {
  const fee = await open(id, phone);
  const asked = Array.isArray(fee.asked) ? fee.asked : [];
  if (asked.includes(questionId)) throw new HttpError(400, 'QUESTION_REPEATED', 'Answer a different question');
  const n = await db('verification_fees').where({ id: fee.id, outcome: 'open', hits: fee.hits }).update({ hits: fee.hits + 1, asked: JSON.stringify([...asked, questionId]) });
  if (!n) throw new HttpError(409, 'BUSY', 'Try again');
  return { ...fee, hits: fee.hits + 1, asked: [...asked, questionId] };
}

// NIDA could not be reached (our problem, not the worker's): give the hit back
async function giveBackHit(fee, questionId) {
  await db('verification_fees').where({ id: fee.id }).update({ hits: db.raw('greatest(hits - 1, 0)'), asked: JSON.stringify((fee.asked || []).filter((q) => q !== questionId)) });
}

async function markPassed(fee, nidaNumber) {
  await db('verification_fees').where({ id: fee.id }).update({
    outcome: 'passed', offered_nida_enc: null, passed_nida_hash: secret.hash(nidaNumber), passed_until: new Date(Date.now() + PASS_MS),
  });
  changed();
}
const markFailed = async (fee) => { await db('verification_fees').where({ id: fee.id }).update({ outcome: 'failed', offered_nida_enc: null }); changed(); };
const offer = (fee, nidaNumber) => db('verification_fees').where({ id: fee.id }).update({ offered_nida_enc: secret.encrypt(nidaNumber) });

// After the phone code: has this NIDA number passed for this phone, and not been linked yet?
function passedFor(phone, nidaNumber) {
  return db('verification_fees')
    .where({ phone: msisdn(phone) || phone, outcome: 'passed', passed_nida_hash: secret.hash(nidaNumber) })
    .whereNull('linked_at').where('passed_until', '>', db.fn.now()).orderBy('id', 'desc').first();
}
const markLinked = (id) => db('verification_fees').where({ id }).update({ linked_at: db.fn.now() });

const changed = () => require('../lib/adminEvents').notify(); // the admin portal refreshes

module.exports = { amount, msisdn, networkOf, pay, status, settle, open, startHit, giveBackHit, markPassed, markFailed, offer, passedFor, markLinked, view, MAX_HITS, PREFIX, NETWORKS };
