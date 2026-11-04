// The trail from a request to its money: codes, price saved on the request, every payment try kept,
// the result (successful / failed...), and the admin views. Needs the local Postgres + migrations. Run: npm test
require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const db = require('../src/db');
const app = require('../src/app');
const { signToken } = require('../src/lib/token');

const PREFIX = '2557998';
let server, base;

async function makeUser(name, phone, role = 'customer') {
  const [u] = await db('users').insert({ phone, name, role, password_hash: 'x', phone_verified_at: db.fn.now() }).returning('*');
  return { id: u.id, token: signToken(u) };
}
async function api(user, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function cleanup() {
  await db('requests').whereIn('customer_id', db('users').select('id').where('phone', 'like', `${PREFIX}%`)).del();
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

test('request -> price saved -> failed pay then good pay -> everything points back to the request', async () => {
  const admin = await makeUser('Boss', `${PREFIX}00001`, 'admin');
  const customer = await makeUser('Asha Customer', `${PREFIX}00002`);
  const worker = await makeUser('Juma Fundi', `${PREFIX}00003`);
  const other = await makeUser('Neema Customer', `${PREFIX}00004`);
  const service = await db('services').where({ slug: 'dobi' }).first('id');
  const [p] = await db('provider_profiles')
    .insert({ user_id: worker.id, verification_status: 'verified', is_online: true, lat: -6.67, lng: 39.22, payout_network: 'mpesa', payout_number: '712345678' })
    .returning('*');

  // a good job (the worker is already at the customer's place)
  const [r] = await db('requests')
    .insert({ customer_id: customer.id, service_id: service.id, provider_id: p.id, status: 'arrived', lat: -6.67, lng: 39.22, address: 'Mtongani', accepted_at: db.fn.now(), arrived_at: db.fn.now() })
    .returning('*');
  assert.equal(r.code, `NJ-${String(r.id).padStart(6, '0')}`, 'the request has a readable code');

  assert.equal((await api(worker, 'POST', `/api/requests/${r.id}/start`, { price: 25000 })).status, 200);
  const priced = await db('requests').where({ id: r.id }).first();
  assert.deepEqual([priced.agreed_price, priced.fee_percent, priced.fee_due, priced.payout_due], [25000, 10, 2500, 22500], 'what should be paid is saved on the request');
  assert.equal((await api(worker, 'POST', `/api/requests/${r.id}/complete`)).status, 200);
  const view = (await api(customer, 'GET', `/api/requests/${r.id}`)).body.request;
  assert.equal(view.code, r.code);
  assert.equal(view.outcome, 'awaiting_payment');

  assert.equal((await api(customer, 'POST', `/api/requests/${r.id}/confirm`)).status, 200);
  assert.equal((await api(customer, 'POST', `/api/requests/${r.id}/pay`, { network: 'mpesa', phone: '0712340000' })).status, 402);
  assert.equal((await api(customer, 'POST', `/api/requests/${r.id}/pay`, { network: 'mpesa', phone: '0712345678' })).status, 200);

  const pay = await db('payments').where({ request_id: r.id }).first();
  assert.equal(pay.code, `PAY-${String(pay.id).padStart(6, '0')}`);
  assert.equal(pay.service_id, service.id, 'the payment knows which job it was for');
  assert.equal(pay.attempts, 2);
  assert.deepEqual([pay.amount, pay.fee, pay.payout], [priced.agreed_price, priced.fee_due, priced.payout_due], 'paid = due');
  const tries = await db('payment_attempts').where({ payment_id: pay.id }).orderBy('id');
  assert.deepEqual(tries.map((t) => t.status), ['failed', 'success'], 'the failed try is not lost');
  assert.equal(tries[0].failure, 'DECLINED');
  assert.ok(tries[1].reference);

  // a request that failed: cancelled by the customer, and one nobody took
  const [c1] = await db('requests').insert({ customer_id: other.id, service_id: service.id, status: 'searching', lat: -6.67, lng: 39.22 }).returning('*');
  assert.equal((await api(other, 'POST', `/api/requests/${c1.id}/cancel`, { reason: 'Changed my mind' })).status, 200);
  const [c2] = await db('requests').insert({ customer_id: other.id, service_id: service.id, status: 'no_provider', lat: -6.67, lng: 39.22 }).returning('*');

  // customer's own list shows the result
  const mine = (await api(customer, 'GET', '/api/requests')).body.items.find((i) => i.id === r.id);
  assert.deepEqual([mine.code, mine.outcome], [r.code, 'successful']);
  const jobs = (await api(worker, 'GET', '/api/provider/jobs')).body.items.find((i) => i.id === r.id);
  assert.deepEqual([jobs.code, jobs.outcome, jobs.payout_due], [r.code, 'successful', 22500]);

  // admin: only admins
  assert.equal((await api(customer, 'GET', '/api/admin/requests')).status, 403);
  const list = (await api(admin, 'GET', `/api/admin/requests?q=${PREFIX}`)).body;
  assert.equal(list.total, 3);
  assert.deepEqual([list.counts.successful, list.counts.failed], [1, 2]);
  const row = list.items.find((i) => i.id === r.id);
  assert.equal(row.customer_name, 'Asha Customer');
  assert.equal(row.provider_name, 'Juma Fundi');
  assert.deepEqual([row.outcome, row.agreed_price, row.fee_due, row.payout_due, row.payment_status, row.payment_attempts], ['successful', 25000, 2500, 22500, 'paid', 2]);
  const failedList = (await api(admin, 'GET', `/api/admin/requests?q=${PREFIX}&outcome=failed`)).body.items;
  assert.deepEqual(failedList.map((i) => i.reason).sort(), ['Customer cancelled: Changed my mind', 'No provider was found']);
  assert.equal((await api(admin, 'GET', `/api/admin/requests?q=${r.code}`)).body.total, 1, 'search by code');

  const detail = (await api(admin, 'GET', `/api/admin/requests/${r.id}`)).body;
  assert.equal(detail.request.customer.name, 'Asha Customer');
  assert.equal(detail.request.provider.name, 'Juma Fundi');
  assert.equal(detail.attempts.length, 2);
  assert.equal(detail.payout.status, 'sent');
  assert.equal(detail.check.matches, true);
  assert.equal((await api(admin, 'GET', '/api/admin/requests/999999999')).status, 404);

  const pays = (await api(admin, 'GET', `/api/admin/payments?q=${r.code}`)).body;
  assert.equal(pays.items.length, 1);
  assert.deepEqual([pays.items[0].request_code, pays.items[0].service, pays.items[0].customer_name, pays.items[0].provider_name], [r.code, 'Laundry', 'Asha Customer', 'Juma Fundi']);
  assert.ok(pays.by_service.some((s) => s.id === service.id && s.gross >= 25000));
});

test('a finished job that is not paid shows as money still to collect', async () => {
  const admin = await makeUser('Boss2', `${PREFIX}00011`, 'admin');
  const customer = await makeUser('Unpaid Customer', `${PREFIX}00012`);
  const worker = await makeUser('Unpaid Fundi', `${PREFIX}00013`);
  const service = await db('services').where({ slug: 'dobi' }).first('id');
  const [p] = await db('provider_profiles').insert({ user_id: worker.id, verification_status: 'verified', lat: -6.67, lng: 39.22 }).returning('*');
  const before = (await api(admin, 'GET', '/api/admin/payments')).body.expected;
  await db('requests').insert({
    customer_id: customer.id, service_id: service.id, provider_id: p.id, status: 'completed', lat: -6.67, lng: 39.22,
    agreed_price: 10000, fee_percent: 10, fee_due: 1000, payout_due: 9000, completed_at: db.fn.now(),
  });
  const after = (await api(admin, 'GET', '/api/admin/payments')).body.expected;
  assert.deepEqual([after.jobs - before.jobs, after.gross - before.gross, after.commission - before.commission, after.for_fundis - before.for_fundis], [1, 10000, 1000, 9000]);
  const list = (await api(admin, 'GET', `/api/admin/requests?q=${PREFIX}00012&outcome=awaiting_payment`)).body;
  assert.equal(list.total, 1);
});
