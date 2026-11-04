// The mobile-money provider (collect from the customer, pay out to the fundi).
//
// PAYMENTS_MODE:
//   mock    (default in development) a fake provider so the whole flow can be built and tested:
//             - a customer number ending in 0000 fails the payment
//             - a customer number ending in 1111 stays "pending" (like a real USSD push) until payments.settle() is called
//             - a fundi payout number ending in 0000 fails the payout (the admin can retry it)
//   selcom  (default in production) Selcom collects from the customer. The result comes later (webhook / status check).
//             Selcom PAYOUTS are not connected yet: the fundi's share waits as a failed payout and the admin retries it
//             (or pays by hand) until Selcom gives us the payout API.
//
// collect() answers one of:  { ok:true, reference }  paid now  |  { ok:true, pending:true, reference }  waiting for the customer
//                            { ok:false, failure }   not paid
const { HttpError } = require('../lib/httpError');
const selcom = require('./selcom');
const usage = require('../lib/usage');

const MODE = process.env.PAYMENTS_MODE || (process.env.NODE_ENV === 'production' ? 'selcom' : 'mock');
const ref = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function collect({ amount, phone, network, orderId, buyer }) {
  if (MODE === 'selcom') return selcom.collect({ amount, phone, orderId, buyer });
  if (MODE !== 'mock') throw new HttpError(501, 'NOT_BUILT', 'Payments are not connected yet');
  if (String(phone).endsWith('0000')) return { ok: false, failure: 'DECLINED' };
  if (String(phone).endsWith('1111')) return { ok: true, pending: true, reference: orderId };
  return { ok: true, reference: ref('MOCK-IN'), amount, network };
}

// Ask the provider about a pending payment: { state: 'paid' | 'pending' | 'failed', failure? }
async function status({ orderId }) {
  if (MODE === 'selcom') return selcom.status({ orderId });
  return { state: 'pending' }; // mock: settled by hand (tests)
}

async function payout({ amount, number, network }) {
  if (MODE === 'selcom') throw new HttpError(501, 'NOT_BUILT', 'Selcom payouts are not connected yet');
  if (MODE !== 'mock') throw new HttpError(501, 'NOT_BUILT', 'Payouts are not connected yet');
  if (String(number).endsWith('0000')) return { ok: false, failure: 'DECLINED' };
  return { ok: true, reference: ref('MOCK-OUT'), amount, network };
}

// The money really moved: remember the amount, the gateway fee is a % of it (admin Services page). Real gateway only.
const recordCollected = (amount, tag = 'job') => { if (MODE === 'selcom') usage.record({ service: 'selcom', operation: 'collect', amount_tzs: amount, tag }); };
const recordPayout = (amount) => { if (MODE === 'selcom') usage.record({ service: 'selcom', operation: 'payout', amount_tzs: amount }); };

module.exports = { collect, status, payout, MODE, recordCollected, recordPayout };
