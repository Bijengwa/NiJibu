// End-to-end: request -> offers -> accept -> on the way (live location) -> arrived -> start -> complete.
// Needs the local Postgres from .env with migrations + seeds applied. Run: npm test
require('dotenv').config();
process.env.ARRIVE_MAX_KM = '0.5'; // test the arrival check for real

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { io: connect } = require('socket.io-client');
const db = require('../src/db');
const app = require('../src/app');
const realtime = require('../src/lib/realtime');
const dispatch = require('../src/services/dispatch');
const { signToken } = require('../src/lib/token');

const CUSTOMER = { lat: -6.67, lng: 39.22 };
// ~0.55 km per 0.005 degrees of latitude
const at = (km) => ({ lat: CUSTOMER.lat + km / 111, lng: CUSTOMER.lng });

let server, base;
const sockets = [];
const users = {}; // name -> { id, token, provider_id }

async function makeUser(name, phone) {
  const [u] = await db('users')
    .insert({ phone, name, password_hash: 'x', phone_verified_at: db.fn.now() })
    .returning('*');
  users[name] = { id: u.id, token: signToken(u) };
  return users[name];
}

async function makeProvider(name, phone, km, { online = true, verified = true, serviceIds } = {}) {
  const u = await makeUser(name, phone);
  const services = serviceIds || [await serviceId('dobi')];
  const [p] = await db('provider_profiles')
    .insert({
      user_id: u.id,
      verification_status: verified ? 'verified' : 'pending',
      is_online: online,
      ...at(km),
      last_seen: db.fn.now(),
    })
    .returning('*');
  await db('provider_services').insert(services.map((service_id) => ({ provider_id: p.id, service_id })));
  u.provider_id = p.id;
  return u;
}

const serviceId = async (slug) => (await db('services').where({ slug }).first('id')).id;

