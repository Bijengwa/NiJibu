// Outside services: cost maths, the usage report for the admin, and the "we paid you" message (Africa's Talking).
// Outside calls are faked. Needs the local Postgres + migrations. Run: npm test
require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const db = require('../src/db');
const app = require('../src/app');
const { signToken } = require('../src/lib/token');
const costs = require('../src/lib/serviceCosts');
const usage = require('../src/lib/usage');
const messaging = require('../src/services/messaging');
const report = require('../src/services/serviceReport');

const PREFIX = '2557996';
const realFetch = global.fetch;
let server, base, calls = [];

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
const sms = (extra = {}) => reply({ SMSMessageData: { Recipients: [{ statusCode: 101, status: 'Success', messageId: 'ATXid_1', ...extra }] } });

const ENV_KEYS = ['MESSAGING_MODE', 'AT_USERNAME', 'AT_API_KEY'];
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
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 40));
  }
};

const STARTED = new Date();
const TEST_MONTH = '2025-03'; // an old month, so real usage in a development database never mixes with the test rows
const at = (day, hour = 9) => new Date(Date.UTC(2025, 2, day, hour - 3)); // Dar es Salaam time
async function cleanup() {
  await db('service_usage').where({ tag: 'TEST' }).orWhere({ service: 'africastalking', tag: 'provider_arrived' }).where('created_at', '>=', STARTED).del();
  await db('payouts').whereIn('provider_id', db('provider_profiles').select('id').whereIn('user_id', db('users').select('id').where('phone', 'like', `${PREFIX}%`))).del();
  await db('payments').whereIn('customer_id', db('users').select('id').where('phone', 'like', `${PREFIX}%`)).del();
  await db('requests').whereIn('customer_id', db('users').select('id').where('phone', 'like', `${PREFIX}%`)).del();
  await db('message_log').where('phone', 'like', `${PREFIX}%`).del();
  await db('registration_fees').where('phone', 'like', `${PREFIX}%`).del();
  await db('users').where('phone', 'like', `${PREFIX}%`).del();
  await db('service_settings').where({ key: 'monthly_budget_tzs' }).update({ value: '0' });
}

