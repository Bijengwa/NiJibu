// Staff roles: superadmin does everything, customer care (support) sees users, requests, jobs, complaints and no money.
// Also: creating staff, switching them off, time series with a chosen range and step, money split and price data.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const db = require('../src/db');
const app = require('../src/app');
const { signToken } = require('../src/lib/token');

let server, base;
const PREFIX = '2557996';

async function makeUser(phone, role) {
  const [u] = await db('users').insert({ phone, name: `T ${phone}`, role, password_hash: 'x', phone_verified_at: db.fn.now() }).returning('*');
  return { id: u.id, token: signToken(u) };
}
async function api(user, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) },
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const cleanup = async () => {
  const ids = db('users').where('phone', 'like', `${PREFIX}%`).select('id');
  await db('payments').whereIn('customer_id', ids).del();
  await db('requests').whereIn('customer_id', ids).del();
  await db('provider_profiles').whereIn('user_id', ids).del();
  await db('users').where('phone', 'like', `${PREFIX}%`).del();
};

test.before(async () => {
  await cleanup();
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await cleanup();
  await new Promise((r) => server.close(r));
  await db.destroy();
});

test('superadmin creates customer care; care sees people, requests and complaints but no money, staff or settings', async () => {
  const boss = await makeUser(`${PREFIX}00001`, 'superadmin');
  const cust = await makeUser(`${PREFIX}00002`, 'customer');

  // validation
  assert.equal((await api(boss, 'POST', '/api/admin/staff', { name: 'A', phone: '712', role: 'support', password: 'secret123' })).status, 400);
  assert.equal((await api(boss, 'POST', '/api/admin/staff', { name: 'Neema Care', phone: '799600101', role: 'boss', password: 'secret123' })).status, 400);
  assert.equal((await api(boss, 'POST', '/api/admin/staff', { name: 'Neema Care', phone: '799600101', role: 'support', password: 'short' })).status, 400);
  // the phone of a customer cannot become staff
  assert.equal((await api(boss, 'POST', '/api/admin/staff', { name: 'Neema Care', phone: cust.phone || `${PREFIX}00002`, role: 'support', password: 'secret123' })).status, 409);

  const made = await api(boss, 'POST', '/api/admin/staff', { name: 'Neema Care', phone: '799600101', role: 'support', password: 'secret123' });
  assert.equal(made.status, 201);
  assert.equal(made.body.staff.role, 'support');
  assert.equal((await api(boss, 'POST', '/api/admin/staff', { name: 'Again', phone: '255799600101', role: 'support', password: 'secret123' })).status, 409);

  // logs in on the admin portal
  const login = await api(null, 'POST', '/api/auth/admin-login', { phone: '799600101', password: 'secret123' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'support');
  const care = { id: made.body.staff.id, token: login.body.token };

  // a customer cannot use the admin; care can read what she needs
  assert.equal((await api(cust, 'GET', '/api/admin/people')).status, 403);
  assert.equal((await api(care, 'GET', '/api/admin/people')).status, 200);
  assert.equal((await api(care, 'GET', '/api/admin/requests')).status, 200);
  assert.equal((await api(care, 'GET', '/api/admin/complaints')).status, 200);
  assert.equal((await api(care, 'GET', '/api/admin/jobs/registered')).status, 200);
  assert.equal((await api(care, 'GET', `/api/admin/people/${cust.id}/series`)).status, 200);
  const me = await api(care, 'GET', '/api/admin/me');
  assert.deepEqual(me.body.staff.pages, ['home', 'users', 'jobs', 'requests', 'complaints']);

  // ... but no money, no services costs, no staff, no job edits, no verification
  for (const [m, p] of [['GET', '/api/admin/payments'], ['GET', '/api/admin/payments/summary'], ['GET', '/api/admin/payments/prices'], ['GET', '/api/admin/registration-fees'],
    ['GET', '/api/admin/services/usage'], ['GET', '/api/admin/staff'], ['POST', '/api/admin/services'], ['POST', '/api/admin/providers/1/verify'], ['POST', '/api/admin/payouts/1/retry']]) {
    assert.equal((await api(care, m, p, {})).status, 403, `${m} ${p}`);
  }
  assert.equal((await api(care, 'POST', '/api/admin/staff', { name: 'Evil', phone: '799600102', role: 'superadmin', password: 'secret123' })).status, 403);

  // the home summary has no money for care, and has money + staff for the superadmin
  const s1 = (await api(care, 'GET', '/api/admin/summary')).body;
  assert.equal(s1.money, null);
  assert.equal(s1.staff, null);
  assert.equal(s1.needs_action.failed_payments, null);
  const s2 = (await api(boss, 'GET', '/api/admin/summary')).body;
  assert.ok(s2.money.all && s2.staff.support >= 1 && s2.totals.users.total >= 1 && s2.registration);

  // staff are not shown as customers or workers
  const list = await api(boss, 'GET', `/api/admin/people?group=customers&q=${PREFIX}`);
  assert.deepEqual(list.body.items.map((i) => i.phone), [`${PREFIX}00002`]);

  // switch her off: the old token stops, login fails; switch on: login works again
  assert.equal((await api(boss, 'PATCH', `/api/admin/staff/${care.id}`, { disabled: true })).status, 200);
  assert.equal((await api(care, 'GET', '/api/admin/people')).status, 401);
  assert.equal((await api(null, 'POST', '/api/auth/admin-login', { phone: '799600101', password: 'secret123' })).status, 401);
  assert.equal((await api(boss, 'PATCH', `/api/admin/staff/${care.id}`, { disabled: false, password: 'newsecret99' })).status, 200);
  assert.equal((await api(null, 'POST', '/api/auth/admin-login', { phone: '799600101', password: 'newsecret99' })).status, 200);

  // promote to superadmin, then she can see money
  assert.equal((await api(boss, 'PATCH', `/api/admin/staff/${care.id}`, { role: 'superadmin' })).status, 200);
  const re = await api(null, 'POST', '/api/auth/admin-login', { phone: '799600101', password: 'newsecret99' });
  assert.equal((await api({ token: re.body.token }, 'GET', '/api/admin/payments/summary')).status, 200);

  // nobody locks themselves out
  assert.equal((await api(boss, 'PATCH', `/api/admin/staff/${boss.id}`, { role: 'support' })).status, 400);
  assert.equal((await api(boss, 'PATCH', `/api/admin/staff/${boss.id}`, { disabled: true })).status, 400);
  assert.equal((await api(boss, 'PATCH', '/api/admin/staff/999999', { name: 'Zed Zed' })).status, 404);
});

test('series: the admin chooses range and step; real rows land in the right bucket', async () => {
  const boss = await makeUser(`${PREFIX}00011`, 'superadmin');
  const worker = await makeUser(`${PREFIX}00012`, 'fundi');
  const cust = await makeUser(`${PREFIX}00013`, 'customer');
  const [pp] = await db('provider_profiles').insert({ user_id: worker.id, verification_status: 'verified' }).returning('id');
  const svc = await db('services').first('id');
  const ago = (h) => new Date(Date.now() - h * 3600e3);
  const [r1] = await db('requests').insert({ customer_id: cust.id, service_id: svc.id, provider_id: pp.id, lat: -6.7, lng: 39.2, status: 'completed', agreed_price: 20000, created_at: ago(30), completed_at: ago(29) }).returning('id');
  await db('payments').insert({ request_id: r1.id, customer_id: cust.id, provider_id: pp.id, service_id: svc.id, amount: 20000, fee_percent: 10, fee: 2000, payout: 18000, status: 'paid', created_at: ago(29), paid_at: ago(29) });
  await db('requests').insert({ customer_id: cust.id, service_id: svc.id, provider_id: pp.id, lat: -6.7, lng: 39.2, status: 'cancelled', cancelled_by: 'customer', agreed_price: 30000, created_at: ago(2), cancelled_at: ago(1) });

  const q = (p) => api(boss, 'GET', p);
  const to = new Date().toISOString();
  const from = ago(72).toISOString();
  for (const bucket of ['minute', 'hour', 'day', 'week', 'month', 'year']) {
    const r = await q(`/api/admin/series?from=${from}&to=${to}&bucket=${bucket}`);
    assert.equal(r.status, 200, bucket);
    assert.ok(r.body.points.length >= 1 && r.body.points.length <= 400);
  }
  // 72 hours by the hour: 73-74 points, and every total is the real total
  const h = (await q(`/api/admin/series?from=${from}&to=${to}&bucket=hour`)).body;
  assert.equal(h.bucket, 'hour');
  assert.ok(h.points.length >= 72 && h.points.length <= 75);
  const sum = (k) => h.points.reduce((n, p) => n + p[k], 0);
  assert.ok(sum('requests') >= 2 && sum('completed') >= 1 && sum('cancelled') >= 1);
  assert.ok(sum('gross') >= 20000 && sum('commission') >= 2000);
  // minutes over a year are made bigger instead of sending 500 000 points
  const big = (await q(`/api/admin/series?from=${new Date(Date.now() - 365 * 864e5).toISOString()}&to=${to}&bucket=minute`)).body;
  assert.equal(big.adjusted, true);
  assert.ok(big.points.length <= 400 && big.bucket !== 'minute');
  // auto picks a step by itself
  const auto = (await q(`/api/admin/series?from=${from}&to=${to}`)).body;
  assert.equal(auto.auto, true);
  assert.equal(auto.bucket, 'hour');
  // "last 3 days" by the hour
  const last = (await q('/api/admin/series?last=3&unit=day&bucket=hour')).body;
  assert.equal(last.bucket, 'hour');
  assert.ok(last.points.length >= 72 && last.points.length <= 75);
  assert.equal((await q('/api/admin/series?last=0&unit=day')).status, 400);
  assert.equal((await q('/api/admin/series?last=2&unit=decade')).status, 400);
  // bad input
  assert.equal((await q(`/api/admin/series?from=${to}&to=${from}`)).status, 400);
  assert.equal((await q('/api/admin/series?from=nope')).status, 400);

  // one person: the worker's jobs and earnings, the customer's requests and spending
  const w = (await q(`/api/admin/people/${worker.id}/series?from=${from}&to=${to}&bucket=day`)).body;
  assert.equal(w.is_provider, true);
  assert.equal(w.points.reduce((n, p) => n + p.jobs_done, 0), 1);
  assert.equal(w.points.reduce((n, p) => n + p.earned, 0), 18000);
  const c = (await q(`/api/admin/people/${cust.id}/series?from=${from}&to=${to}&bucket=day`)).body;
  assert.equal(c.is_provider, false);
  assert.equal(c.points.reduce((n, p) => n + p.requests, 0), 2);
  assert.equal(c.points.reduce((n, p) => n + p.spent, 0), 20000);
  assert.equal((await q('/api/admin/people/999999/series')).status, 404);
});

test('payments are split in parts and the price data is real', async () => {
  const boss = await makeUser(`${PREFIX}00021`, 'superadmin');
  const sum = (await api(boss, 'GET', '/api/admin/payments/summary')).body;
  for (const k of ['jobs', 'registration', 'payouts', 'to_collect', 'income']) assert.ok(sum[k] !== undefined, k);
  assert.equal(sum.income.total, sum.income.commission + sum.income.registration);
  const prices = (await api(boss, 'GET', '/api/admin/payments/prices?days=365')).body;
  assert.ok(Array.isArray(prices.by_service) && Array.isArray(prices.trend));
  const s = (await api(boss, 'GET', '/api/admin/summary')).body;
  assert.ok(s.prices && s.totals.requests.total >= 0);
});
