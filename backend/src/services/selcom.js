// Selcom API gateway client: the customer pays with mobile money (USSD push to the phone).
//
// IMPORTANT: written from Selcom's public client examples. Test it with your Selcom SANDBOX keys before going live.
// Things to confirm with Selcom (they are in ONE place each, so they are easy to change):
//   - sign()        how the Digest is made (below: HMAC-SHA256 of "timestamp=..&field=value&.." in the order of Signed-Fields)
//   - the paths     /v1/checkout/create-order-minimal, /v1/checkout/wallet-payment, /v1/checkout/order-status
//   - SELCOM_BASE_URL has NO default: use the sandbox or live gateway address Selcom gave you
//
// .env: SELCOM_BASE_URL, SELCOM_VENDOR_ID, SELCOM_API_KEY, SELCOM_API_SECRET,
//       SELCOM_WEBHOOK_URL (public address of /api/webhooks/selcom/<token>), SELCOM_WEBHOOK_TOKEN (long random text)
const crypto = require('crypto');
const { HttpError } = require('../lib/httpError');
const usage = require('../lib/usage');

const cfg = () => {
  const c = { base: process.env.SELCOM_BASE_URL, vendor: process.env.SELCOM_VENDOR_ID, key: process.env.SELCOM_API_KEY, secret: process.env.SELCOM_API_SECRET };
  if (!c.base || !c.vendor || !c.key || !c.secret) throw new HttpError(501, 'NOT_CONFIGURED', 'Selcom keys are missing in .env');
  return c;
};

// Selcom wants the time with the offset, e.g. 2026-10-30T10:47:00+03:00 (Dar es Salaam)
const stamp = (d = new Date()) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 19) + '+03:00';

// `fields` = the values that are signed (the JSON body, or the query for GET), in order
function sign(fields, { key, secret }, timestamp = stamp()) {
  const names = Object.keys(fields);
  const data = [`timestamp=${timestamp}`, ...names.map((k) => `${k}=${fields[k]}`)].join('&');
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `SELCOM ${Buffer.from(key).toString('base64')}`,
    Timestamp: timestamp,
    'Digest-Method': 'HS256',
    Digest: crypto.createHmac('sha256', secret).update(data).digest('base64'),
    'Signed-Fields': names.join(','),
  };
}

async function call(method, path, fields) {
  const c = cfg();
  const headers = sign(fields, c);
  const url = method === 'GET' ? `${c.base}${path}?${new URLSearchParams(fields)}` : `${c.base}${path}`;
  let res;
  try {
    res = await fetch(url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(fields), signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new HttpError(502, 'PROVIDER_UNREACHABLE', 'Selcom could not be reached');
  }
  const json = await res.json().catch(() => null);
  if (!json) throw new HttpError(502, 'PROVIDER_ERROR', `Selcom answered HTTP ${res.status}`);
  return json;
}

const ok = (j) => String(j.resultcode) === '000' || String(j.result).toUpperCase() === 'SUCCESS';
const b64 = (s) => Buffer.from(s).toString('base64');

// Ask Selcom to charge the customer. Returns { ok:true, pending:true, reference } (the customer approves on the phone;
// the result arrives later by webhook / status check) or { ok:false, failure }.
async function collect({ amount, phone, orderId, buyer = {} }) {
  const c = cfg();
  const order = await call('POST', '/v1/checkout/create-order-minimal', {
    vendor: c.vendor,
    order_id: orderId,
    buyer_email: buyer.email || process.env.SELCOM_DEFAULT_EMAIL || 'noreply@nijibu.app',
    buyer_name: buyer.name || 'NiJibu customer',
    buyer_phone: phone,
    amount: String(amount),
    currency: 'TZS',
    buyer_remarks: 'NiJibu service',
    merchant_remarks: orderId,
    no_of_items: '1',
    ...(process.env.SELCOM_WEBHOOK_URL ? { webhook: b64(process.env.SELCOM_WEBHOOK_URL) } : {}),
  });
  if (!ok(order)) return { ok: false, failure: String(order.message || order.result || 'ORDER_FAILED').slice(0, 100) };

  const push = await call('POST', '/v1/checkout/wallet-payment', { transid: `${orderId}T`, order_id: orderId, msisdn: phone });
  // 000 = accepted, 111 = in progress: both mean "the customer has a prompt on the phone"
  if (!ok(push) && String(push.resultcode) !== '111') return { ok: false, failure: String(push.message || push.result || 'PUSH_FAILED').slice(0, 100) };
  return { ok: true, pending: true, reference: orderId };
}

// Where is this payment now?  -> { state: 'paid' | 'pending' | 'failed', failure?, transid? }
async function status({ orderId }) {
  const t0 = Date.now();
  const j = await call('GET', '/v1/checkout/order-status', { order_id: orderId }).catch((e) => {
    usage.record({ service: 'selcom', operation: 'status', ok: false, ms: Date.now() - t0 });
    throw e;
  });
  usage.record({ service: 'selcom', operation: 'status', ms: Date.now() - t0 });
  const row = Array.isArray(j.data) ? j.data[0] : j.data;
  const s = String(row?.payment_status || '').toUpperCase();
  if (s === 'COMPLETED') return { state: 'paid', transid: row.transid || null };
  if (!s || s === 'PENDING' || s === 'INPROGRESS') return { state: 'pending' };
  return { state: 'failed', failure: s.slice(0, 100) }; // CANCELLED, USERCANCELLED, REJECTED...
}

module.exports = { collect, status, sign, stamp };
