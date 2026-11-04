// Customer pays for a finished job. NiJibu keeps COMMISSION_PERCENT (default 13) and pays the rest to the fundi.
const db = require('../db');
const { HttpError } = require('../lib/httpError');
const { notify } = require('./notify');
const dispatch = require('./dispatch');
const provider = require('./paymentProvider');

const COMMISSION_PERCENT = Number(process.env.COMMISSION_PERCENT ?? 13);
const NETWORKS = ['mpesa', 'mixx', 'airtel', 'halopesa'];
const MIN_PRICE = Number(process.env.MIN_PRICE ?? 10000); // jobs under TZS 10,000 are not accepted
const MAX_PRICE = 5000000;
const PENDING_MS = 10 * 60 * 1000; // a payment the customer never approved on the phone is closed after 10 minutes

// The split, in whole shillings (the fee is rounded, the fundi gets the rest, so the two always add up)
function split(amount, percent = COMMISSION_PERCENT) {
  const fee = Math.round((amount * percent) / 100);
  return { fee, payout: amount - fee, fee_percent: percent };
}

const validPrice = (v) => Number.isInteger(v) && v >= MIN_PRICE && v <= MAX_PRICE;

// Pay the fundi his share (called after the customer paid, and by the admin to retry). Never throws.
async function sendPayout(paymentId) {
  const payment = await db('payments').where({ id: paymentId }).first();
  if (!payment || payment.status !== 'paid') return null;
  const p = await db('provider_profiles').where({ id: payment.provider_id }).first('user_id', 'payout_network', 'payout_number');

  let row = await db('payouts').where({ payment_id: payment.id }).first();
  if (!row) {
    [row] = await db('payouts')
      .insert({ payment_id: payment.id, provider_id: payment.provider_id, amount: payment.payout, network: p?.payout_network || null, number: p?.payout_number || null })
      .returning('*');
  }
  if (row.status === 'sent') return row;

  // The customer has a complaint in progress for this job: the money waits until the admin answers
  if (await require('./complaints').holdsPayout(payment.request_id)) {
    await db('payouts').where({ id: row.id }).update({ status: 'pending', failure: 'ON_HOLD' });
    return { ...row, status: 'pending', failure: 'ON_HOLD' };
  }

  // No payout number saved yet: the money waits (pending) until the fundi adds it
  const number = p?.payout_number;
  const network = p?.payout_network;
  if (!number || !network) {
    await db('payouts').where({ id: row.id }).update({ status: 'pending', failure: 'NO_PAYOUT_DETAILS' });
    return { ...row, status: 'pending', failure: 'NO_PAYOUT_DETAILS' };
  }

  let result;
  try {
    result = await provider.payout({ amount: row.amount, number, network });
  } catch (e) {
    result = { ok: false, failure: e.code || 'ERROR' };
  }
  if (result.ok) {
    await db('payouts').where({ id: row.id }).update({ status: 'sent', reference: result.reference, network, number, failure: null, sent_at: db.fn.now() });
    await notify(p.user_id, 'payment_received', 'You were paid', `TZS ${row.amount} was sent to your ${network} number.`, { amount: row.amount });
  } else {
    await db('payouts').where({ id: row.id }).update({ status: 'failed', failure: String(result.failure || 'ERROR').slice(0, 100) });
  }
  return db('payouts').where({ id: row.id }).first();
}

