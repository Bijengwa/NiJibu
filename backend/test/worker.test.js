// Fundi profile + NIDA test mode: registration fee, one-hit identity check, details, payout, admin review.
require('dotenv').config();
process.env.NIDA_MODE = 'mock';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const db = require('../src/db');
const app = require('../src/app');
const { signToken } = require('../src/lib/token');

const PHONES = ['255799900101', '255799900102', '255799900103', '255799900104', '255799900198', '255799900106', '255799900107'];
const NIDA = '19950312123451234512'; // born 12/03/1995
const NIDA2 = '19900101123451234599';
let server, base;

async function cleanup() {
  await db('users').whereIn('phone', PHONES).del(); // cascades to provider_profiles
  await db('verification_fees').where('phone', 'like', '2557999%').del();
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
  await db('provider_profiles').whereIn('nida_hash', []).del();
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
test.after(async () => {
  await cleanup();
  await new Promise((r) => server.close(r));
  await db.destroy();
});

const ID = '/api/provider/identity';
const payFee = (phone, pay_phone) => api(null, 'POST', `${ID}/fee`, { phone, pay_phone });
const check = (feeId, phone, over = {}) =>
  api(null, 'POST', `${ID}/check`, { fee_id: feeId, phone, nida_number: NIDA, first_name: 'Asha', last_name: 'Juma', question_id: 'dob', answer: '12/03/1995', ...over });

test('registration fee: needed before the check, a declined payment pays nothing, no double charge', async () => {
  assert.deepEqual((await api(null, 'GET', `${ID}/fee`)).body, { amount: 1000, currency: 'TZS' });
  assert.equal((await check(999999, '799900101')).body.code, 'FEE_REQUIRED'); // no fee, no NIDA hit
  assert.equal((await payFee('12345')).status, 400); // not a phone number
  assert.equal((await payFee('799900101', '123')).status, 400); // not a payment number

  const declined = await payFee('799990000'); // a phone ending 0000 is declined (demo)
  assert.equal(declined.body.fee.status, 'failed');
  assert.equal((await check(declined.body.fee.id, '799990000')).body.code, 'FEE_REQUIRED');

  // the number the worker types is the one charged: it can differ from the account phone
  const other = await payFee('799900108', '799990000'); // account 799900108, pays from a number that is declined
  assert.equal(other.body.fee.status, 'failed');
  assert.equal((await db('verification_fees').where({ id: other.body.fee.id }).first()).pay_phone, '255799990000');

  const paid = await payFee('799900101');
  assert.equal(paid.body.fee.status, 'paid');
  assert.equal(paid.body.fee.amount, 1000);
  assert.equal((await payFee('799900101')).body.fee.id, paid.body.fee.id); // the same unused try, not charged again
  // another phone cannot use this payment
  assert.equal((await check(paid.body.fee.id, '799900199')).body.code, 'FEE_REQUIRED');
});

test('identity check (demo): ONE hit passes, and then the try is closed', async () => {
  const fee = (await payFee('799900101')).body.fee;
  assert.equal((await check(fee.id, '799900101', { nida_number: '1234' })).status, 400);
  const ok = await check(fee.id, '799900101');
  assert.equal(ok.body.result, 'passed');
  assert.equal(ok.body.nida_number, NIDA);
  assert.equal((await check(fee.id, '799900101', { question_id: 'motherMiddle' })).body.code, 'CHECK_CLOSED'); // 1 test only

  const user = await makeUser(PHONES[0], 'Asha Juma');
  const link = await api(user, 'POST', ID, { nida_number: NIDA, first_name: 'Asha', middle_name: 'M', last_name: 'Juma' });
  assert.equal(link.status, 200);
  assert.equal(link.body.provider.status, 'verified');
  assert.equal(link.body.provider.nida_name, 'ASHA M JUMA');
  assert.equal(link.body.provider.nida_submitted, true);
  const row = await db('provider_profiles').where({ user_id: user.id }).first();
  assert.ok(row.nida_enc && !row.nida_enc.includes(NIDA)); // never stored in plain text
  // a passed check links once
  assert.equal((await api(user, 'POST', ID, { nida_number: NIDA, first_name: 'Asha', last_name: 'Juma' })).body.code, 'IDENTITY_NOT_VERIFIED');
  // and a NIDA number that did not pass cannot be linked
  const other = await makeUser('255799900104', 'Other Four');
  assert.equal((await api(other, 'POST', ID, { nida_number: NIDA, first_name: 'A', last_name: 'B' })).body.code, 'IDENTITY_NOT_VERIFIED');
});

test('identity check (demo): a mistake gets ONE correction with a different question, then it fails; the next try is paid again', async () => {
  const fee = (await payFee('799900105')).body.fee;
  const first = await check(fee.id, '799900105', { answer: 'wrong answer' });
  assert.equal(first.body.result, 'retry');
  assert.deepEqual(first.body.wrong, ['answer']);
  assert.equal(first.body.hits_left, 1);
  // the same question again is refused and does not use the last hit
  assert.equal((await check(fee.id, '799900105')).body.code, 'QUESTION_REPEATED');
  const second = await check(fee.id, '799900105', { question_id: 'motherMiddle', last_name: 'Nomatch' });
  assert.equal(second.body.result, 'failed');
  assert.deepEqual(second.body.wrong, ['name']);
  assert.equal((await check(fee.id, '799900105', { question_id: 'fatherMiddle' })).body.code, 'CHECK_CLOSED');
  // coming back to verify = a new payment
  const again = (await payFee('799900105')).body.fee;
  assert.notEqual(again.id, fee.id);
  assert.equal(again.status, 'paid');
  assert.equal((await db('verification_fees').where({ phone: '255799900105', status: 'paid' })).length, 2);
});

test('identity check (demo): NIDA has another number: the worker accepts it (no new hit) or corrects it', async () => {
  // accept
  const f1 = (await payFee('799900106')).body.fee;
  const d = await check(f1.id, '799900106', { nida_number: NIDA2 });
  assert.equal(d.body.result, 'number_differs');
  assert.equal(d.body.nida_number, '19900101123451234500');
  const acc = await api(null, 'POST', `${ID}/accept`, { fee_id: f1.id, phone: '799900106', accept: true });
  assert.equal(acc.body.result, 'passed');
  assert.equal(acc.body.nida_number, '19900101123451234500');
  const user = await makeUser(PHONES[5], 'Neema Said');
  const link = await api(user, 'POST', ID, { nida_number: acc.body.nida_number, first_name: 'Neema', last_name: 'Said' });
  assert.equal(link.body.provider.status, 'verified');

  // not mine: the worker says no, then corrects it with the second hit and a different question
  const f2 = (await payFee('799900107')).body.fee;
  assert.equal((await check(f2.id, '799900107', { nida_number: NIDA2 })).body.result, 'number_differs');
  const no = await api(null, 'POST', `${ID}/accept`, { fee_id: f2.id, phone: '799900107', accept: false });
  assert.equal(no.body.result, 'retry');
  assert.deepEqual(no.body.wrong, ['nida']);
  assert.equal((await api(null, 'POST', `${ID}/accept`, { fee_id: f2.id, phone: '799900107', accept: true })).body.code, 'NOTHING_TO_ACCEPT');
  const fixed = await check(f2.id, '799900107', { question_id: 'fatherMiddle' }); // the right number this time
  assert.equal(fixed.body.result, 'passed');
  assert.equal(fixed.body.nida_number, NIDA);
});

test('details, same NIDA twice, payout, admin reject and verify', async () => {
  const user = await makeUser(PHONES[1], 'Baraka Said');
  const empty = await api(user, 'GET', '/api/provider');
  assert.equal(empty.body.provider.status, 'incomplete');

  const bad = await api(user, 'PUT', '/api/provider', { services: ['nope'], lat: -6.6, lng: 39.2, experience: '1-3', availability: 'always' });
  assert.equal(bad.status, 400);
  const saved = await api(user, 'PUT', '/api/provider', { services: ['dobi', 'fundi-bomba'], lat: -6.6, lng: 39.2, experience: '1-3', availability: 'always' });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.provider.services.sort(), ['dobi', 'fundi-bomba']);
  assert.equal(saved.body.provider.status, 'incomplete'); // no NIDA yet

  // NIDA only (no photos): pay the fee, pass the check, link the number
  const N = '19880505123451234577'; // born 05/05/1988
  const pass = async (phone9) => {
    const fee = (await payFee(phone9)).body.fee;
    return check(fee.id, phone9, { nida_number: N, first_name: 'Baraka', last_name: 'Said', answer: '05/05/1988' });
  };
  assert.equal((await pass('799900102')).body.result, 'passed');
  const sent = await api(user, 'POST', ID, { nida_number: N, first_name: 'Baraka', last_name: 'Said' });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.provider.status, 'verified'); // mock NIDA said yes
  // the old photo way is gone
  assert.equal((await api(user, 'POST', '/api/provider/nida', {})).status, 404);
  // the same NIDA cannot be used by another account
  const other = await makeUser(PHONES[2], 'Other One');
  await api(other, 'PUT', '/api/provider', { services: ['dobi'], lat: -6.6, lng: 39.2, experience: 'lt1', availability: 'always' });
  assert.equal((await pass('799900103')).body.result, 'passed');
  assert.equal((await api(other, 'POST', ID, { nida_number: N, first_name: 'Other', last_name: 'One' })).body.code, 'NIDA_TAKEN');

  assert.equal((await api(user, 'PUT', '/api/provider/payout', { network: 'bad', number: '799900102' })).status, 400);
  const paid = await api(user, 'PUT', '/api/provider/payout', { network: 'mpesa', number: '799900102' });
  assert.equal(paid.body.provider.payout_set, true);

  // a NIDA-verified fundi can go online; the admin can still reject and verify again
  const admin = await makeUser('255799900199', 'Admin', 'admin');
  try {
    const pid = (await db('provider_profiles').where({ user_id: user.id }).first()).id;
    assert.equal((await api(user, 'GET', `/api/admin/providers/${pid}/nida/selfie`)).status, 403); // not for normal users
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
  } finally {
    await db('users').where({ phone: '255799900199' }).del();
  }
});

test('each job has its own experience and availability; a typed job is usable at once and the admin approves it', async () => {
  const user = await makeUser(PHONES[3], 'Neema Paul');
  const admin = await makeUser(PHONES[4], 'Admin Two', 'admin');
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
