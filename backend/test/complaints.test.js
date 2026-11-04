// Complaints: customer and worker report a problem with a request (7 days), the admin answers.
// Needs the local Postgres + migrations. Run: npm test
require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const db = require('../src/db');
const app = require('../src/app');
const { signToken } = require('../src/lib/token');

const PREFIX = '2557997';
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

test('complaints: who can file, 7 days, one at a time, admin answers, money waits', async () => {
  const admin = await makeUser('Boss', `${PREFIX}00001`, 'admin');
  const customer = await makeUser('Asha Customer', `${PREFIX}00002`);
  const worker = await makeUser('Juma Fundi', `${PREFIX}00003`);
  const stranger = await makeUser('Neema Customer', `${PREFIX}00004`);
  const service = await db('services').where({ slug: 'dobi' }).first('id');
  const [p] = await db('provider_profiles')
    .insert({ user_id: worker.id, verification_status: 'verified', is_online: true, lat: -6.67, lng: 39.22, payout_network: 'mpesa', payout_number: '712345678' })
    .returning('*');

  // a finished job with a price, done now
  const [r] = await db('requests')
    .insert({
      customer_id: customer.id, service_id: service.id, provider_id: p.id, status: 'completed', lat: -6.67, lng: 39.22,
      accepted_at: db.fn.now(), completed_at: db.fn.now(), agreed_price: 20000, fee_percent: 10, fee_due: 2000, payout_due: 18000,
    })
    .returning('*');

  // rules
  const url = `/api/requests/${r.id}/complaint`;
  assert.equal((await api(stranger, 'POST', url, { reason: 'bad_work', message: 'Not my job at all' })).status, 404, 'only people of that request');
  assert.equal((await api(customer, 'POST', url, { reason: 'customer_no_show', message: 'Wrong list of reasons' })).status, 400, 'worker reasons are not for customers');
  assert.equal((await api(customer, 'POST', url, { reason: 'bad_work', message: 'x' })).status, 400, 'a short message is refused');

  // customer files; a second one for the same request is refused
  const filed = await api(customer, 'POST', url, { reason: 'bad_work', message: 'The clothes are still dirty' });
  assert.equal(filed.status, 201);
  assert.equal(filed.body.complaint.status, 'open');
  assert.match(filed.body.complaint.code, /^CP-\d{6}$/);
  assert.equal((await api(customer, 'POST', url, { reason: 'rude', message: 'And he was rude too' })).body.code, 'COMPLAINT_OPEN');

  // the worker of the same request can complain too
  const wurl = `/api/provider/jobs/${r.id}/complaint`;
  assert.equal((await api(customer, 'POST', wurl, { reason: 'rude', message: 'Customer shouted at me' })).status, 403, 'a customer cannot use the worker route');
  assert.equal((await api(worker, 'POST', wurl, { reason: 'bad_work', message: 'Wrong list of reasons' })).status, 400);
  assert.equal((await api(worker, 'POST', wurl, { reason: 'rude', message: 'Customer shouted at me' })).status, 201);

  // my complaints
  const mine = (await api(customer, 'GET', '/api/requests/complaints/mine')).body;
  assert.equal(mine.items.length, 1);
  assert.equal(mine.window_days, 7);
  assert.equal((await api(worker, 'GET', '/api/provider/complaints')).body.items.length, 1);

  // 7 days: an old job is too late; a job with no worker cannot be reported
  const [old] = await db('requests')
    .insert({ customer_id: customer.id, service_id: service.id, provider_id: p.id, status: 'completed', lat: -6.67, lng: 39.22, accepted_at: db.raw("now() - interval '9 days'"), completed_at: db.raw("now() - interval '8 days'") })
    .returning('*');
  assert.equal((await api(customer, 'POST', `/api/requests/${old.id}/complaint`, { reason: 'bad_work', message: 'Too old to report' })).body.code, 'TOO_LATE');
  const [none] = await db('requests').insert({ customer_id: stranger.id, service_id: service.id, status: 'no_provider', lat: -6.67, lng: 39.22 }).returning('*');
  assert.equal((await api(stranger, 'POST', `/api/requests/${none.id}/complaint`, { reason: 'other', message: 'Nobody came here' })).status, 409);

  // the customer confirmed the work, then pays while the complaint is open: the worker's money waits
  assert.equal((await api(customer, 'POST', `/api/requests/${r.id}/confirm`)).status, 200);
  assert.equal((await api(customer, 'POST', `/api/requests/${r.id}/pay`, { network: 'mpesa', phone: '0712345678' })).status, 200);
  let po;
  po = await db('payouts as po').join('payments as pay', 'pay.id', 'po.payment_id').where('pay.request_id', r.id).first('po.*');
  assert.deepEqual([po.status, po.failure], ['pending', 'ON_HOLD']);

  // admin: only admins; list, filter, counts
  assert.equal((await api(customer, 'GET', '/api/admin/complaints')).status, 403);
  const list = (await api(admin, 'GET', `/api/admin/complaints?search=${r.code}`)).body;
  assert.equal(list.items.length, 2);
  assert.deepEqual(list.items.map((i) => i.from_role).sort(), ['customer', 'worker']);
  assert.equal((await api(admin, 'GET', `/api/admin/complaints?status=active&from_role=worker&search=${r.code}`)).body.items.length, 1);
  assert.ok(list.counts.open >= 2);
  const cust = list.items.find((i) => i.from_role === 'customer');
  assert.equal(cust.request_code, r.code);
  assert.equal(cust.against_name, 'Juma Fundi');

  // admin answers: a closing answer needs a reply; in_review does not
  const cid = cust.id;
  assert.equal((await api(admin, 'POST', `/api/admin/complaints/${cid}`, { status: 'weird' })).status, 400);
  assert.equal((await api(admin, 'POST', `/api/admin/complaints/${cid}`, { status: 'resolved' })).status, 400);
  assert.equal((await api(admin, 'POST', `/api/admin/complaints/${cid}`, { status: 'in_review' })).status, 200);
  po = await db('payouts as po').join('payments as pay', 'pay.id', 'po.payment_id').where('pay.request_id', r.id).first('po.*');
  assert.equal(po.failure, 'ON_HOLD', 'still waiting while it is being reviewed');
  assert.equal((await api(admin, 'POST', `/api/admin/complaints/${cid}`, { status: 'rejected', reply: 'The photos show the work is fine' })).status, 200);
  assert.equal((await api(admin, 'POST', `/api/admin/complaints/${cid}`, { status: 'resolved', reply: 'Again' })).status, 409, 'a closed one stays closed');

  // the money goes out once the customer's complaint is closed
  po = await db('payouts as po').join('payments as pay', 'pay.id', 'po.payment_id').where('pay.request_id', r.id).first('po.*');
  assert.equal(po.status, 'sent');

  // the customer sees the answer
  const after = (await api(customer, 'GET', '/api/requests/complaints/mine')).body.items[0];
  assert.deepEqual([after.status, after.admin_reply], ['rejected', 'The photos show the work is fine']);
  assert.ok(await db('notifications').where({ user_id: customer.id, type: 'complaint_update' }).first());
  assert.ok(await db('notifications').where({ user_id: admin.id, type: 'new_complaint' }).first());

  // after it is closed the customer may file a new one (still inside 7 days)
  assert.equal((await api(customer, 'POST', url, { reason: 'payment_problem', message: 'Charged me twice maybe' })).status, 201);
});