// The customer pays the price the fundi entered
async function payRequest(user, requestId, { network, phone }) {
  if (!NETWORKS.includes(network)) throw new HttpError(400, 'VALIDATION', 'Choose a network');
  const digits = String(phone || '').replace(/\D/g, '');
  const msisdn = digits.length === 9 ? `255${digits}` : digits.startsWith('0') && digits.length === 10 ? `255${digits.slice(1)}` : digits;
  if (!/^255[67]\d{8}$/.test(msisdn)) throw new HttpError(400, 'VALIDATION', 'Bad phone number');

  const r = await db('requests').where({ id: requestId, customer_id: user.id }).first();
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Request not found');
  if (r.status !== 'completed' || !validPrice(r.agreed_price)) throw new HttpError(409, 'BAD_STATE', 'Nothing to pay yet');
  if (!r.customer_confirmed_at) throw new HttpError(409, 'NOT_CONFIRMED', 'Confirm that the work is done first');

  const existing = await db('payments').where({ request_id: r.id }).first();
  if (existing?.status === 'paid') throw new HttpError(409, 'ALREADY_PAID', 'Already paid');

  // Use the numbers saved when the fundi set the price (the commission at that time)
  const money = split(r.agreed_price, r.fee_percent ?? COMMISSION_PERCENT);
  // One payments row per request (the money record). Every try is also kept in payment_attempts.
  // A failed one is tried again with the same row; the guard below stops two taps paying twice.
  let payment = existing;
  if (!payment) {
    try {
      [payment] = await db('payments')
        .insert({ request_id: r.id, service_id: r.service_id, customer_id: user.id, provider_id: r.provider_id, amount: r.agreed_price, ...money, status: 'pending', pending_at: db.fn.now(), network, phone: msisdn })
        .returning('*');
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'PAYMENT_BUSY', 'Payment is in progress');
      throw err;
    }
  } else {
    const claimed = await db('payments').where({ id: payment.id, status: 'failed' }).update({ status: 'pending', pending_at: db.fn.now(), reference: null, network, phone: msisdn, failure: null, ...money, amount: r.agreed_price, attempts: db.raw('attempts + 1') });
    if (!claimed) throw new HttpError(409, 'PAYMENT_BUSY', 'Payment is in progress');
    payment = await db('payments').where({ id: payment.id }).first();
  }

  const attempt = (status, extra) =>
    db('payment_attempts').insert({ payment_id: payment.id, request_id: r.id, customer_id: user.id, amount: r.agreed_price, network, phone: msisdn, status, ...extra });

  let result;
  try {
    // orderId: unique for every try, so a retry never reuses an old order at the provider
    result = await provider.collect({ amount: r.agreed_price, phone: msisdn, network, orderId: `NJP${payment.id}A${payment.attempts}`, buyer: { name: user.name, email: user.email } });
  } catch (e) {
    await db('payments').where({ id: payment.id }).update({ status: 'failed', failure: e.code || 'ERROR' });
    await attempt('failed', { failure: e.code || 'ERROR' });
    throw e;
  }
  if (!result.ok) {
    const failure = String(result.failure || 'DECLINED').slice(0, 100);
    await db('payments').where({ id: payment.id }).update({ status: 'failed', failure });
    await attempt('failed', { failure });
    throw new HttpError(402, 'PAYMENT_FAILED', 'The payment was not completed');
  }

  if (result.pending) {
    // Mobile money: the customer approves on the phone. The result comes later (webhook / status check) -> settle()
    await db('payments').where({ id: payment.id }).update({ reference: result.reference });
    await attempt('pending', { reference: result.reference });
    await dispatch.publishStatus(r.id);
    return db('payments').where({ id: payment.id }).first();
  }

  await db('payments').where({ id: payment.id }).update({ status: 'paid', reference: result.reference, paid_at: db.fn.now(), failure: null });
  await attempt('success', { reference: result.reference });
  await notify(user.id, 'payment_done', 'Payment received', `Thank you. TZS ${r.agreed_price} was paid.`, { amount: r.agreed_price });

  await sendPayout(payment.id); // the fundi's share goes out right away (never throws)
  await dispatch.publishStatus(r.id); // both apps refresh
  return db('payments').where({ id: payment.id }).first();
}

// Close a payment that was waiting for the customer: from the provider's webhook, the status check, or the timeout.
// Safe to call twice (only a payment still "pending" is changed). outcome = { state: 'paid' | 'failed', failure? }
async function settle(orderId, outcome) {
  const payment = await db('payments').where({ reference: orderId, status: 'pending' }).first();
  if (!payment) return null; // unknown, or already closed
  if (outcome.state === 'paid') {
    const n = await db('payments').where({ id: payment.id, status: 'pending' }).update({ status: 'paid', paid_at: db.fn.now(), failure: null });
    if (!n) return null;
    await db('payment_attempts').where({ payment_id: payment.id, reference: orderId, status: 'pending' }).update({ status: 'success' });
    await notify(payment.customer_id, 'payment_done', 'Payment received', `Thank you. TZS ${payment.amount} was paid.`, { amount: payment.amount });
    await sendPayout(payment.id); // the fundi's share goes out (never throws)
  } else if (outcome.state === 'failed') {
    const failure = String(outcome.failure || 'DECLINED').slice(0, 100);
    const n = await db('payments').where({ id: payment.id, status: 'pending' }).update({ status: 'failed', failure });
    if (!n) return null;
    await db('payment_attempts').where({ payment_id: payment.id, reference: orderId, status: 'pending' }).update({ status: 'failed', failure });
  } else {
    return null;
  }
  await dispatch.publishStatus(payment.request_id); // both apps refresh
  return db('payments').where({ id: payment.id }).first();
}

