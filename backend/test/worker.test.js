// Fundi profile + NIDA test mode: sign-up identity check, details, payout, admin NIDA photos.
require('dotenv').config();
process.env.NIDA_MODE = 'mock';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const db = require('../src/db');
const app = require('../src/app');
const { signToken } = require('../src/lib/token');

const PHONES = ['255799900101', '255799900102', '255799900103', '255799900104', '255799900198'];
const NIDA = '19950312123451234512'; // born 12/03/1995
const NIDA2 = '19900101123451234599';
let server, base;

async function cleanup() {
  await db('users').whereIn('phone', PHONES).del(); // cascades to provider_profiles
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

const match = (nida = NIDA, over = {}) =>
  api(null, 'POST', '/api/provider/identity/match', { nida_number: nida, first_name: 'Asha', last_name: 'Juma', phone: '799900101', ...over });
const answer = (nida, id, a) => api(null, 'POST', '/api/provider/identity/answer', { nida_number: nida, question_id: id, answer: a });

test('identity check (demo): question 1 is wrong, then 5 right in a row passes on question 6', async () => {
  assert.equal((await match(NIDA, { last_name: 'Nomatch' })).body.code, 'NIDA_NAME_MISMATCH');
  assert.equal((await match(NIDA, { phone: '700000000' })).body.code, 'NIDA_PHONE_MISMATCH');
  assert.equal((await match('1234')).body.code, 'VALIDATION');

  // no separate match step is needed before the questions (the details screen starts straight at the questions)
  assert.equal((await answer(NIDA, 'dob', '12/03/1995')).body.correct, false); // question 1 is always wrong
  for (let i = 0; i < 4; i++) assert.equal((await answer(NIDA, 'motherFirst', 'Neema')).body.correct, true);
  // 4 in a row is not a pass yet -> linking is refused
  const user = await makeUser(PHONES[0], 'Asha Juma');
  let link = await api(user, 'POST', '/api/provider/identity', { nida_number: NIDA, first_name: 'Asha', last_name: 'Juma' });
  assert.equal(link.body.code, 'IDENTITY_NOT_VERIFIED');
  assert.equal((await answer(NIDA, 'dob', '12/03/1995')).body.correct, true); // question 6: 5th right in a row
  link = await api(user, 'POST', '/api/provider/identity', { nida_number: NIDA, first_name: 'Asha', middle_name: 'M', last_name: 'Juma' });
  assert.equal(link.status, 200);
  assert.equal(link.body.provider.status, 'verified');
  assert.equal(link.body.provider.nida_name, 'ASHA M JUMA');
  assert.equal(link.body.provider.nida_submitted, true);
  // the NIDA number is never stored in plain text
  const row = await db('provider_profiles').where({ user_id: user.id }).first();
  assert.ok(row.nida_enc && !row.nida_enc.includes(NIDA));
});

test('identity check (demo): a second wrong answer makes 5 in a row impossible and locks for 24 h', async () => {
  assert.equal((await match(NIDA2)).status, 200);
  assert.equal((await answer(NIDA2, 'motherFirst', 'Neema')).body.correct, false); // question 1: always wrong
  const second = await answer(NIDA2, 'motherFirst', 'wrong'); // question 2: wrong again -> 4 left, 5 needed
  assert.equal(second.status, 200);
  assert.equal(second.body.correct, false);
  assert.equal((await answer(NIDA2, 'motherFirst', 'Neema')).body.code, 'IDENTITY_LOCKED');
  assert.equal((await match(NIDA2)).body.code, 'IDENTITY_LOCKED');
});

test('details, same NIDA twice, payout, NIDA photos, admin verify', async () => {
  const user = await makeUser(PHONES[1], 'Baraka Said');
  const empty = await api(user, 'GET', '/api/provider');
  assert.equal(empty.body.provider.status, 'incomplete');

  const bad = await api(user, 'PUT', '/api/provider', { services: ['nope'], lat: -6.6, lng: 39.2, experience: '1-3', availability: 'always' });
  assert.equal(bad.status, 400);
  const saved = await api(user, 'PUT', '/api/provider', { services: ['dobi', 'fundi-bomba'], lat: -6.6, lng: 39.2, experience: '1-3', availability: 'always' });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.provider.services.sort(), ['dobi', 'fundi-bomba']);
  assert.equal(saved.body.provider.status, 'incomplete'); // no NIDA yet

  // NIDA photos (a tiny real PNG)
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#a52' } }).png().toBuffer();
  const form = () => {
    const f = new FormData();
    f.append('nida_number', '19880505123451234577');
    f.append('selfie', new Blob([png], { type: 'image/png' }), 's.png');
    f.append('id_photo', new Blob([png], { type: 'image/png' }), 'i.png');
    return f;
  };
  const sent = await api(user, 'POST', '/api/provider/nida', form());
  assert.equal(sent.status, 200);
  assert.equal(sent.body.provider.status, 'pending');
  // the same NIDA cannot be used by another account
  const other = await makeUser(PHONES[2], 'Other One');
  await api(other, 'PUT', '/api/provider', { services: ['dobi'], lat: -6.6, lng: 39.2, experience: 'lt1', availability: 'always' });
  assert.equal((await api(other, 'POST', '/api/provider/nida', form())).body.code, 'NIDA_TAKEN');

  assert.equal((await api(user, 'PUT', '/api/provider/payout', { network: 'bad', number: '799900102' })).status, 400);
  const paid = await api(user, 'PUT', '/api/provider/payout', { network: 'mpesa', number: '799900102' });
  assert.equal(paid.body.provider.payout_set, true);

  // pending fundi cannot go online; admin sees photos and verifies
  assert.equal((await api(user, 'POST', '/api/provider/online', { lat: -6.6, lng: 39.2 })).body.code, 'NOT_VERIFIED');
  const admin = await makeUser('255799900199', 'Admin', 'admin');
  try {
    const pid = (await db('provider_profiles').where({ user_id: user.id }).first()).id;
    const photo = await api(admin, 'GET', `/api/admin/providers/${pid}/nida/selfie`);
    assert.equal(photo.status, 200);
    assert.equal((await api(user, 'GET', `/api/admin/providers/${pid}/nida/selfie`)).status, 403); // not for normal users
    assert.equal((await api(admin, 'POST', `/api/admin/providers/${pid}/reject`, { reason: 'Blurry photo' })).status, 200);
    let me = await api(user, 'GET', '/api/provider');
    assert.equal(me.body.provider.status, 'rejected');
    assert.equal(me.body.provider.rejection_reason, 'Blurry photo');
    await api(admin, 'POST', `/api/admin/providers/${pid}/verify`);
    me = await api(user, 'GET', '/api/provider');
    assert.equal(me.body.provider.status, 'verified');
    assert.equal(me.body.provider.rejection_reason, null);
    assert.equal((await api(user, 'POST', '/api/provider/online', { lat: -6.6, lng: 39.2 })).status, 200);
  } finally {
    await db('users').where({ phone: '255799900199' }).del();
  }
});

