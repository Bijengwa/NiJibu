// Fundi profile: registration fee (paid after the phone code), details, payout, admin review. No NIDA.
require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const db = require('../src/db');
const app = require('../src/app');
const { signToken } = require('../src/lib/token');

const PHONES = ['255799900101', '255799900102', '255799900103', '255799900104', '255799900198', '255799900106', '255799900107', '255799900150'];
let server, base;

async function cleanup() {
  await db('users').whereIn('phone', PHONES).del(); // cascades to provider_profiles
  await db('registration_fees').where('phone', 'like', '2557999%').del();
}
async function makeUser(phone, name, role = 'user') {
  const [u] = await db('users').insert({ phone, name, role, password_hash: 'x', phone_verified_at: db.fn.now() }).returning('*');
  return { id: u.id, token: signToken(u) };
}
async function api(user, method, path, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(base + path, {
    method,
    headers: { ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }), ...(user ? { Authorization: `Bearer ${user.token}` } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const raw = await res.arrayBuffer();
  let json = {};
  try { json = JSON.parse(Buffer.from(raw).toString()); } catch {}
  return { status: res.status, body: json, raw };
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

const REG = '/api/provider/registration';
const payFee = (user, pay_phone) => api(user, 'POST', `${REG}/pay`, pay_phone === undefined ? {} : { pay_phone });

test('registration fee: needs a login, a declined payment pays nothing and opens nothing, no double charge', async () => {
  assert.equal((await api(null, 'GET', `${REG}/fee`)).status, 401);
  const user = await makeUser(PHONES[0], 'Asha Juma');
  assert.deepEqual((await api(user, 'GET', `${REG}/fee`)).body, { amount: 1000, currency: 'TZS', paid: false });
  assert.equal((await payFee(user, '123')).status, 400); // not a payment number

  // the number the worker types is the one charged: it can differ from the account phone
  const declined = await payFee(user, '799990000'); // a number ending 0000 is declined (demo)
  assert.equal(declined.body.fee.status, 'failed');
  assert.equal((await db('registration_fees').where({ id: declined.body.fee.id }).first()).pay_phone, '255799990000');
  assert.equal((await api(user, 'GET', '/api/provider')).body.provider.fee_paid, false);

  const paid = await payFee(user); // pays from the account phone
  assert.equal(paid.body.fee.status, 'paid');
  assert.equal(paid.body.fee.amount, 1000);
  assert.equal((await payFee(user)).body.fee.id, paid.body.fee.id); // not charged again
  assert.equal((await db('registration_fees').where({ phone: PHONES[0], status: 'paid' })).length, 1);
  assert.equal((await api(user, 'GET', `${REG}/fee`)).body.paid, true);

  // paying opens the worker account: registered and verified, no NIDA and no admin step
  const view = (await api(user, 'GET', '/api/provider')).body.provider;
  assert.equal(view.fee_paid, true);
  assert.equal(view.status, 'verified');
  assert.equal('nida_submitted' in view, false);

  // another account cannot read this payment
  const other = await makeUser('255799900150', 'Other Five');
  assert.equal((await api(other, 'GET', `${REG}/pay/${paid.body.fee.id}`)).status, 404);
});

test('registration fee: a payment that waits on the phone opens the account when it is approved', async () => {
  const user = await makeUser(PHONES[5], 'Neema Said');
  const wait = await payFee(user, '799991111'); // a number ending 1111 waits about 8 seconds (demo)
  assert.equal(wait.body.fee.status, 'pending');
  assert.equal((await api(user, 'GET', '/api/provider')).body.provider.fee_paid, false);
  await db('registration_fees').where({ id: wait.body.fee.id }).update({ created_at: new Date(Date.now() - 20000) }); // time passes
  const done = await api(user, 'GET', `${REG}/pay/${wait.body.fee.id}`);
  assert.equal(done.body.fee.status, 'paid');
  assert.equal((await api(user, 'GET', '/api/provider')).body.provider.status, 'verified');
});

test('details, payout, admin reject and verify', async () => {
  const user = await makeUser(PHONES[1], 'Baraka Said');
  const empty = await api(user, 'GET', '/api/provider');
  assert.equal(empty.body.provider.status, 'incomplete');

  const bad = await api(user, 'PUT', '/api/provider', { services: ['nope'], lat: -6.6, lng: 39.2, experience: '1-3', availability: 'always' });
  assert.equal(bad.status, 400);
  const saved = await api(user, 'PUT', '/api/provider', { services: ['dobi', 'fundi-bomba'], lat: -6.6, lng: 39.2, experience: '1-3', availability: 'always' });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.provider.services.sort(), ['dobi', 'fundi-bomba']);
  assert.equal(saved.body.provider.status, 'incomplete'); // the fee is not paid yet
  assert.equal((await api(user, 'POST', '/api/provider/online', { lat: -6.6, lng: 39.2 })).body.code, 'NOT_VERIFIED');

  assert.equal((await payFee(user)).body.fee.status, 'paid');
  const after = (await api(user, 'GET', '/api/provider')).body.provider;
  assert.equal(after.status, 'verified');
  assert.deepEqual(after.services.sort(), ['dobi', 'fundi-bomba']); // the details saved before are kept

  assert.equal((await api(user, 'PUT', '/api/provider/payout', { network: 'bad', number: '799900102' })).status, 400);
  const paid = await api(user, 'PUT', '/api/provider/payout', { network: 'mpesa', number: '799900102' });
  assert.equal(paid.body.provider.payout_set, true);

  // a registered fundi can go online; the admin can still reject and verify again
  const admin = await makeUser('255799900199', 'Admin', 'superadmin');
  try {
    const pid = (await db('provider_profiles').where({ user_id: user.id }).first()).id;
    assert.equal((await api(user, 'GET', '/api/admin/providers?status=verified')).status, 403); // not for normal users
    assert.equal((await api(admin, 'POST', `/api/admin/providers/${pid}/reject`, { reason: 'Not clear' })).status, 200);
    let me = await api(user, 'GET', '/api/provider');
    assert.equal(me.body.provider.status, 'rejected');
    assert.equal(me.body.provider.rejection_reason, 'Not clear');
    assert.equal((await api(user, 'POST', '/api/provider/online', { lat: -6.6, lng: 39.2 })).body.code, 'NOT_VERIFIED');
    await api(admin, 'POST', `/api/admin/providers/${pid}/verify`);
    me = await api(user, 'GET', '/api/provider');
    assert.equal(me.body.provider.status, 'verified');
    assert.equal(me.body.provider.rejection_reason, null);
    assert.equal((await api(user, 'POST', '/api/provider/online', { lat: -6.6, lng: 39.2 })).status, 200);
    // the admin list and the fee list work without NIDA
    assert.equal((await api(admin, 'GET', '/api/admin/providers?status=verified')).status, 200);
    const fees = await api(admin, 'GET', '/api/admin/registration-fees');
    assert.equal(fees.status, 200);
    assert.ok(fees.body.totals.paid >= 1);
  } finally {
    await db('users').where({ phone: '255799900199' }).del();
  }
});

test('each job has its own experience and availability; a typed job is usable at once and the admin approves it', async () => {
  const user = await makeUser(PHONES[3], 'Neema Paul');
  const admin = await makeUser(PHONES[4], 'Admin Two', 'superadmin');
  const at = { lat: -6.6, lng: 39.2 };

  // nothing chosen at all
  assert.equal((await api(user, 'PUT', '/api/provider', { services: [], ...at })).status, 400);
  // a job without experience
  assert.equal((await api(user, 'PUT', '/api/provider', { services: [{ key: 'dobi', availability: 'always' }], ...at })).status, 400);

  const saved = await api(user, 'PUT', '/api/provider', {
    services: [
      { key: 'dobi', experience: '1-3', availability: 'weekdays' },
      { key: 'fundi-bomba', experience: '10+', availability: 'weekends' },
    ],
    other_jobs: [{ name_sw: '  Fundi   Welding ', name_en: ' Welding  work ', experience: '3-5', availability: 'always' }],
    ...at,
  });
  assert.equal(saved.status, 200);
  const view = saved.body.provider;
  const by = Object.fromEntries(view.service_details.map((d) => [d.key, d]));
  assert.equal(by.dobi.experience, '1-3');
  assert.equal(by['fundi-bomba'].availability, 'weekends');
  assert.deepEqual(view.other_jobs.map((o) => [o.name_sw, o.name_en, o.status]), [['Fundi Welding', 'Welding work', 'pending']]);

  // the typed job exists at once as a pending job; the admin sees it, approves it once, and the fundi keeps the values they gave
  const list = await api(admin, 'GET', '/api/admin/suggestions');
  const group = list.body.items.find((g) => g.name_sw === 'Fundi Welding');
  assert.ok(group && group.count >= 1);
  assert.equal((await api(user, 'GET', '/api/admin/suggestions')).status, 403);
  const ok = await api(admin, 'POST', `/api/admin/suggestions/${group.providers[0].suggestion_id}/approve`, { name_sw: 'Fundi welding', name_en: 'Welder' });
  assert.equal(ok.status, 200);
  try {
    const after = (await api(user, 'GET', '/api/provider')).body.provider;
    const welder = after.service_details.find((d) => d.key === 'welding-work'); // the slug stays as created; the names are the admin's
    assert.equal(welder.experience, '3-5');
    assert.equal(welder.availability, 'always');
    assert.equal(after.other_jobs.length, 0);
  } finally {
    await db('services').whereIn('slug', ['welding-work', 'welder']).del();
  }

  // admin can see the requests with who was offered them
  assert.equal((await api(admin, 'GET', '/api/admin/requests')).status, 200);
});