// The provider told us something about this order (webhook). We never trust the message itself:
// we ask the provider for the real status, then settle.
async function onProviderNotice(orderId) {
  const s = await provider.status({ orderId });
  if (String(orderId).startsWith('NJV')) { // a worker's registration fee, not a job payment
    if (s.state !== 'pending') await require('./verificationFee').settle(orderId, s);
    return null;
  }
  if (s.state === 'pending') return null;
  const done = await settle(orderId, s);
  if (!done && s.state === 'paid') {
    const known = await db('payment_attempts').where({ reference: orderId }).first('id', 'payment_id', 'status');
    if (known && known.status === 'failed') console.error(`[payments] MONEY RECEIVED for a payment we closed as failed (order ${orderId}, payment ${known.payment_id}). Check it by hand.`);
  }
  return done;
}

// Runs every few seconds on the server: asks the provider about waiting payments and closes the old ones.
async function reconcilePending() {
  const rows = await db('payments').where({ status: 'pending' }).select('id', 'reference', 'pending_at');
  for (const p of rows) {
    try {
      if (p.reference) {
        const s = await provider.status({ orderId: p.reference });
        if (s.state !== 'pending') {
          await settle(p.reference, s);
          continue;
        }
      }
      if (Date.now() - new Date(p.pending_at).getTime() > PENDING_MS) {
        if (p.reference) await settle(p.reference, { state: 'failed', failure: 'TIMEOUT' });
        else await db('payments').where({ id: p.id, status: 'pending' }).update({ status: 'failed', failure: 'TIMEOUT' });
      }
    } catch (e) {
      console.warn(`[payments] check of payment ${p.id} failed:`, e.message);
    }
  }
}

// What each side may see about the payment of a request
async function paymentView(requestId, role) {
  const p = await db('payments').where({ request_id: requestId }).first();
  if (!p) return null;
  if (role === 'customer') return { code: p.code, status: p.status, amount: p.amount, paid_at: p.paid_at };
  const out = await db('payouts').where({ payment_id: p.id }).first();
  return {
    code: p.code, status: p.status, amount: p.amount, fee: p.fee, fee_percent: p.fee_percent, payout: p.payout, paid_at: p.paid_at,
    payout_status: out?.status || null,
    received_at: out?.received_at || null,
    complaint_status: out?.complaint_status || null,
    complaint_note: out?.complaint_note || null,
  };
}

// The fundi says "I received the money"
async function confirmReceived(user, requestId) {
  const row = await db('payouts as po')
    .join('payments as pay', 'pay.id', 'po.payment_id')
    .join('provider_profiles as p', 'p.id', 'po.provider_id')
    .where({ 'pay.request_id': requestId, 'p.user_id': user.id })
    .first('po.id', 'po.status', 'po.received_at', 'po.complaint_status');
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Payment not found');
  if (row.status !== 'sent') throw new HttpError(409, 'BAD_STATE', 'The money was not sent yet');
  if (row.complaint_status === 'open') throw new HttpError(409, 'COMPLAINT_OPEN', 'You have an open complaint');
  await db('payouts').where({ id: row.id }).update({ received_at: db.fn.now() });
}

// The fundi says "I did not receive it" (or something is wrong). The admin gets it in /api/admin/complaints.
async function fileComplaint(user, requestId, note) {
  const text = typeof note === 'string' ? note.trim().slice(0, 300) : '';
  if (text.length < 5) throw new HttpError(400, 'VALIDATION', 'Say what is wrong');
  const row = await db('payouts as po')
    .join('payments as pay', 'pay.id', 'po.payment_id')
    .join('provider_profiles as p', 'p.id', 'po.provider_id')
    .where({ 'pay.request_id': requestId, 'p.user_id': user.id })
    .first('po.id', 'po.status', 'po.received_at', 'po.complaint_status');
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Payment not found');
  if (row.received_at) throw new HttpError(409, 'BAD_STATE', 'You already confirmed this payment');
  if (row.complaint_status === 'open') throw new HttpError(409, 'COMPLAINT_OPEN', 'You already have an open complaint');
  const info = await db('payments').where({ request_id: requestId }).first('customer_id');
  try {
    await db('complaints').insert({ request_id: requestId, from_user_id: user.id, from_role: 'worker', against_user_id: info?.customer_id || null, reason: 'payment_not_received', message: text, payout_id: row.id });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'COMPLAINT_OPEN', 'You already have an open complaint');
    throw err;
  }
  await db('payouts').where({ id: row.id }).update({ complaint: text, complaint_at: db.fn.now(), complaint_status: 'open', complaint_note: null, resolved_at: null });
  const admins = await db('users').where({ role: 'admin' }).pluck('id');
  for (const id of admins) await notify(id, 'payout_complaint', 'Payout complaint', `A fundi reported a problem with a payout (request ${requestId}).`);
}

module.exports = { confirmReceived, fileComplaint, payRequest, sendPayout, paymentView, settle, onProviderNotice, reconcilePending, PENDING_MS, split, validPrice, COMMISSION_PERCENT, NETWORKS, MIN_PRICE, MAX_PRICE };