const savedTracking = process.env.USAGE_TRACKING;
test.before(async () => {
  process.env.USAGE_TRACKING = 'on';
  await cleanup();
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
test.after(async () => {
  if (savedTracking === undefined) delete process.env.USAGE_TRACKING;
  else process.env.USAGE_TRACKING = savedTracking;
  await cleanup();
  await new Promise((r) => server.close(r));
  await db.destroy();
});

// ---------------------------------------------------------------- cost maths

test('cost maths: free allowance first, then the unit price; provider-reported cost; % of the money moved', () => {
  const fx = 2600;
  const places = { currency: 'USD', unit_price: 0.032, percent_fee: 0, free_units: 5000 };
  assert.equal(costs.lineCost(places, { units: 4000 }, fx), 0, 'inside the free allowance');
  assert.equal(costs.lineCost(places, { units: 6000 }, fx), Math.round(1000 * 0.032 * 2600), '1,000 calls above the allowance');
  // SMS: the provider told us the real cost, so our own price is not used for those SMS
  const smsPrice = { currency: 'TZS', unit_price: 25, percent_fee: 0, free_units: 0 };
  assert.equal(costs.lineCost(smsPrice, { units: 10, reported_units: 10, reported_cost_tzs: 180 }, fx), 180);
  assert.equal(costs.lineCost(smsPrice, { units: 10, reported_units: 4, reported_cost_tzs: 72 }, fx), 72 + 6 * 25, 'the rest uses our price');
  // Gateway: a % of the money
  assert.equal(costs.lineCost({ currency: 'TZS', unit_price: 0, percent_fee: 1.5, free_units: 0 }, { units: 3, amount_tzs: 1000000 }, fx), 15000);
  // Free service
  assert.equal(costs.lineCost({ currency: 'USD', unit_price: 0, percent_fee: 0, free_units: 0 }, { units: 999999 }, fx), 0);
});

test('forecast, free-allowance date and verdicts', () => {
  assert.equal(costs.project(1000, 5, 30), 6000);
  assert.equal(costs.project(10, 0, 30), 0);
  assert.equal(costs.freeRunsOutOnDay(5000, 1000, 5, 30), 25, '200 a day -> day 25');
  assert.equal(costs.freeRunsOutOnDay(5000, 100, 5, 30), null, 'will not run out this month');
  assert.equal(costs.freeRunsOutOnDay(0, 100, 5, 30), null, 'no allowance');
  const p = { free_units: 5000, unit_price: 0.032, percent_fee: 0 };
  assert.equal(costs.opVerdict(p, 2000, 0).level, 'ok');
  assert.equal(costs.opVerdict(p, 4000, 0).level, 'watch');
  assert.equal(costs.opVerdict(p, 6000, 83200).level, 'over');
  assert.equal(costs.opVerdict({ free_units: 0, unit_price: 0, percent_fee: 0 }, 5, 0).text, 'Free');
  assert.equal(costs.budgetVerdict(0, 5000, 0).level, 'ok');
  assert.equal(costs.budgetVerdict(100000, 70000, 20000).level, 'ok');
  assert.equal(costs.budgetVerdict(100000, 85000, 20000).level, 'watch');
  assert.equal(costs.budgetVerdict(100000, 130000, 20000).level, 'over');
  assert.equal(costs.budgetVerdict(100000, 130000, 100000).text, 'Budget already used up');
});

test('months follow Dar es Salaam time', () => {
  const r = costs.monthRange('2026-11');
  assert.equal(r.start.toISOString(), '2026-10-31T21:00:00.000Z');
  assert.equal(r.end.toISOString(), '2026-11-30T21:00:00.000Z');
  assert.equal(r.days, 30);
  assert.equal(costs.monthRange('2024-02').days, 29);
  assert.equal(costs.monthRange('nonsense').key, costs.monthRange(null).key);
  assert.equal(costs.elapsedDays(r, r.start.getTime() + 36 * 3600e3), 1.5);
});

test('SMS parts', () => {
  assert.equal(usage.smsParts('a'.repeat(160)), 1);
  assert.equal(usage.smsParts('a'.repeat(161)), 2);
  assert.equal(usage.smsParts('a'.repeat(306)), 2);
  assert.equal(usage.smsParts('a'.repeat(307)), 3);
  assert.equal(usage.smsParts('“quoted”'), 1);
  assert.equal(usage.smsParts('\u4f60'.repeat(70)), 1, 'a non-GSM character makes it Unicode: 70 per part');
  assert.equal(usage.smsParts('\u4f60'.repeat(71)), 2);
});

// ---------------------------------------------------------------- the report

test('report: priced from the usage rows, with the free allowance, SMS cost from the provider, and the money view', async () => {
  const row = (service, operation, day, extra = {}) => ({ service, operation, tag: 'TEST', created_at: at(day), ...extra });
  const rows = [];
  for (let i = 0; i < 6000; i++) rows.push(row('google_maps', 'places_text_search', 1 + (i % 10))); // 1,000 above the 5,000 free
  for (let i = 0; i < 40; i++) rows.push(row('google_maps', 'places_text_search', 2, { cached: true })); // cached: free, shown as saving
  for (let i = 0; i < 25; i++) rows.push(row('google_maps', 'places_text_search', 3, { ok: false })); // failed: not charged
  for (let i = 0; i < 10; i++) rows.push(row('africastalking', 'sms', 4, { reported_cost: 20, reported_currency: 'TZS' }));
  rows.push(row('selcom', 'collect', 5, { amount_tzs: 1000000 }));
  rows.push(row('selcom', 'collect', 6, { amount_tzs: 500000 }));
  for (let i = 0; i < rows.length; i += 1000) await db('service_usage').insert(rows.slice(i, i + 1000));

  const d = await report.build(TEST_MONTH);
  assert.equal(d.month, TEST_MONTH);
  assert.equal(d.is_current, false);
  assert.equal(d.days_in_month, 31);
  const svc = (k) => d.services.find((s) => s.service === k);
  const g = svc('google_maps').lines.find((l) => l.operation === 'places_text_search');
  assert.deepEqual([g.calls, g.units, g.cached, g.errors], [6065, 6000, 40, 25]);
  assert.equal(g.cost_tzs, Math.round(1000 * 0.032 * 2600));
  assert.equal(g.verdict.level, 'over');
  assert.equal(g.free_used_pct, 120);
  assert.equal(svc('google_maps').level, 'over');
  assert.ok(svc('google_maps').advice.length >= 2, 'tells the admin what to do');

  const a = svc('africastalking').lines[0];
  assert.deepEqual([a.units, a.cost_tzs], [10, 200], 'uses the cost Africa\'s Talking reported');
  const s = svc('selcom').lines.find((l) => l.operation === 'collect');
  assert.equal(s.cost_tzs, 22500, '1.5% of 1,500,000');

  assert.equal(d.totals.cost_tzs, g.cost_tzs + 200 + 22500);
  assert.equal(d.totals.projected_cost_tzs, d.totals.cost_tzs, 'a finished month is not forecast');
  assert.equal(d.daily.days.length, 31);
  const gDaily = d.daily.cost_by_service.google_maps;
  assert.equal(gDaily.reduce((n, v) => n + v, 0), g.cost_tzs, 'the daily costs add up to the month');
  assert.equal(gDaily.slice(0, 5).reduce((n, v) => n + v, 0) >= 0, true);
  assert.equal(d.months.length, 6);
  assert.equal(d.months.at(-1).month, TEST_MONTH);
  assert.equal(d.months.at(-1).cost_tzs, d.totals.cost_tzs);
});

// ---------------------------------------------------------------- admin endpoints

test('admin endpoints: admin only, edit a price, edit settings', async () => {
  const admin = await makeUser('Admin', `${PREFIX}00001`, 'superadmin');
  const cust = await makeUser('Cust', `${PREFIX}00002`);
  assert.equal((await api(null, 'GET', '/api/admin/services/usage')).status, 401);
  assert.equal((await api(cust, 'GET', '/api/admin/services/usage')).status, 403);

  const ok = await api(admin, 'GET', `/api/admin/services/usage?month=${TEST_MONTH}`);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.services.length >= 7);

  const before = await db('service_prices').where({ service: 'africastalking', operation: 'sms' }).first();
  try {
    assert.equal((await api(admin, 'PUT', '/api/admin/services/prices/africastalking/sms', { unit_price: -1 })).status, 400);
    assert.equal((await api(admin, 'PUT', '/api/admin/services/prices/africastalking/sms', { currency: 'EUR' })).status, 400);
    assert.equal((await api(admin, 'PUT', '/api/admin/services/prices/nope/sms', { unit_price: 1 })).status, 404);
    assert.equal((await api(admin, 'PUT', '/api/admin/services/prices/africastalking/sms', { unit_price: 18, free_units: 0 })).status, 200);
    const after = await db('service_prices').where({ service: 'africastalking', operation: 'sms' }).first();
    assert.equal(Number(after.unit_price), 18);
    assert.equal(after.verified, true, 'a price the admin typed is no longer a placeholder');

    assert.equal((await api(admin, 'PUT', '/api/admin/services/settings', { monthly_budget_tzs: 100000, usd_to_tzs: 2650 })).status, 200);
    assert.equal((await api(admin, 'PUT', '/api/admin/services/settings', { usd_to_tzs: 0 })).status, 400);
    const d = (await api(admin, 'GET', `/api/admin/services/usage?month=${TEST_MONTH}`)).body;
    assert.equal(d.settings.monthly_budget_tzs, 100000);
    assert.equal(d.settings.usd_to_tzs, 2650);
    assert.equal(d.totals.budget.level, 'over', 'the test month cost 105,900 TZS, more than the 100,000 budget');
  } finally {
    await db('service_prices').where({ service: 'africastalking', operation: 'sms' }).update({ unit_price: before.unit_price, verified: before.verified });
    await db('service_settings').where({ key: 'usd_to_tzs' }).update({ value: '2600' });
  }
});

test('apps report paid Google map loads; free native maps are not counted', async () => {
  const u = await makeUser('Mapper', `${PREFIX}00003`);
  const n = async () => Number((await db('service_usage').where({ service: 'google_maps', operation: 'map_load' }).whereNull('tag').count({ n: '*' }).first()).n);
  const start = await n();
  const t0 = new Date();
  assert.equal((await api(u, 'POST', '/api/usage/map-load', { paid: false })).status, 204);
  assert.equal((await api(u, 'POST', '/api/usage/map-load', { paid: true })).status, 204);
  assert.equal((await api(null, 'POST', '/api/usage/map-load', { paid: true })).status, 401);
  await until(async () => (await n()) === start + 1);
  assert.equal(await n(), start + 1);
  await db('service_usage').where({ service: 'google_maps', operation: 'map_load' }).whereNull('tag').where('created_at', '>=', t0).del();
});

// ---------------------------------------------------------------- Africa's Talking: usage and the "we paid you" message

test("SMS sent through Africa's Talking is counted with its parts, template and reported cost; a failure is counted but not charged", async () => {
  const u = await makeUser('Asha', `${PREFIX}00010`, 'customer', { language: 'en' });
  Object.assign(process.env, { MESSAGING_MODE: 'live', AT_USERNAME: 'sandbox', AT_API_KEY: 'k' });
  const last = () => db('service_usage').where({ service: 'africastalking' }).orderBy('id', 'desc').first();
  const before = Number((await db('service_usage').where({ service: 'africastalking' }).count({ n: '*' }).first()).n);

  fake(() => sms({ cost: 'TZS 22.0000' }));
  await messaging.deliver({ userId: u.id, phone: u.phone, lang: 'en', template: 'provider_arrived' });
  const row = await until(async () => { const r = await last(); return r && Number((await db('service_usage').where({ service: 'africastalking' }).count({ n: '*' }).first()).n) === before + 1 ? r : null; });
  assert.deepEqual([row.operation, row.units, row.ok, row.tag, Number(row.reported_cost), row.reported_currency], ['sms', 1, true, 'provider_arrived', 22, 'TZS']);

  fake(() => reply({ SMSMessageData: { Message: 'Invalid', Recipients: [{ statusCode: 403, status: 'InvalidSenderId' }] } }));
  await messaging.deliver({ userId: u.id, phone: u.phone, lang: 'en', template: 'provider_arrived' });
  const bad = await until(async () => { const r = await last(); return r && r.ok === false ? r : null; });
  assert.equal(bad.ok, false);
});

test('worker is paid by hand: the payout is marked sent and an SMS says so, with the job code, even if notifications are off', async () => {
  const admin = await makeUser('Admin2', `${PREFIX}00020`, 'superadmin');
  const worker = await makeUser('Fundi', `${PREFIX}00021`, 'customer', { notifications_enabled: false, language: 'en' });
  const cust = await makeUser('Cust', `${PREFIX}00022`);
  const service = await db('services').where({ slug: 'dobi' }).first('id');
  const [p] = await db('provider_profiles').insert({ user_id: worker.id, verification_status: 'verified', lat: -6.67, lng: 39.22, payout_network: 'mpesa', payout_number: '712345678' }).returning('*');
  const [r] = await db('requests').insert({ customer_id: cust.id, service_id: service.id, provider_id: p.id, status: 'completed', lat: -6.67, lng: 39.22, agreed_price: 20000, fee_percent: 13, fee_due: 2600, payout_due: 17400, accepted_at: db.fn.now(), completed_at: db.fn.now(), customer_confirmed_at: db.fn.now() }).returning('*');
  const [pay] = await db('payments').insert({ request_id: r.id, service_id: service.id, customer_id: cust.id, provider_id: p.id, amount: 20000, fee_percent: 13, fee: 2600, payout: 17400, status: 'paid', paid_at: db.fn.now(), reference: 'X1' }).returning('*');
  const [po] = await db('payouts').insert({ payment_id: pay.id, provider_id: p.id, amount: 17400, status: 'failed', failure: 'NOT_BUILT' }).returning('*');

  Object.assign(process.env, { MESSAGING_MODE: 'live', AT_USERNAME: 'sandbox', AT_API_KEY: 'k' });
  fake(() => sms());

  assert.equal((await api(admin, 'POST', `/api/admin/payouts/${po.id}/mark-sent`, {})).status, 400, 'needs the transaction ID');
  const res = await api(admin, 'POST', `/api/admin/payouts/${po.id}/mark-sent`, { reference: 'MP261104.1234.A56789' });
  assert.equal(res.status, 200);
  assert.equal(res.body.payout.status, 'sent');
  assert.equal(res.body.payout.reference, 'MANUAL-MP261104.1234.A56789');

  const log = await until(() => db('message_log').where({ user_id: worker.id, template: 'payment_received' }).first());
  assert.ok(log, 'the SMS was logged');
  assert.deepEqual([log.channel, log.status], ['sms', 'sent']);
  const sent = new URLSearchParams(calls[0].body);
  assert.equal(calls[0].url, 'https://api.sandbox.africastalking.com/version1/messaging');
  assert.equal(sent.get('to'), `+${worker.phone}`);
  assert.equal(sent.get('message'), `NiJibu: We paid you TZS 17,400 for job ${r.code || `NJ-${String(r.id).padStart(6, '0')}`}. Check your payout number.`);
  assert.equal(await db('notifications').where({ user_id: worker.id, type: 'payment_received' }).first().then(Boolean), true);

  // a second tap does not pay or message twice
  assert.equal((await api(admin, 'POST', `/api/admin/payouts/${po.id}/mark-sent`, { reference: 'AGAIN123' })).status, 409);
  assert.equal(calls.length, 1);
});

// ---------------------------------------------------------------- admin: one person, what they did and earned

test('admin user profile: jobs done per job type, places, and money through NiJibu (total and per job)', async () => {
  const admin = await makeUser('Admin3', `${PREFIX}00030`, 'superadmin');
  const worker = await makeUser('Fundi Two', `${PREFIX}00031`);
  const cust = await makeUser('Cust Two', `${PREFIX}00032`);
  const dobi = await db('services').where({ slug: 'dobi' }).first('id');
  const other = await db('services').whereNot({ id: dobi.id }).first('id', 'name_en');
  const [p] = await db('provider_profiles').insert({ user_id: worker.id, verification_status: 'verified', lat: -6.67, lng: 39.22, payout_network: 'mpesa', payout_number: '712345678' }).returning('*');
  await db('registration_fees').insert({ phone: worker.phone, pay_phone: worker.phone, amount: 1000, status: 'paid', paid_at: db.fn.now() });

  const job = async (service, address, price, fee, status = 'completed') => {
    const [r] = await db('requests').insert({ customer_id: cust.id, service_id: service.id, provider_id: p.id, status, lat: -6.67, lng: 39.22, address, agreed_price: price, fee_percent: 13, fee_due: fee, payout_due: price - fee, accepted_at: db.fn.now(), completed_at: status === 'completed' ? db.fn.now() : null, customer_confirmed_at: status === 'completed' ? db.fn.now() : null, ...(status === 'cancelled' ? { cancelled_by: 'provider', cancelled_at: db.fn.now() } : {}) }).returning('*');
    if (status === 'completed') await db('payments').insert({ request_id: r.id, service_id: service.id, customer_id: cust.id, provider_id: p.id, amount: price, fee_percent: 13, fee, payout: price - fee, status: 'paid', paid_at: db.fn.now() });
    return r;
  };
  await job(dobi, 'Mbezi Beach', 20000, 2600);
  await job(dobi, 'Mbezi Beach', 30000, 3900);
  await job(dobi, 'Kunduchi', 15000, 1950);
  await job(other, 'Tegeta', 40000, 5200);
  await job(other, 'Tegeta', 25000, 3250, 'cancelled');

  const res = await api(admin, 'GET', `/api/admin/people/${worker.id}`);
  assert.equal(res.status, 200);
  const pr = res.body.as_provider;
  assert.deepEqual([pr.stats.completed, pr.stats.cancelled], [4, 1]);
  assert.deepEqual([pr.stats.gross, pr.stats.commission, pr.stats.earned, pr.stats.paid_jobs], [105000, 13650, 91350, 4], 'total through NiJibu');
  assert.equal(pr.stats.avg_per_job, Math.round(91350 / 4));
  const d = pr.by_job.find((j) => j.id === dobi.id);
  assert.deepEqual([d.done, d.gross, d.commission, d.earned, d.avg_price], [3, 65000, 8450, 56550, 21667], 'one job type');
  const o = pr.by_job.find((j) => j.id === other.id);
  assert.deepEqual([o.done, o.cancelled, o.earned], [1, 1, 34800]);
  assert.equal(pr.by_job[0].earned, 56550, 'biggest earner first');
  assert.equal(pr.places[0].place, 'Mbezi Beach');
  assert.equal(pr.places[0].jobs, 2);
  assert.equal(pr.places[1].place === 'Tegeta' || pr.places[1].place === 'Kunduchi', true);
  assert.deepEqual([pr.registration_fees.tries, pr.registration_fees.paid], [1, 1000]);
  assert.equal(pr.recent_jobs.length, 5);

  const c = (await api(admin, 'GET', `/api/admin/people/${cust.id}`)).body.as_customer;
  assert.equal(c.stats.spent, 105000);
  assert.equal(c.spent_by_job[0].spent, 65000);
});
