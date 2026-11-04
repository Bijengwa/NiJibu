// The registration fee a worker pays once, after the phone code (default 1,000 TSh, no refund).
// Paying it opens the worker account: the profile is created and marked verified.
// Money goes through the same provider as job payments (PAYMENTS_MODE: mock | selcom).
//   mock: a phone ending 0000 is declined, ending 1111 waits about 8 seconds (like a USSD prompt), anything else pays at once.
const db = require('../db');
const { HttpError } = require('../lib/httpError');
const provider = require('./paymentProvider');

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

const view = (f) => ({ id: f.id, status: f.status, amount: f.amount, failure: f.failure });

// The fee is paid: open the worker account (once). The worker can then pick jobs and receive requests.
async function activate(userId) {
  const now = db.fn.now();
  const p = await db('provider_profiles').where({ user_id: userId }).first('id', 'registered_at');
  if (!p) await db('provider_profiles').insert({ user_id: userId, registered_at: now, verification_status: 'verified', verified_at: now });
  else if (!p.registered_at) await db('provider_profiles').where({ id: p.id }).update({ registered_at: now, verification_status: 'verified', verified_at: now, rejection_reason: null });
}

const activateByPhone = async (phone) => {
  const u = await db('users').where({ phone }).first('id');
  if (u) await activate(u.id);
};

async function isRegistered(userId) {
  const p = await db('provider_profiles').where({ user_id: userId }).first('registered_at');
  return !!p?.registered_at;
}

// The worker pays. Returns the fee view: paid | pending (approve on the phone) | failed
// user      = the logged-in worker ({ id, phone })
// pay_phone = the number the worker typed to pay from (mobile money). Defaults to the account phone.
async function pay(user, { pay_phone } = {}) {
  const m = msisdn(user.phone);
  const payer = pay_phone === undefined || pay_phone === null || pay_phone === '' ? m : msisdn(pay_phone);
  if (!m || !payer) throw new HttpError(400, 'VALIDATION', 'Check the phone numbers');

  // Already paid (for example the app closed after paying): never charge twice
  const paid = await db('registration_fees').where({ phone: m, status: 'paid' }).orderBy('id', 'desc').first();
  if (paid) {
    await activate(user.id);
    return view(paid);
  }
  // A prompt is already waiting on the phone
  const waiting = await db('registration_fees').where({ phone: m, pay_phone: payer, status: 'pending' }).where('created_at', '>', new Date(Date.now() - PENDING_MS)).orderBy('id', 'desc').first();
  if (waiting) return view(waiting);

  const network = networkOf(payer);
  const [fee] = await db('registration_fees').insert({ phone: m, pay_phone: payer, amount: amount(), network }).returning('*');
  const orderId = `${PREFIX}${fee.id}`;
  let result;
  try {
    result = await provider.collect({ amount: fee.amount, phone: payer, network, orderId, buyer: { name: 'NiJibu worker' } });
  } catch (e) {
    await db('registration_fees').where({ id: fee.id }).update({ status: 'failed', failure: String(e.code || 'ERROR').slice(0, 100) });
    throw e;
  }
  if (!result.ok) {
    const failure = String(result.failure || 'DECLINED').slice(0, 100);
    const [row] = await db('registration_fees').where({ id: fee.id }).update({ status: 'failed', failure }).returning('*');
    changed();
    return view(row);
  }
  if (result.pending) {
    const [row] = await db('registration_fees').where({ id: fee.id }).update({ reference: orderId }).returning('*');
    return view(row);
  }
  const [row] = await db('registration_fees').where({ id: fee.id }).update({ status: 'paid', reference: result.reference || orderId, paid_at: db.fn.now() }).returning('*');
  provider.recordCollected(fee.amount, 'worker_fee');
  await activate(user.id);
  changed();
  return view(row);
}

// Close a fee that was waiting for the worker. Safe to call twice.
async function settle(orderId, outcome) {
  const fee = await db('registration_fees').where({ reference: orderId, status: 'pending' }).first();
  if (!fee) return null;
  const patch = outcome.state === 'paid' ? { status: 'paid', paid_at: db.fn.now(), failure: null }
    : outcome.state === 'failed' ? { status: 'failed', failure: String(outcome.failure || 'DECLINED').slice(0, 100) } : null;
  if (!patch) return null;
  const n = await db('registration_fees').where({ id: fee.id, status: 'pending' }).update(patch);
  if (!n) return null;
  if (patch.status === 'paid') {
    provider.recordCollected(fee.amount, 'worker_fee');
    await activateByPhone(fee.phone);
  }
  changed();
  return db('registration_fees').where({ id: fee.id }).first();
}

// The app asks: is my payment done? Only the account that paid can ask.
async function status(id, user) {
  const m = msisdn(user.phone);
  let fee = m && Number.isInteger(id) ? await db('registration_fees').where({ id, phone: m }).first() : null;
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
    if (s.state !== 'pending') fee = (await settle(fee.reference || `${PREFIX}${fee.id}`, s)) || (await db('registration_fees').where({ id }).first());
  }
  return view(fee);
}

const changed = () => require('../lib/adminEvents').notify(); // the admin portal refreshes

module.exports = { amount, msisdn, networkOf, pay, status, settle, activate, isRegistered, view, PREFIX };
