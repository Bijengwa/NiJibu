// Admin people list: customers and providers, and a worker who also requests services.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const db = require('../src/db');
const app = require('../src/app');
const { signToken } = require('../src/lib/token');

let server, base;
const PREFIX = '2557997';

async function makeUser(phone, role) {
  const [u] = await db('users').insert({ phone, name: `T ${phone}`, role, password_hash: 'x', phone_verified_at: db.fn.now() }).returning('*');
  return { id: u.id, token: signToken(u) };
}
async function api(user, path) {
  const res = await fetch(base + path, { headers: user ? { Authorization: `Bearer ${user.token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const cleanup = () => db('users').where('phone', 'like', `${PREFIX}%`).del();

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

test('customers and providers are grouped; a worker who requests shows in both', async () => {
  const admin = await makeUser(`${PREFIX}00001`, 'admin');
  const cust = await makeUser(`${PREFIX}00002`, 'customer');
  const worker = await makeUser(`${PREFIX}00003`, 'fundi');
  const [pp] = await db('provider_profiles').insert({ user_id: worker.id, verification_status: 'verified' }).returning('id');
  const svc = await db('services').first('id');
  await db('requests').insert({ customer_id: worker.id, service_id: svc.id, lat: -6.7, lng: 39.2, status: 'cancelled' });

  assert.equal((await api(cust, '/api/admin/people')).status, 403);

  const c = await api(admin, `/api/admin/people?group=customers&q=${PREFIX}`);
  assert.equal(c.status, 200);
  const phones = c.body.items.map((i) => i.phone);
  assert.ok(phones.includes(`${PREFIX}00002`));
  assert.ok(phones.includes(`${PREFIX}00003`), 'worker who requested is also a customer');
  assert.equal(c.body.items.find((i) => i.phone === `${PREFIX}00003`).also_provider, true);

  const p = await api(admin, `/api/admin/people?group=providers&q=${PREFIX}`);
  assert.deepEqual(p.body.items.map((i) => i.phone), [`${PREFIX}00003`]);
  assert.equal(p.body.items[0].also_customer, true);

  const d = await api(admin, `/api/admin/people/${worker.id}`);
  assert.equal(d.status, 200);
  assert.equal(d.body.as_customer.stats.requests, 1);
  assert.equal(d.body.as_provider.profile.id, pp.id);
  assert.equal((await api(admin, `/api/admin/people/${cust.id}`)).body.as_provider, null);
  assert.equal((await api(admin, `/api/admin/people/${admin.id}`)).status, 404);
});
