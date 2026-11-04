// SMS / WhatsApp (Africa's Talking, Meta), Selcom payments that finish later, the Selcom webhook, and Google places.
// The outside services are faked (fetch is replaced), so nothing real is called. Needs the local Postgres + migrations. Run: npm test
require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');
const db = require('../src/db');
const app = require('../src/app');
const { signToken } = require('../src/lib/token');
const messaging = require('../src/services/messaging');
const selcom = require('../src/services/selcom');
const payments = require('../src/services/payments');

const PREFIX = '2557997';
const realFetch = global.fetch;
let server, base;

// Replace fetch: calls to our own test server pass through, everything else goes to `handler`
let calls = [];
function fake(handler) {
  calls = [];
  global.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith(base)) return realFetch(url, init);
    calls.push({ url: u, init, body: init.body });
    return handler(u, init);
  };
}
const reply = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj });

const ENV_KEYS = ['MESSAGING_MODE', 'OTP_DELIVERY', 'AT_USERNAME', 'AT_API_KEY', 'AT_SENDER_ID', 'WA_ACCESS_TOKEN', 'WA_PHONE_NUMBER_ID', 'SELCOM_BASE_URL', 'SELCOM_VENDOR_ID', 'SELCOM_API_KEY', 'SELCOM_API_SECRET', 'SELCOM_WEBHOOK_URL', 'SELCOM_WEBHOOK_TOKEN', 'PLACES_PROVIDER', 'GOOGLE_MAPS_SERVER_KEY'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
test.afterEach(() => {
  global.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

async function makeUser(name, phone, role = 'customer', extra = {}) {
  const [u] = await db('users').insert({ phone, name, role, password_hash: 'x', phone_verified_at: db.fn.now(), ...extra }).returning('*');
  return { id: u.id, phone, token: signToken(u) };
}
async function api(user, method, path, body) {
  const res = await realFetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
// A finished, confirmed job waiting for payment
async function readyJob(customer, workerUser, service) {
  const p = await db('provider_profiles').where({ user_id: workerUser.id }).first();
  const [r] = await db('requests')
    .insert({ customer_id: customer.id, service_id: service.id, provider_id: p.id, status: 'completed', lat: -6.67, lng: 39.22, agreed_price: 25000, fee_percent: 10, fee_due: 2500, payout_due: 22500, accepted_at: db.fn.now(), completed_at: db.fn.now(), customer_confirmed_at: db.fn.now() })
    .returning('*');
  return r;
}
async function cleanup() {
  await db('requests').whereIn('customer_id', db('users').select('id').where('phone', 'like', `${PREFIX}%`)).del();
  await db('message_log').where('phone', 'like', `${PREFIX}%`).del();
  await db('users').where('phone', 'like', `${PREFIX}%`).del();
}

test.before(async () => {
  await cleanup();
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
test.after(async () => {
  await cleanup();
  await new Promise((r) => server.close(r));
  await db.destroy();
});

// ---------------------------------------------------------------- SMS / WhatsApp

test("SMS: a payment message goes to Africa's Talking, in the user's language, and only the template is logged", async () => {
  const u = await makeUser('Asha', `${PREFIX}00001`, 'customer', { language: 'en' });
  Object.assign(process.env, { MESSAGING_MODE: 'live', AT_USERNAME: 'sandbox', AT_API_KEY: 'key-1' });
  fake(() => reply({ SMSMessageData: { Recipients: [{ statusCode: 101, status: 'Success', messageId: 'ATXid_1' }] } }));

  await messaging.sendForNotification(u.id, 'payment_done', { amount: 25000 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.sandbox.africastalking.com/version1/messaging');
  assert.equal(calls[0].init.headers.apiKey, 'key-1');
  const form = new URLSearchParams(String(calls[0].body));
  assert.equal(form.get('to'), `+${u.phone}`);
  assert.match(form.get('message'), /25000/);
  assert.match(form.get('message'), /payment/i, 'English text for an English user');
  const log = await db('message_log').where({ user_id: u.id });
  assert.deepEqual([log.length, log[0].channel, log[0].template, log[0].status, log[0].provider_ref], [1, 'sms', 'payment_done', 'sent', 'ATXid_1']);
  assert.ok(!JSON.stringify(log).includes('25000'), 'the message text is not stored');
});

test('SMS: the OTP is sent, never stored in the log, and a failed send says OTP_SEND_FAILED', async () => {
  const u = await makeUser('Neema', `${PREFIX}00002`);
  Object.assign(process.env, { MESSAGING_MODE: 'live', OTP_DELIVERY: 'sms', AT_USERNAME: 'nijibu', AT_API_KEY: 'key-2', AT_SENDER_ID: 'NIJIBU' });
  fake(() => reply({ SMSMessageData: { Recipients: [{ statusCode: 101, status: 'Success', messageId: 'ATXid_2' }] } }));
  await messaging.sendOtp({ id: u.id, phone: u.phone, language: null }, '482913');
  assert.equal(calls[0].url, 'https://api.africastalking.com/version1/messaging');
  const form = new URLSearchParams(String(calls[0].body));
  assert.match(form.get('message'), /482913/);
  assert.match(form.get('message'), /Namba yako/, 'Swahili by default');
  assert.equal(form.get('from'), 'NIJIBU');
  assert.ok(!JSON.stringify(await db('message_log').where({ user_id: u.id })).includes('482913'), 'the code is never in the database');

  fake(() => reply({ SMSMessageData: { Recipients: [{ statusCode: 403, status: 'InvalidSenderId' }] } }));
  await assert.rejects(messaging.sendOtp({ id: u.id, phone: u.phone }, '111111'), (e) => e.code === 'OTP_SEND_FAILED' && e.status === 502);
  const failed = await db('message_log').where({ user_id: u.id, status: 'failed' }).first();
  assert.match(failed.error, /InvalidSenderId/);

  delete process.env.AT_API_KEY; // keys missing
  await assert.rejects(messaging.sendOtp({ id: u.id, phone: u.phone }, '222222'), (e) => e.code === 'OTP_SEND_FAILED');
});

test('WhatsApp: used only after the user agreed, with the approved template; falls back to SMS', async () => {
  const u = await makeUser('Juma', `${PREFIX}00003`, 'customer', { language: 'sw', whatsapp_opt_in: true });
  Object.assign(process.env, { MESSAGING_MODE: 'live', AT_USERNAME: 'sandbox', AT_API_KEY: 'k', WA_ACCESS_TOKEN: 'wa-token', WA_PHONE_NUMBER_ID: '1234567890' });

  fake((url) => (url.includes('graph.facebook.com') ? reply({ messages: [{ id: 'wamid.1' }] }) : reply({})));
  await messaging.sendForNotification(u.id, 'payment_received', { amount: 22500 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://graph.facebook.com/v21.0/1234567890/messages');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer wa-token');
  const sent = JSON.parse(calls[0].body);
  assert.deepEqual([sent.to, sent.type, sent.template.name, sent.template.language.code], [u.phone, 'template', 'nijibu_payment_received', 'sw']);
  assert.deepEqual(sent.template.components, [{ type: 'body', parameters: [{ type: 'text', text: '22500' }] }]);

  // WhatsApp refuses -> SMS is the fallback, both tries are logged
  fake((url) => (url.includes('graph.facebook.com') ? reply({ error: { message: 'Template not approved' } }, 400) : reply({ SMSMessageData: { Recipients: [{ statusCode: 101, status: 'Success', messageId: 'ATXid_3' }] } })));
  await messaging.sendForNotification(u.id, 'request_accepted');
  assert.deepEqual(calls.map((c) => (c.url.includes('graph') ? 'whatsapp' : 'sms')), ['whatsapp', 'sms']);
  const rows = await db('message_log').where({ user_id: u.id, template: 'request_accepted' }).orderBy('id');
  assert.deepEqual(rows.map((r) => [r.channel, r.status]), [['whatsapp', 'failed'], ['sms', 'sent']]);
  assert.match(rows[0].error, /Template not approved/);

  // not opted in -> no WhatsApp at all
  await db('users').where({ id: u.id }).update({ whatsapp_opt_in: false });
  fake(() => reply({ SMSMessageData: { Recipients: [{ statusCode: 101, status: 'Success', messageId: 'ATXid_4' }] } }));
  await messaging.sendForNotification(u.id, 'provider_arrived');
  assert.deepEqual(calls.map((c) => c.url.includes('graph')), [false]);

  // notifications switched off, or an event that is not worth a paid SMS -> nothing is sent
  await db('users').where({ id: u.id }).update({ notifications_enabled: false });
  fake(() => reply({}));
  await messaging.sendForNotification(u.id, 'provider_arrived');
  await messaging.sendForNotification(u.id, 'welcome');
  assert.equal(calls.length, 0);
});

test('settings: the user can turn WhatsApp on and off', async () => {
  const u = await makeUser('Zawadi', `${PREFIX}00004`);
  const on = await api(u, 'PATCH', '/api/me/settings', { whatsapp_opt_in: true });
  assert.equal(on.status, 200);
  assert.equal(on.body.user.settings.whatsapp_opt_in, true);
  assert.equal((await api(u, 'PATCH', '/api/me/settings', { whatsapp_opt_in: 'yes' })).status, 400);
  assert.equal((await api(u, 'PATCH', '/api/me/settings', { whatsapp_opt_in: false })).body.user.settings.whatsapp_opt_in, false);
});

// ---------------------------------------------------------------- Selcom client

test('Selcom: the signature headers', () => {
  const ts = '2026-10-30T10:47:00+03:00';
  const h = selcom.sign({ order_id: 'NJP1A1', amount: '25000' }, { key: 'KEY', secret: 'SECRET' }, ts);
  const expected = crypto.createHmac('sha256', 'SECRET').update(`timestamp=${ts}&order_id=NJP1A1&amount=25000`).digest('base64');
  assert.equal(h.Digest, expected);
  assert.equal(h['Signed-Fields'], 'order_id,amount');
  assert.equal(h.Authorization, `SELCOM ${Buffer.from('KEY').toString('base64')}`);
  assert.deepEqual([h.Timestamp, h['Digest-Method']], [ts, 'HS256']);
  assert.equal(selcom.stamp(new Date('2026-10-30T07:47:00Z')), '2026-10-30T10:47:00+03:00');
});

test('Selcom: collect creates the order, then pushes to the phone (pending); status maps the answers', async () => {
  Object.assign(process.env, { SELCOM_BASE_URL: 'https://selcom.test', SELCOM_VENDOR_ID: 'VEND1', SELCOM_API_KEY: 'k', SELCOM_API_SECRET: 's', SELCOM_WEBHOOK_URL: 'https://api.nijibu.test/api/webhooks/selcom/tok' });
  fake((url) => (url.endsWith('/create-order-minimal') ? reply({ resultcode: '000', result: 'SUCCESS' }) : reply({ resultcode: '111', result: 'PENDING' })));
  const r = await selcom.collect({ amount: 25000, phone: '255712345678', orderId: 'NJP9A1', buyer: { name: 'Asha' } });
  assert.deepEqual(r, { ok: true, pending: true, reference: 'NJP9A1' });
  assert.equal(calls[0].url, 'https://selcom.test/v1/checkout/create-order-minimal');
  const order = JSON.parse(calls[0].body);
  assert.deepEqual([order.vendor, order.order_id, order.amount, order.currency, order.buyer_phone], ['VEND1', 'NJP9A1', '25000', 'TZS', '255712345678']);
  assert.equal(Buffer.from(order.webhook, 'base64').toString(), 'https://api.nijibu.test/api/webhooks/selcom/tok');
  assert.equal(calls[0].init.headers['Signed-Fields'], Object.keys(order).join(','));
  assert.equal(calls[1].url, 'https://selcom.test/v1/checkout/wallet-payment');
  assert.deepEqual(JSON.parse(calls[1].body), { transid: 'NJP9A1T', order_id: 'NJP9A1', msisdn: '255712345678' });

  fake(() => reply({ resultcode: '400', message: 'Invalid vendor' }));
  assert.deepEqual(await selcom.collect({ amount: 1000, phone: '255712345678', orderId: 'NJP9A2' }), { ok: false, failure: 'Invalid vendor' });

  const statusOf = async (payment_status) => {
    fake(() => reply({ resultcode: '000', data: [{ order_id: 'NJP9A1', payment_status, transid: 'T1' }] }));
    return selcom.status({ orderId: 'NJP9A1' });
  };
  assert.deepEqual(await statusOf('COMPLETED'), { state: 'paid', transid: 'T1' });
  assert.deepEqual(await statusOf('PENDING'), { state: 'pending' });
  assert.deepEqual(await statusOf('USERCANCELLED'), { state: 'failed', failure: 'USERCANCELLED' });
  assert.equal(calls[0].url, 'https://selcom.test/v1/checkout/order-status?order_id=NJP9A1');

  delete process.env.SELCOM_API_SECRET;
  await assert.rejects(selcom.status({ orderId: 'x' }), (e) => e.code === 'NOT_CONFIGURED');
  fake(() => {
    throw new Error('socket hang up');
  });
  process.env.SELCOM_API_SECRET = 's';
  await assert.rejects(selcom.status({ orderId: 'x' }), (e) => e.code === 'PROVIDER_UNREACHABLE');
});

// ---------------------------------------------------------------- a payment that finishes later

test('payment that waits for the phone: pending -> paid (fundi paid once), failed -> retry, and old ones time out', async () => {
  const worker = await makeUser('Fundi One', `${PREFIX}00010`);
  const c1 = await makeUser('Cust One', `${PREFIX}00011`);
  const c2 = await makeUser('Cust Two', `${PREFIX}00012`);
  const c3 = await makeUser('Cust Three', `${PREFIX}00013`);
  const service = await db('services').where({ slug: 'dobi' }).first('id');
  await db('provider_profiles').insert({ user_id: worker.id, verification_status: 'verified', lat: -6.67, lng: 39.22, payout_network: 'mpesa', payout_number: '712345678' });

  // 1) pending -> paid
  const r1 = await readyJob(c1, worker, service);
  const res = await api(c1, 'POST', `/api/requests/${r1.id}/pay`, { network: 'mpesa', phone: '0712341111' }); // 1111 = stays pending in the fake provider
  assert.equal(res.status, 200);
  assert.equal(res.body.request.payment.status, 'pending');
  let pay = await db('payments').where({ request_id: r1.id }).first();
  assert.equal(pay.status, 'pending');
  assert.equal(pay.reference, `NJP${pay.id}A1`);
  assert.ok(pay.pending_at);
  assert.equal(await db('payouts').where({ payment_id: pay.id }).first(), undefined, 'the fundi is not paid before the customer paid');
  assert.equal((await api(c1, 'POST', `/api/requests/${r1.id}/pay`, { network: 'mpesa', phone: '0712341111' })).body.code, 'PAYMENT_BUSY', 'no second payment while one waits');

  const done = await payments.settle(pay.reference, { state: 'paid' });
  assert.equal(done.status, 'paid');
  assert.equal(await payments.settle(pay.reference, { state: 'paid' }), null, 'a second webhook changes nothing');
  assert.deepEqual((await db('payment_attempts').where({ payment_id: pay.id })).map((a) => a.status), ['success']);
  const payout = await db('payouts').where({ payment_id: pay.id });
  assert.deepEqual([payout.length, payout[0].status, payout[0].amount], [1, 'sent', 22500], 'the fundi is paid his 90% exactly once');
  assert.ok(await db('notifications').where({ user_id: c1.id, type: 'payment_done' }).first());
  assert.equal((await api(c1, 'GET', `/api/requests/${r1.id}`)).body.request.payment.status, 'paid');

  // 2) pending -> failed -> try again and pay
  const r2 = await readyJob(c2, worker, service);
  await api(c2, 'POST', `/api/requests/${r2.id}/pay`, { network: 'mpesa', phone: '0712341111' });
  pay = await db('payments').where({ request_id: r2.id }).first();
  assert.equal((await payments.settle(pay.reference, { state: 'failed', failure: 'USERCANCELLED' })).status, 'failed');
  assert.equal((await api(c2, 'GET', `/api/requests/${r2.id}`)).body.request.payment.status, 'failed');
  assert.equal((await api(c2, 'POST', `/api/requests/${r2.id}/pay`, { network: 'mpesa', phone: '0712345678' })).status, 200);
  pay = await db('payments').where({ request_id: r2.id }).first();
  assert.deepEqual([pay.status, pay.attempts], ['paid', 2]);
  const tries = await db('payment_attempts').where({ payment_id: pay.id }).orderBy('id');
  assert.deepEqual(tries.map((t) => t.status), ['failed', 'success']);
  assert.equal(tries[0].failure, 'USERCANCELLED');

  // 3) the customer never approves: closed after 10 minutes
  const r3 = await readyJob(c3, worker, service);
  await api(c3, 'POST', `/api/requests/${r3.id}/pay`, { network: 'mpesa', phone: '0712341111' });
  pay = await db('payments').where({ request_id: r3.id }).first();
  await payments.reconcilePending();
  assert.equal((await db('payments').where({ id: pay.id }).first()).status, 'pending', 'still inside the 10 minutes');
  await db('payments').where({ id: pay.id }).update({ pending_at: new Date(Date.now() - payments.PENDING_MS - 60000) });
  await payments.reconcilePending();
  pay = await db('payments').where({ id: pay.id }).first();
  assert.deepEqual([pay.status, pay.failure], ['failed', 'TIMEOUT']);
  assert.deepEqual((await db('payment_attempts').where({ payment_id: pay.id })).map((a) => a.status), ['failed']);
});

test('Selcom webhook: secret in the address, and the message itself is never trusted', async () => {
  const worker = await makeUser('Fundi Two', `${PREFIX}00020`);
  const c = await makeUser('Cust Four', `${PREFIX}00021`);
  const service = await db('services').where({ slug: 'dobi' }).first('id');
  await db('provider_profiles').insert({ user_id: worker.id, verification_status: 'verified', lat: -6.67, lng: 39.22, payout_network: 'mpesa', payout_number: '712345678' });
  const r = await readyJob(c, worker, service);
  await api(c, 'POST', `/api/requests/${r.id}/pay`, { network: 'mpesa', phone: '0712341111' });
  const pay = await db('payments').where({ request_id: r.id }).first();

  const token = 'a-long-secret-token-1234567890';
  assert.equal((await api(null, 'POST', `/api/webhooks/selcom/${token}`, { order_id: pay.reference })).status, 404, 'no token configured');
  process.env.SELCOM_WEBHOOK_TOKEN = token;
  assert.equal((await api(null, 'POST', '/api/webhooks/selcom/wrong-token-wrong-token', { order_id: pay.reference })).status, 404);
  const ok = await api(null, 'POST', `/api/webhooks/selcom/${token}`, { order_id: pay.reference, payment_status: 'COMPLETED', result: 'SUCCESS' });
  assert.equal(ok.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal((await db('payments').where({ id: pay.id }).first()).status, 'pending', 'a webhook that says COMPLETED does not pay by itself: the provider is asked');
  assert.equal((await api(null, 'POST', `/api/webhooks/selcom/${token}`, {})).status, 200, 'a body without an order id is ignored');
});

// ---------------------------------------------------------------- Google places

test('places: Google search and address lookup, and OpenStreetMap when Google fails', async () => {
  const u = await makeUser('Mteja', `${PREFIX}00030`);
  Object.assign(process.env, { PLACES_PROVIDER: 'google', GOOGLE_MAPS_SERVER_KEY: 'gkey' });

  fake(() => reply({ places: [{ id: 'p1', displayName: { text: 'Mbezi Beach' }, formattedAddress: 'Mbezi Beach, Dar es Salaam, Tanzania', location: { latitude: -6.72, longitude: 39.21 } }] }));
  const s = await api(u, 'GET', '/api/places/search?q=mbezi%20beach&lat=-6.7&lng=39.2');
  assert.equal(s.status, 200);
  assert.deepEqual([s.body.items[0].lat, s.body.items[0].lng], [-6.72, 39.21]);
  assert.match(s.body.items[0].label, /Mbezi Beach/);
  assert.equal(calls[0].url, 'https://places.googleapis.com/v1/places:searchText');
  assert.equal(calls[0].init.headers['X-Goog-Api-Key'], 'gkey');
  assert.match(calls[0].init.headers['X-Goog-FieldMask'], /places\.location/);
  const sent = JSON.parse(calls[0].body);
  assert.deepEqual([sent.textQuery, sent.regionCode], ['mbezi beach', 'TZ']);
  assert.equal(sent.locationBias.circle.center.latitude, -6.7, 'places near the user come first');

  fake(() => reply({ status: 'OK', results: [{ formatted_address: 'Kunduchi, Dar es Salaam, Tanzania', address_components: [{ long_name: 'Kunduchi', types: ['neighborhood'] }], geometry: { location: { lat: -6.66, lng: 39.2 } } }] }));
  const rev = await api(u, 'GET', '/api/places/reverse?lat=-6.66&lng=39.2');
  assert.equal(rev.body.place.label, 'Kunduchi');
  assert.match(calls[0].url, /^https:\/\/maps\.googleapis\.com\/maps\/api\/geocode\/json\?/);
  assert.match(calls[0].url, /key=gkey/);

  // Google is down or the key is wrong -> OpenStreetMap still answers
  fake((url) => {
    if (url.includes('googleapis')) throw new Error('boom');
    return reply([{ lat: '-6.70', lon: '39.20', name: 'Tegeta', display_name: 'Tegeta, Dar es Salaam, Tanzania', address: { suburb: 'Tegeta' } }]);
  });
  const fb = await api(u, 'GET', '/api/places/search?q=tegeta%20nyuki');
  assert.equal(fb.body.items.length, 1);
  assert.equal(fb.body.items[0].lat, -6.7);
  assert.ok(calls.some((c) => c.url.includes('nominatim')));

  // Google off (default): never calls Google
  process.env.PLACES_PROVIDER = 'osm';
  fake(() => reply([{ lat: '-6.80', lon: '39.28', name: 'Kariakoo', display_name: 'Kariakoo, Dar es Salaam', address: {} }]));
  await api(u, 'GET', '/api/places/search?q=kariakoo%20sokoni');
  assert.ok(calls.length && calls.every((c) => !c.url.includes('googleapis')));
});
