// Missing jobs: customer search miss -> admin sees it -> merge as a synonym / add as a new job.
// Needs the local Postgres from .env with migrations applied. Run: npm test
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const db = require('../src/db');
const app = require('../src/app');
const { signToken } = require('../src/lib/token');

let server, base;
const PREFIX = '2557998';
const SLUGS = ['test-fundi-ac'];
const LIKE_SLUG = 'zzz-test-%';

async function makeUser(phone, role = 'customer') {
  const [u] = await db('users').insert({ phone, name: phone, role, password_hash: 'x', phone_verified_at: db.fn.now() }).returning('*');
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
  await db('search_logs').whereIn('user_id', db('users').select('id').where('phone', 'like', `${PREFIX}%`)).del();
  await db('search_misses').whereIn('user_id', db('users').select('id').where('phone', 'like', `${PREFIX}%`)).del();
  await db('service_suggestions').whereRaw("lower(name) like 'zzz test%'").del();
  await db('services').whereIn('slug', SLUGS).orWhere('slug', 'like', LIKE_SLUG).del();
  await db('users').where('phone', 'like', `${PREFIX}%`).del();
  await db.raw("update services set aliases = array(select a from unnest(aliases) a where a not like 'zzz%') where exists (select 1 from unnest(aliases) a where a like 'zzz%')");
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

test('a miss is saved once, a known word is not a miss, customers cannot read the admin lists', async () => {
  const c = await makeUser(`${PREFIX}00001`);
  assert.equal((await api(c, 'POST', '/api/services/misses', { query: '  Fundi   AC ', lat: -6.67, lng: 39.22 })).status, 201);
  assert.equal((await api(c, 'POST', '/api/services/misses', { query: 'fundi ac' })).status, 201); // same person, same word: counted once
  const known = await api(c, 'POST', '/api/services/misses', { query: 'dobi' });
  assert.equal(known.body.matched, true);
  assert.equal((await api(c, 'POST', '/api/services/misses', { query: 'a' })).status, 400);
  assert.equal((await db('search_misses').where({ user_id: c.id })).length, 1);
  assert.equal((await api(c, 'GET', '/api/admin/jobs/missing')).status, 403);
  assert.equal((await api(c, 'GET', '/api/admin/summary')).status, 403);
});

test('admin sees the group, merges it into a job, and the customer is told', async () => {
  const admin = await makeUser(`${PREFIX}00002`, 'admin');
  const c1 = await makeUser(`${PREFIX}00003`);
  const c2 = await makeUser(`${PREFIX}00004`);
  await api(c1, 'POST', '/api/services/misses', { query: 'ZZZ Kufulia Test' });
  await api(c2, 'POST', '/api/services/misses', { query: 'zzz kufulia test', lat: -6.67, lng: 39.22 });

  const list = await api(admin, 'GET', '/api/admin/jobs/missing');
  assert.equal(list.status, 200);
  const g = list.body.items.find((i) => i.normalized === 'zzz kufulia test');
  assert.ok(g, 'group exists');
  assert.equal(g.searches, 2);
  assert.equal(g.customers, 2);
  assert.equal(g.action, 'recruit'); // no worker wrote it

  const dobi = await db('services').where({ slug: 'dobi' }).first('id');
  const merged = await api(admin, 'POST', '/api/admin/jobs/missing/merge', { normalized: g.normalized, service_id: dobi.id });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.customers_notified, 2);
  assert.ok((await db('services').where({ id: dobi.id }).first('aliases')).aliases.includes('zzz kufulia test'));
  assert.equal(await db('notifications').where({ user_id: c1.id, type: 'job_available' }).first() !== undefined, true);

  // Now it is a known word
  assert.equal((await api(c1, 'POST', '/api/services/misses', { query: 'zzz kufulia test' })).body.matched, true);
  assert.equal((await api(admin, 'GET', '/api/admin/jobs/missing')).body.items.some((i) => i.normalized === 'zzz kufulia test'), false);
});

test('admin adds a new job from a miss and workers who wrote it are linked', async () => {
  const admin = await makeUser(`${PREFIX}00005`, 'admin');
  const c = await makeUser(`${PREFIX}00006`);
  const w = await makeUser(`${PREFIX}00007`);
  const [p] = await db('provider_profiles').insert({ user_id: w.id, verification_status: 'verified' }).returning('id');
  await db('service_suggestions').insert({ provider_id: p.id, name: 'ZZZ test Fundi AC', experience: '1-3', availability: 'full' });
  await api(c, 'POST', '/api/services/misses', { query: 'zzz test fundi ac' });

  const g = (await api(admin, 'GET', '/api/admin/jobs/missing')).body.items.find((i) => i.normalized === 'zzz test fundi ac');
  assert.equal(g.workers, 1);
  assert.equal(g.action, 'add');

  const added = await api(admin, 'POST', '/api/admin/jobs/missing/add', { normalized: g.normalized, name_sw: 'Fundi wa AC', name_en: 'Test Fundi AC' });
  assert.equal(added.status, 201);
  assert.equal(added.body.providers_linked, 1);
  assert.equal(added.body.customers_notified, 1);
  assert.equal((await db('provider_services').where({ provider_id: p.id, service_id: added.body.service.id }).first()) !== undefined, true);
  // same name again -> 409
  assert.equal((await api(admin, 'POST', '/api/admin/jobs/missing/add', { normalized: 'x y', name_sw: 'a', name_en: 'Test Fundi AC' })).status, 409);
  await db('provider_profiles').where({ id: p.id }).del();
});