test('admin portal gets a live signal when something changes (no refresh needed)', async () => {
  const admin = await makeUser('Live Boss', `${PREFIX}00011`, 'admin');
  const customer = await makeUser('Live Customer', `${PREFIX}00012`);
  const worker = await makeUser('Live Fundi', `${PREFIX}00013`);
  const service = await db('services').where({ slug: 'dobi' }).first('id');
  const [p] = await db('provider_profiles').insert({ user_id: worker.id, verification_status: 'verified', lat: -6.67, lng: 39.22 }).returning('*');
  const [r] = await db('requests')
    .insert({ customer_id: customer.id, service_id: service.id, provider_id: p.id, status: 'completed', lat: -6.67, lng: 39.22, accepted_at: db.fn.now(), completed_at: db.fn.now() })
    .returning('*');

  // only admins may listen
  assert.equal((await fetch(`${base}/api/admin/events`, { headers: { Authorization: `Bearer ${customer.token}` } })).status, 403);

  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/admin/events`, { headers: { Authorization: `Bearer ${admin.token}` }, signal: ctrl.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const next = async () => {
    const t = setTimeout(() => ctrl.abort(), 3000);
    try {
      const { value } = await reader.read();
      return dec.decode(value);
    } finally {
      clearTimeout(t);
    }
  };
  assert.match(await next(), /retry/); // connected

  // a customer reports a problem -> the admin is told at once
  assert.equal((await api(customer, 'POST', `/api/requests/${r.id}/complaint`, { reason: 'bad_work', message: 'Still dirty clothes' })).status, 201);
  assert.match(await next(), /data:/);
  ctrl.abort();
});