test('each job has its own experience and availability; a typed job waits for the admin', async () => {
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
    other_jobs: [{ name: '  Fundi   Welding ', experience: '3-5', availability: 'always' }],
    ...at,
  });
  assert.equal(saved.status, 200);
  const view = saved.body.provider;
  const by = Object.fromEntries(view.service_details.map((d) => [d.key, d]));
  assert.equal(by.dobi.experience, '1-3');
  assert.equal(by['fundi-bomba'].availability, 'weekends');
  assert.deepEqual(view.other_jobs.map((o) => [o.name, o.status]), [['Fundi Welding', 'pending']]);

  // admin sees it, puts it in the list once, and the fundi is linked with the values they gave
  const list = await api(admin, 'GET', '/api/admin/suggestions');
  const group = list.body.items.find((g) => g.name === 'Fundi Welding');
  assert.ok(group && group.count >= 1);
  assert.equal((await api(user, 'GET', '/api/admin/suggestions')).status, 403);
  const ok = await api(admin, 'POST', `/api/admin/suggestions/${group.providers[0].suggestion_id}/approve`, { name_sw: 'Fundi welding', name_en: 'Welder' });
  assert.equal(ok.status, 200);
  try {
    const after = (await api(user, 'GET', '/api/provider')).body.provider;
    const welder = after.service_details.find((d) => d.key === 'welder');
    assert.equal(welder.experience, '3-5');
    assert.equal(welder.availability, 'always');
    assert.equal(after.other_jobs.length, 0);
  } finally {
    await db('services').where({ slug: 'welder' }).del();
  }

  // admin can see the requests with who was offered them
  assert.equal((await api(admin, 'GET', '/api/admin/requests')).status, 200);
});