test('registered jobs and the dashboard summary answer', async () => {
  const admin = await makeUser(`${PREFIX}00008`, 'admin');
  const reg = await api(admin, 'GET', '/api/admin/jobs/registered?days=30');
  assert.equal(reg.status, 200);
  assert.ok(reg.body.items.length > 0);
  assert.ok('searches' in reg.body.items[0] && 'providers' in reg.body.items[0]);
  const sum = await api(admin, 'GET', '/api/admin/summary');
  assert.equal(sum.status, 200);
  for (const k of ['needs_action', 'money', 'demand', 'supply', 'top_jobs', 'top_missing']) assert.ok(k in sum.body, k);
  assert.equal(typeof sum.body.needs_action.providers_pending, 'number');
});

test('search log shows what passed, what failed, and who searched again after failing', async () => {
  const admin = await makeUser(`${PREFIX}00009`, 'admin');
  const c = await makeUser(`${PREFIX}00010`);
  const dobi = (await db('services').where({ slug: 'dobi' }).first('id')).id;
  const min = (m) => new Date(Date.now() - m * 60 * 1000);
  await db('search_logs').insert([
    { user_id: c.id, service_id: dobi, lat: -6.67, lng: 39.22, providers_found: 0, created_at: min(20) }, // failed
    { user_id: c.id, service_id: dobi, lat: -6.67, lng: 39.22, providers_found: 0, created_at: min(15) }, // tried again, failed again
    { user_id: c.id, service_id: dobi, lat: -6.67, lng: 39.22, providers_found: 2, created_at: min(10) }, // passed
  ]);
  const r = await api(admin, 'GET', '/api/admin/searches?days=1');
  assert.equal(r.status, 200);
  const mine = r.body.items.filter((i) => i.phone === `${PREFIX}00010`).sort((a, b) => new Date(a.at) - new Date(b.at));
  assert.deepEqual(mine.map((i) => i.outcome), ['no_provider', 'no_provider', 'found']);
  assert.deepEqual(mine.map((i) => i.attempt), [1, 2, 3]);
  assert.deepEqual(mine.map((i) => i.retry), [false, true, true]);
  assert.ok(r.body.stats.retries >= 2);
  assert.ok(r.body.top_retriers.some((t) => t.phone === `${PREFIX}00010` && t.attempts === 3));
  const failedOnly = await api(admin, 'GET', '/api/admin/searches?days=1&outcome=no_provider');
  assert.ok(failedOnly.body.items.every((i) => i.outcome === 'no_provider'));
  assert.equal((await api(c, 'GET', '/api/admin/searches')).status, 403);
  // the words customers type come from the database
  const names = await db('services').where({ slug: 'fundi-bomba' }).first('aliases');
  assert.ok(names.aliases.includes('plumber'));
});

const at = { lat: -6.6, lng: 39.2 };
const writes = (name_sw, name_en) => ({ services: [], other_jobs: [{ name_sw, name_en, experience: '1-3', availability: 'always' }], ...at });

