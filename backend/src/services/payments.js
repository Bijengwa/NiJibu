// Customer pays for a finished job. NiJibu keeps COMMISSION_PERCENT (default 10) and pays the rest to the fundi.
const db = require('../db');
const { HttpError } = require('../lib/httpError');
const { notify } = require('./notify');
const dispatch = require('./dispatch');
const provider = require('./paymentProvider');

const COMMISSION_PERCENT = Number(process.env.COMMISSION_PERCENT ?? 10);
const NETWORKS = ['mpesa', 'mixx', 'airtel', 'halopesa'];
const MIN_PRICE = 1000;
const MAX_PRICE = 5000000;

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
    await notify(p.user_id, 'payment_received', 'You were paid', `TZS ${row.amount} was sent to your ${network} number.`);
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

  const money = split(r.agreed_price);
  // One row per request. A failed one is tried again with the same row; the guard below stops two taps paying twice.
  let payment = existing;
  if (!payment) {
    try {
      [payment] = await db('payments')
        .insert({ request_id: r.id, customer_id: user.id, provider_id: r.provider_id, amount: r.agreed_price, ...money, status: 'pending', network, phone: msisdn })
        .returning('*');
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'PAYMENT_BUSY', 'Payment is in progress');
      throw err;
    }
  } else {
    const claimed = await db('payments').where({ id: payment.id, status: 'failed' }).update({ status: 'pending', network, phone: msisdn, failure: null, ...money, amount: r.agreed_price });
    if (!claimed) throw new HttpError(409, 'PAYMENT_BUSY', 'Payment is in progress');
  }

  let result;
  try {
    result = await provider.collect({ amount: r.agreed_price, phone: msisdn, network });
  } catch (e) {
    await db('payments').where({ id: payment.id }).update({ status: 'failed', failure: e.code || 'ERROR' });
    throw e;
  }
  if (!result.ok) {
    await db('payments').where({ id: payment.id }).update({ status: 'failed', failure: String(result.failure || 'DECLINED').slice(0, 100) });
    throw new HttpError(402, 'PAYMENT_FAILED', 'The payment was not completed');
  }

  await db('payments').where({ id: payment.id }).update({ status: 'paid', reference: result.reference, paid_at: db.fn.now(), failure: null });
  await notify(user.id, 'payment_done', 'Payment received', `Thank you. TZS ${r.agreed_price} was paid.`);

  await sendPayout(payment.id); // the fundi's share goes out right away (never throws)
  await dispatch.publishStatus(r.id); // both apps refresh
  return db('payments').where({ id: payment.id }).first();
}

// What each side may see about the payment of a request
async function paymentView(requestId, role) {
  const p = await db('payments').where({ request_id: requestId }).first();
  if (!p) return null;
  if (role === 'customer') return { status: p.status, amount: p.amount, paid_at: p.paid_at };
  const out = await db('payouts').where({ payment_id: p.id }).first();
  return {
    status: p.status, amount: p.amount, fee: p.fee, fee_percent: p.fee_percent, payout: p.payout, paid_at: p.paid_at,
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
  await db('payouts').where({ id: row.id }).update({ complaint: text, complaint_at: db.fn.now(), complaint_status: 'open', complaint_note: null, resolved_at: null });
  const admins = await db('users').where({ role: 'admin' }).pluck('id');
  for (const id of admins) await notify(id, 'payout_complaint', 'Payout complaint', `A fundi reported a problem with a payout (request ${requestId}).`);
}

// Admin answers a complaint. `resend` = try the payout again.
async function resolveComplaint(payoutId, note, resend) {
  const po = await db('payouts').where({ id: payoutId, complaint_status: 'open' }).first();
  if (!po) throw new HttpError(404, 'NOT_FOUND', 'No open complaint');
  if (resend) {
    await db('payouts').where({ id: po.id }).update({ status: 'failed' }); // let sendPayout send it again
    await sendPayout(po.payment_id);
  }
  const text = typeof note === 'string' ? note.trim().slice(0, 300) : '';
  await db('payouts').where({ id: po.id }).update({ complaint_status: 'resolved', complaint_note: text || null, resolved_at: db.fn.now(), received_at: null });
  const p = await db('provider_profiles').where({ id: po.provider_id }).first('user_id');
  if (p) await notify(p.user_id, 'complaint_resolved', 'Your complaint was answered', text || 'The admin looked at your complaint.');
}

module.exports = { confirmReceived, fileComplaint, resolveComplaint, payRequest, sendPayout, paymentView, split, validPrice, COMMISSION_PERCENT, NETWORKS, MIN_PRICE, MAX_PRICE };
