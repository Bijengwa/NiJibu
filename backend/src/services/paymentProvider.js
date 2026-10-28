// The mobile-money provider (collect from the customer, pay out to the fundi).
// PAYMENTS_MODE=mock (default in development): a fake provider so the whole flow can be built and tested.
//   - a customer number ending in 0000 fails the payment (to test the failure screen)
//   - a fundi payout number ending in 0000 fails the payout (the admin can retry it)
// Any other mode needs a real provider (AzamPay, Selcom...) to be connected here. Until then it answers NOT_BUILT.
const { HttpError } = require('../lib/httpError');

const MODE = process.env.PAYMENTS_MODE || (process.env.NODE_ENV === 'production' ? 'live' : 'mock');
const ref = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function collect({ amount, phone, network }) {
  if (MODE !== 'mock') throw new HttpError(501, 'NOT_BUILT', 'Payments are not connected yet');
  if (String(phone).endsWith('0000')) return { ok: false, failure: 'DECLINED' };
  return { ok: true, reference: ref('MOCK-IN'), amount, network };
}

async function payout({ amount, number, network }) {
  if (MODE !== 'mock') throw new HttpError(501, 'NOT_BUILT', 'Payouts are not connected yet');
  if (String(number).endsWith('0000')) return { ok: false, failure: 'DECLINED' };
  return { ok: true, reference: ref('MOCK-OUT'), amount, network };
}

module.exports = { collect, payout, MODE };