test('a worker writes a job: it exists at once, a second worker joins it, the admin approves it', async () => {
  const w1 = await makeUser(`${PREFIX}00020`);
  const w2 = await makeUser(`${PREFIX}00021`);
  const c = await makeUser(`${PREFIX}00022`);
  const admin = await makeUser(`${PREFIX}00023`, 'admin');

  const r1 = await api(w1, 'PUT', '/api/provider', writes('ZZZ Test Kuchomelea', 'ZZZ Test Welding'));
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.body.provider.other_jobs.map((o) => [o.name_en, o.name_sw, o.status]), [['ZZZ Test Welding', 'ZZZ Test Kuchomelea', 'pending']]);
  assert.equal(r1.body.provider.service_details.length, 0); // not in the fixed list
  const svc = await db('services').where({ slug: 'zzz-test-welding' }).first();
  assert.equal(svc.status, 'pending');
  assert.equal(svc.active, true);
  assert.equal((await db('provider_services').where({ service_id: svc.id })).length, 1); // the worker can use it now

  // another worker writes the same job (other letter case): one job, two workers
  await api(w2, 'PUT', '/api/provider', writes('zzz test kuchomelea', 'zzz test welding'));
  assert.equal((await db('services').where('slug', 'like', 'zzz-test-welding%')).length, 1);
  assert.equal((await db('provider_services').where({ service_id: svc.id })).length, 2);

  // customers can find it by name, the apps know it is pending
  const list = await api(c, 'GET', '/api/services');
  assert.equal(list.body.items.find((i) => i.slug === 'zzz-test-welding').status, 'pending');
  assert.equal((await api(c, 'POST', '/api/services/misses', { query: 'zzz test welding' })).body.matched, true);

  const sug = await api(admin, 'GET', '/api/admin/suggestions');
  const g = sug.body.items.find((i) => i.service_id === svc.id);
  assert.equal(g.count, 2);
  assert.equal(g.name_en, 'ZZZ Test Welding');
  assert.equal(g.providers.every((p) => p.phone), true); // the admin can call them
  const reg = await api(admin, 'GET', '/api/admin/jobs/registered');
  assert.equal(reg.body.items.some((i) => i.id === svc.id), false); // pending jobs are not in "Registered"

  // a name that another approved job already has: the admin must merge instead
  const dobi = await db('services').where({ slug: 'dobi' }).first('name_sw', 'name_en');
  assert.equal((await api(admin, 'POST', `/api/admin/suggestions/${g.first_id}/approve`, { name_sw: dobi.name_sw, name_en: dobi.name_en })).status, 409);

  const ok = await api(admin, 'POST', `/api/admin/suggestions/${g.first_id}/approve`, { name_sw: 'ZZZ Test Kuchomelea', name_en: 'ZZZ Test Welding' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.providers_linked, 2);
  assert.equal((await db('services').where({ id: svc.id }).first()).status, 'approved');
  const view = (await api(w1, 'GET', '/api/provider')).body.provider;
  assert.equal(view.other_jobs.length, 0);
  assert.ok(view.service_details.some((d) => d.key === 'zzz-test-welding')); // now a normal job
  assert.equal(await db('notifications').where({ user_id: w1.id, type: 'job_approved' }).first() !== undefined, true);
});

test('merge moves workers and words to the existing job; reject switches a job off and it is not sent again', async () => {
  const w = await makeUser(`${PREFIX}00024`);
  const admin = await makeUser(`${PREFIX}00025`, 'admin');
  const dobi = await db('services').where({ slug: 'dobi' }).first('id');

  await api(w, 'PUT', '/api/provider', writes('ZZZ Test Merge', 'ZZZ Test Merge'));
  const pending = await db('services').where({ slug: 'zzz-test-merge' }).first();
  const g = (await api(admin, 'GET', '/api/admin/suggestions')).body.items.find((i) => i.service_id === pending.id);
  const merged = await api(admin, 'POST', `/api/admin/suggestions/${g.first_id}/merge`, { service_id: dobi.id });
  assert.equal(merged.status, 200);
  assert.equal(await db('services').where({ id: pending.id }).first(), undefined); // the pending job is gone
  const p = await db('provider_profiles').where({ user_id: w.id }).first('id');
  assert.equal(await db('provider_services').where({ provider_id: p.id, service_id: dobi.id }).first() !== undefined, true);
  assert.ok((await db('services').where({ id: dobi.id }).first('aliases')).aliases.includes('zzz test merge'));

  // reject
  await api(w, 'PUT', '/api/provider', writes('ZZZ Test Reject', 'ZZZ Test Reject'));
  const bad = await db('services').where({ slug: 'zzz-test-reject' }).first();
  const g2 = (await api(admin, 'GET', '/api/admin/suggestions')).body.items.find((i) => i.service_id === bad.id);
  assert.equal((await api(admin, 'POST', `/api/admin/suggestions/${g2.first_id}/reject`, { reason: 'Not a real job' })).status, 200);
  const after = await db('services').where({ id: bad.id }).first();
  assert.equal(after.status, 'rejected');
  assert.equal(after.active, false);
  assert.equal((await db('provider_services').where({ service_id: bad.id })).length, 0);
  const note = await db('notifications').where({ user_id: w.id, type: 'job_rejected' }).first();
  assert.equal(note.body, 'Not a real job');
  const view = (await api(w, 'GET', '/api/provider')).body.provider;
  assert.deepEqual(view.other_jobs.map((o) => o.status), ['rejected']);

  // the app sends the same list again on every save: a rejected job is not created again
  await api(w, 'PUT', '/api/provider', writes('ZZZ Test Reject', 'ZZZ Test Reject'));
  assert.equal((await db('services').where('slug', 'like', 'zzz-test-reject%')).length, 1);
  assert.equal((await db('services').where({ id: bad.id }).first()).status, 'rejected');
});