async function api(user, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function listen(user) {
  const s = connect(base, { auth: { token: user.token }, transports: ['websocket'] });
  s.events = [];
  s.onAny((event, payload) => s.events.push({ event, payload }));
  sockets.push(s);
  return new Promise((resolve, reject) => {
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(socket, event, pred = () => true, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = socket.events.find((e) => e.event === event && pred(e.payload));
    if (hit) return hit.payload;
    await sleep(25);
  }
  throw new Error(`timeout waiting for ${event}; got: ${socket.events.map((e) => e.event).join(',')}`);
}
const got = (socket, event) => socket.events.filter((e) => e.event === event);

async function cleanup() {
  await db('requests').whereIn('customer_id', db('users').select('id').where('phone', 'like', '2557999%')).del();
  await db('users').where('phone', 'like', '2557999%').del();
}

test.before(async () => {
  await cleanup();
  server = http.createServer(app);
  realtime.init(server);
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

test.after(async () => {
  sockets.forEach((s) => s.close());
  await cleanup();
  await new Promise((r) => server.close(r));
  await db.destroy();
});

test('full job: offers go to the nearest 3, one wins, live tracking, all stages', async () => {
  const customer = await makeUser('customer', '255799900001');
  const p1 = await makeProvider('p1', '255799900011', 0.5);
  const p2 = await makeProvider('p2', '255799900012', 1.0);
  const p3 = await makeProvider('p3', '255799900013', 1.5);
  const p4 = await makeProvider('p4', '255799900014', 2.5);
  const far = await makeProvider('far', '255799900015', 8); // only in the 10 km ring
  await makeProvider('offline', '255799900016', 0.3, { online: false });
  await makeProvider('pending', '255799900017', 0.2, { verified: false });
  await makeProvider('wrongService', '255799900018', 0.2, { serviceIds: [await serviceId('fundi-bomba')] });

  const [sc, s1, s2, s3, s4] = await Promise.all([customer, p1, p2, p3, p4].map(listen));
  const dobi = await serviceId('dobi');

  // availability counts only the right providers and writes a search log
  const av = await api(customer, 'GET', `/api/services/${dobi}/availability?lat=${CUSTOMER.lat}&lng=${CUSTOMER.lng}`);
  assert.equal(av.status, 200);
  assert.equal(av.body.providers_nearby, 5); // p1..p4 + far (online, verified, right service)
  assert.equal(av.body.nearest_km, 0.5);
  assert.equal(av.body.pins.length, 5);
  assert.ok(av.body.pins.every((p) => Object.keys(p).sort().join() === 'id,lat,lng'), 'pins carry no identity');
  assert.ok(av.body.nearest_eta_min >= 1);

  // request -> offers to the nearest 3 only
  const created = await api(customer, 'POST', '/api/requests', { service_id: dobi, ...CUSTOMER, address: 'Mtongani' });
  assert.equal(created.status, 201);
  assert.equal(created.body.request.status, 'searching');
  const rid = created.body.request.id;

  const o1 = await waitFor(s1, 'offer:new');
  const o2 = await waitFor(s2, 'offer:new');
  const o3 = await waitFor(s3, 'offer:new');
  await sleep(150);
  assert.equal(got(s4, 'offer:new').length, 0, '4th nearest must not be offered yet');
  assert.equal(o1.distance_km, 0.5);
  assert.equal(o1.address, 'Mtongani');
  assert.equal(o1.phone, undefined, 'offers must not leak customer phone');
  assert.equal(o1.lat, undefined, 'offers must not leak exact location');

  // a second open request is blocked
  const dup = await api(customer, 'POST', '/api/requests', { service_id: dobi, ...CUSTOMER });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'ALREADY_OPEN');

  // p1 and p2 accept at the same moment: exactly one wins
  const [a1, a2] = await Promise.all([
    api(p1, 'POST', `/api/offers/${o1.offer_id}/accept`),
    api(p2, 'POST', `/api/offers/${o2.offer_id}/accept`),
  ]);
  const statuses = [a1.status, a2.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const winner = a1.status === 200 ? p1 : p2;
  const winnerSock = a1.status === 200 ? s1 : s2;
  const loser = a1.status === 200 ? a2 : a1;
  assert.equal(loser.body.code, 'ALREADY_TAKEN');
  await waitFor(s3, 'offer:closed', (p) => p.reason === 'taken');

  // customer is told, and sees the provider (phone only after accept)
  await waitFor(sc, 'request:status', (p) => p.status === 'accepted');
  let view = (await api(customer, 'GET', `/api/requests/${rid}`)).body.request;
  assert.equal(view.status, 'accepted');
  assert.equal(view.provider.name, winner === p1 ? 'p1' : 'p2');
  assert.ok(view.provider.phone);
  assert.ok(view.provider.eta_min >= 1);

  // privacy: a stranger cannot read it, cannot join the room, cannot move it
  const stranger = await makeUser('stranger', '255799900099');
  assert.equal((await api(stranger, 'GET', `/api/requests/${rid}`)).status, 404);
  const ss = await listen(stranger);
  const joined = await new Promise((r) => ss.emit('request:join', rid, r));
  assert.equal(joined.ok, false);
  assert.equal((await api(p3, 'POST', `/api/requests/${rid}/on-the-way`)).status, 404);
  assert.equal((await api(customer, 'POST', `/api/requests/${rid}/on-the-way`)).status, 403);

  // wrong order is refused
  assert.equal((await api(winner, 'POST', `/api/requests/${rid}/arrived`)).body.code, 'BAD_STATE');
  assert.equal((await api(winner, 'POST', `/api/requests/${rid}/complete`)).body.code, 'BAD_STATE');

  // on the way + live location reaches the customer, not the stranger
  const joinedC = await new Promise((r) => sc.emit('request:join', rid, r));
  const joinedP = await new Promise((r) => winnerSock.emit('request:join', rid, r));
  assert.ok(joinedC.ok && joinedP.ok);
  assert.equal((await api(winner, 'POST', `/api/requests/${rid}/on-the-way`)).status, 200);
  await waitFor(sc, 'request:status', (p) => p.status === 'on_the_way');
  const pos = at(0.4);
  winnerSock.emit('provider:location', { request_id: rid, ...pos });
  const live = await waitFor(sc, 'provider:location');
  assert.equal(live.lat, pos.lat);
  assert.equal(got(ss, 'provider:location').length, 0);
  // someone else cannot fake the location
  s3.emit('provider:location', { request_id: rid, lat: 0, lng: 0 });
  await sleep(150);
  assert.equal(got(sc, 'provider:location').length, 1);

  // arrival check: too far -> refused; then really close -> ok
  await db('provider_profiles').where({ id: winner.provider_id }).update({ ...at(3) });
  assert.equal((await api(winner, 'POST', `/api/requests/${rid}/arrived`)).body.code, 'TOO_FAR');
  winnerSock.emit('provider:location', { request_id: rid, ...at(0.1) });
  await sleep(150);
  assert.equal((await api(winner, 'POST', `/api/requests/${rid}/arrived`)).status, 200);

  // after arrival the live position is no longer shared with the customer
  view = (await api(customer, 'GET', `/api/requests/${rid}`)).body.request;
  assert.equal(view.status, 'arrived');
  assert.equal(view.provider.lat, null);

  // the fundi must set the price BEFORE the work starts
  assert.equal((await api(winner, 'POST', `/api/requests/${rid}/start`)).body.code, 'PRICE_REQUIRED');
  assert.equal((await api(winner, 'POST', `/api/requests/${rid}/start`, { price: 50 })).body.code, 'PRICE_REQUIRED');
  assert.equal((await api(winner, 'POST', `/api/requests/${rid}/start`, { price: 20000 })).status, 200);
  assert.equal((await api(customer, 'GET', `/api/requests/${rid}`)).body.request.agreed_price, 20000, 'the customer sees the price');
  assert.equal((await api(customer, 'POST', `/api/requests/${rid}/cancel`)).body.code, 'BAD_STATE'); // too late to cancel
  await db('provider_profiles').where({ id: winner.provider_id }).update({ payout_network: 'mpesa', payout_number: '712345678' });
  assert.equal((await api(winner, 'POST', `/api/requests/${rid}/complete`)).status, 200);
  view = (await api(customer, 'GET', `/api/requests/${rid}`)).body.request;
  assert.equal(view.status, 'completed');
  assert.equal(view.agreed_price, 20000);

  // no "pay later": a new request is refused until the finished job is paid
  assert.equal((await api(customer, 'POST', '/api/requests', { service_id: dobi, ...CUSTOMER })).body.code, 'PAYMENT_DUE');
  assert.equal((await api(customer, 'GET', '/api/requests/open')).body.request.id, rid, 'the unpaid job stays open');

  // the customer must confirm the work before paying
  assert.equal((await api(customer, 'POST', `/api/requests/${rid}/pay`, { network: 'mpesa', phone: '0712345678' })).body.code, 'NOT_CONFIRMED');
  assert.equal((await api(winner, 'POST', `/api/requests/${rid}/confirm`)).status, 404, 'the fundi cannot confirm for the customer');
  assert.equal((await api(customer, 'POST', `/api/requests/${rid}/confirm`)).status, 200);
  assert.ok((await api(customer, 'GET', `/api/requests/${rid}`)).body.request.customer_confirmed_at);

  // payment: customer pays in the app, NiJibu keeps 10 %, the fundi gets 90 %
  assert.equal((await api(customer, 'POST', `/api/requests/${rid}/pay`, { network: 'bank', phone: '0712345678' })).status, 400);
  assert.equal((await api(customer, 'POST', `/api/requests/${rid}/pay`, { network: 'mpesa', phone: '12' })).status, 400);
  assert.equal((await api(stranger, 'POST', `/api/requests/${rid}/pay`, { network: 'mpesa', phone: '0712345678' })).status, 404);
  assert.equal((await api(winner, 'POST', `/api/requests/${rid}/pay`, { network: 'mpesa', phone: '0712345678' })).status, 404, 'the fundi cannot pay');
  const failed = await api(customer, 'POST', `/api/requests/${rid}/pay`, { network: 'mpesa', phone: '0712340000' });
  assert.equal(failed.status, 402);
  assert.equal(failed.body.code, 'PAYMENT_FAILED');
  const failedRow = await db('payments').where({ request_id: rid }).first();
  assert.equal(failedRow.status, 'failed');
  assert.equal((await db('payouts').where({ payment_id: failedRow.id }).first()), undefined, 'no payout for a failed payment');
  const paid = await api(customer, 'POST', `/api/requests/${rid}/pay`, { network: 'mpesa', phone: '0712345678' });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.request.payment.status, 'paid');
  assert.equal((await api(customer, 'POST', `/api/requests/${rid}/pay`, { network: 'mpesa', phone: '0712345678' })).body.code, 'ALREADY_PAID');
  const money = (await api(winner, 'GET', `/api/requests/${rid}`)).body.request.payment;
  assert.deepEqual([money.amount, money.fee, money.payout, money.payout_status], [20000, 2000, 18000, 'sent']);
  assert.equal(money.fee + money.payout, money.amount);

  // the fundi confirms he received it, or complains to the admin
  assert.equal((await api(customer, 'POST', `/api/provider/payments/${rid}/received`)).status, 403);
  assert.equal((await api(winner, 'POST', `/api/provider/payments/${rid}/complaint`, { note: 'x' })).status, 400);
  assert.equal((await api(winner, 'POST', `/api/provider/payments/${rid}/complaint`, { note: 'Money did not reach my phone' })).status, 200);
  assert.equal((await api(winner, 'POST', `/api/provider/payments/${rid}/complaint`, { note: 'Money did not reach my phone' })).body.code, 'COMPLAINT_OPEN');
  const admin2 = await makeUser('boss2', '255799900061');
  await db('users').where({ id: admin2.id }).update({ role: 'admin' });
  const open = (await api(admin2, 'GET', '/api/admin/complaints')).body.items;
  assert.equal(open.length, 1);
  assert.equal(open[0].complaint, 'Money did not reach my phone');
  assert.equal((await api(winner, 'GET', '/api/admin/complaints')).status, 403);
  assert.equal((await api(admin2, 'POST', `/api/admin/complaints/${open[0].payout_id}/resolve`, { note: 'Sent again' })).status, 200);
  assert.equal((await api(admin2, 'GET', '/api/admin/complaints')).body.items.length, 0);
  assert.equal((await api(winner, 'GET', `/api/requests/${rid}`)).body.request.payment.complaint_status, 'resolved');
  assert.equal((await api(winner, 'POST', `/api/provider/payments/${rid}/received`)).status, 200);
  assert.ok((await api(winner, 'GET', `/api/requests/${rid}`)).body.request.payment.received_at);
  const jobs = (await api(winner, 'GET', '/api/provider/jobs')).body;
  assert.equal(jobs.totals.received, 18000);
  assert.equal(jobs.totals.waiting_customer, 0);
  assert.equal(jobs.items[0].price, 20000);

  // a payout that fails stays visible for the admin to retry
  const poId = (await db('payouts').where({ payment_id: failedRow.id }).first('id')).id;
  await db('payouts').where({ id: poId }).update({ status: 'failed', failure: 'DECLINED' });
  const boss = await makeUser('boss', '255799900060');
  await db('users').where({ id: boss.id }).update({ role: 'admin' });
  const retried = await api(boss, 'POST', `/api/admin/payouts/${poId}/retry`);
  assert.equal(retried.body.payout.status, 'sent');
  for (const k of ['accepted_at', 'on_the_way_at', 'arrived_at', 'started_at', 'completed_at']) assert.ok(view[k], k);

  // the winner is free again and customer can ask again
  const again = await api(customer, 'POST', '/api/requests', { service_id: dobi, ...CUSTOMER });
  assert.equal(again.status, 201);
  await api(customer, 'POST', `/api/requests/${again.body.request.id}/cancel`);
});

test('declines move to the next batch; widening radius; give up', async () => {
  await cleanup();
  const customer = await makeUser('customer', '255799900001');
  const dobi = await serviceId('dobi');
  const a = await makeProvider('a', '255799900021', 1);
  const b = await makeProvider('b', '255799900022', 2);
  const c = await makeProvider('c', '255799900023', 2.5);
  const d = await makeProvider('d', '255799900024', 2.8);
  const [sa, sb, sc_, sd] = await Promise.all([a, b, c, d].map(listen));

  const created = await api(customer, 'POST', '/api/requests', { service_id: dobi, ...CUSTOMER });
  const rid = created.body.request.id;
  const oa = await waitFor(sa, 'offer:new');
  const ob = await waitFor(sb, 'offer:new');
  const oc = await waitFor(sc_, 'offer:new');
  assert.equal(got(sd, 'offer:new').length, 0);

  // provider can list their open offers after reconnecting
  const list = await api(a, 'GET', '/api/provider/offers');
  assert.equal(list.body.items.length, 1);

  // someone else cannot answer my offer
  assert.equal((await api(b, 'POST', `/api/offers/${oa.offer_id}/decline`)).status, 404);

  await api(a, 'POST', `/api/offers/${oa.offer_id}/decline`);
  await api(b, 'POST', `/api/offers/${ob.offer_id}/decline`);
  assert.equal(got(sd, 'offer:new').length, 0, 'c still has a live offer');
  await api(c, 'POST', `/api/offers/${oc.offer_id}/decline`);
  await waitFor(sd, 'offer:new'); // all answered -> next batch right away

  // d lets the offer run out -> tick expires it -> nobody left in 3 km -> widen -> nobody -> give up
  await db('request_offers').where({ request_id: rid }).update({ expires_at: new Date(Date.now() - 1000) });
  await dispatch.tick();
  await waitFor(sd, 'offer:closed', (p) => p.reason === 'expired');
  // d did not answer: d is asked one more time (same offer, new time), then nobody is left
  await dispatch.tick();
  assert.equal(got(sd, 'offer:new').length, 2, 'd is asked a second time');
  await db('request_offers').where({ request_id: rid, status: 'sent' }).update({ expires_at: new Date(Date.now() - 1000) });
  await dispatch.tick();
  await dispatch.tick();
  const final = (await api(customer, 'GET', `/api/requests/${rid}`)).body.request;
  assert.equal(final.status, 'no_provider');
  assert.equal((await api(d, 'POST', `/api/offers/${oc.offer_id}/accept`)).status, 404); // not theirs
});

test('radius widens to find a farther provider', async () => {
  await cleanup();
  const customer = await makeUser('customer', '255799900001');
  const dobi = await serviceId('dobi');
  const p = await makeProvider('p', '255799900031', 4.2); // outside 3 km, inside 5 km
  const sp = await listen(p);

  const created = await api(customer, 'POST', '/api/requests', { service_id: dobi, ...CUSTOMER });
  const rid = created.body.request.id;
  // nobody within 3 km, so the search widens to 5 km in the same step and finds p
  const o = await waitFor(sp, 'offer:new');
  assert.equal((await api(p, 'POST', `/api/offers/${o.offer_id}/accept`)).status, 200);
  assert.equal((await db('requests').where({ id: rid }).first()).search_radius_km, 5);
});

test('cancel by customer closes offers; provider cancel; busy provider rules', async () => {
  await cleanup();
  const customer = await makeUser('customer', '255799900001');
  const customer2 = await makeUser('customer2', '255799900002');
  const dobi = await serviceId('dobi');
  const p = await makeProvider('p', '255799900041', 1);
  const sp = await listen(p);

  const r1 = (await api(customer, 'POST', '/api/requests', { service_id: dobi, ...CUSTOMER })).body.request.id;
  const o1 = await waitFor(sp, 'offer:new');
  await api(customer, 'POST', `/api/requests/${r1}/cancel`, { reason: 'changed my mind' });
  await waitFor(sp, 'offer:closed', (x) => x.reason === 'cancelled');
  assert.equal((await api(p, 'POST', `/api/offers/${o1.offer_id}/accept`)).body.code, 'OFFER_EXPIRED');

  // provider accepts one job, then is not offered / cannot take a second
  const r2 = (await api(customer, 'POST', '/api/requests', { service_id: dobi, ...CUSTOMER })).body.request.id;
  const o2 = await waitFor(sp, 'offer:new', (x) => x.request_id === r2);
  assert.equal((await api(p, 'POST', `/api/offers/${o2.offer_id}/accept`)).status, 200);
  const r3 = (await api(customer2, 'POST', '/api/requests', { service_id: dobi, ...CUSTOMER })).body.request.id;
  await sleep(150);
  assert.equal(got(sp, 'offer:new').filter((e) => e.payload.request_id === r3).length, 0, 'busy provider gets no offers');

  // provider cancels: customer is told, provider is free
  assert.equal((await api(p, 'POST', `/api/requests/${r2}/cancel`)).status, 200);
  const v = (await api(customer, 'GET', `/api/requests/${r2}`)).body.request;
  assert.equal(v.status, 'cancelled');
  assert.equal(v.cancelled_by, 'provider');
  assert.equal(v.provider, null);
  const notes = await db('notifications').where({ user_id: customer.id, type: 'request_cancelled' });
  assert.equal(notes.length, 1);
  await api(customer2, 'POST', `/api/requests/${r3}/cancel`);
});

test('provider onboarding, admin approval, security', async () => {
  await cleanup();
  const dobi = await serviceId('dobi');
  const person = await makeUser('person', '255799900051');
  const admin = await makeUser('admin', '255799900052');
  await db('users').where({ id: admin.id }).update({ role: 'admin' });
  const nameless = await makeUser('nameless', '255799900053');
  await db('users').where({ id: nameless.id }).update({ name: null });

  // no token, bad token
  assert.equal((await api(null, 'GET', '/api/services')).status, 401);
  await assert.rejects(() => listen({ token: 'nope' }));

  // can't be a provider without a profile name, or with a made-up service
  assert.equal((await api(nameless, 'POST', '/api/provider/apply', { service_ids: [dobi] })).body.code, 'PROFILE_INCOMPLETE');
  assert.equal((await api(person, 'POST', '/api/provider/apply', { service_ids: [999999] })).status, 400);
  assert.equal((await api(person, 'POST', '/api/provider/apply', { service_ids: [] })).status, 400);

  // apply -> pending -> cannot go online
  const ap = await api(person, 'POST', '/api/provider/apply', { service_ids: [dobi] });
  assert.equal(ap.status, 201);
  assert.equal(ap.body.verification_status, 'pending');
  assert.equal((await api(person, 'POST', '/api/provider/online', { ...CUSTOMER })).body.code, 'NOT_VERIFIED');
  // the app cannot approve itself
  const pid = (await db('provider_profiles').where({ user_id: person.id }).first()).id;
  assert.equal((await api(person, 'POST', `/api/admin/providers/${pid}/verify`)).status, 403);

  // admin approves -> can go online, location required
  assert.equal((await api(admin, 'POST', `/api/admin/providers/${pid}/verify`)).status, 200);
  assert.equal((await api(person, 'POST', '/api/provider/online', {})).status, 400);
  assert.equal((await api(person, 'POST', '/api/provider/online', { lat: 999, lng: 0 })).status, 400);
  assert.equal((await api(person, 'POST', '/api/provider/online', { ...CUSTOMER })).status, 200);
  const me = (await api(person, 'GET', '/api/provider/me')).body.provider;
  assert.equal(me.is_online, true);
  assert.equal(me.verification_status, 'verified');

  // the same person can also be a customer
  const other = await makeProvider('other', '255799900054', 1);
  const own = await api(person, 'POST', '/api/requests', { service_id: dobi, ...CUSTOMER });
  assert.equal(own.status, 201);
  const o = await db('request_offers').where({ request_id: own.body.request.id });
  assert.equal(o.length, 1);
  assert.equal(o[0].provider_id, other.provider_id, 'a provider is never offered their own request');
  await api(person, 'POST', `/api/requests/${own.body.request.id}/cancel`);

  // heartbeat silence -> offline by the clock
  await db('provider_profiles').where({ id: pid }).update({ last_seen: new Date(Date.now() - 10 * 60 * 1000) });
  await dispatch.tick();
  assert.equal((await api(person, 'GET', '/api/provider/me')).body.provider.is_online, false);

  // admin gap report: a search with nobody near is counted
  await api(person, 'GET', `/api/services/${await serviceId('fundi-umeme')}/availability?lat=-1&lng=30`);
  const gaps = await api(admin, 'GET', '/api/admin/search-gaps');
  assert.equal(gaps.status, 200);
  assert.ok(gaps.body.items.some((g) => g.name_en === 'Electrician' && g.searches_without_provider >= 1));
  assert.equal((await api(person, 'GET', '/api/admin/search-gaps')).status, 403);

  // bad input
  assert.equal((await api(person, 'POST', '/api/requests', { service_id: 'x', lat: 1, lng: 1 })).status, 400);
  assert.equal((await api(person, 'GET', '/api/requests/abc')).status, 400);
});
