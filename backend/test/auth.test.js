// Terms and Conditions agreement, forgot / reset password, and the safety of the codes.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const db = require('../src/db');
const app = require('../src/app');
const { hashCode } = require('../src/services/otp');
const { VERSION } = require('../src/lib/terms');
const { signToken } = require('../src/lib/token');

const P1 = '799910001'; // registers
const P2 = '799910002'; // verified account that forgets the password
let server, base;

const cleanup = () => db('users').whereIn('phone', [`255${P1}`, `255${P2}`]).del();
async function api(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
// The real code is only in the SMS. The test writes a known code the same way the server does.
async function setCode(table, userId, code) {
  await db(table).insert({ user_id: userId, code_hash: hashCode(userId, code, table), attempts: 0, expires_at: new Date(Date.now() + 600000), last_sent_at: new Date(0) })
    .onConflict('user_id').merge();
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

test('the terms are public, in both languages, with a version', async () => {
  const r = await api('GET', '/api/auth/terms');
  assert.equal(r.status, 200);
  assert.equal(r.body.version, VERSION);
  assert.ok(r.body.en.sections.length > 3 && r.body.sw.sections.length === r.body.en.sections.length);
});

test('sign-up needs the agreement, and the agreement is saved', async () => {
  const no = await api('POST', '/api/auth/register', { phone: P1, password: 'secret123' });
  assert.equal(no.body.code, 'TERMS_REQUIRED');
  assert.equal((await api('POST', '/api/auth/register', { phone: P1, password: 'secret123', accept_terms: 'yes' })).body.code, 'TERMS_REQUIRED');
  const ok = await api('POST', '/api/auth/register', { phone: P1, password: 'secret123', accept_terms: true });
  assert.equal(ok.status, 201);
  const row = await db('users').where({ phone: `255${P1}` }).first();
  assert.equal(row.terms_version, VERSION);
  assert.ok(row.terms_accepted_at);
});

test('an older account is asked to agree, and agreeing needs the current version', async () => {
  const [u] = await db('users').insert({ phone: `255${P2}`, name: 'Old Account', password_hash: await require('bcryptjs').hash('oldpass123', 4), phone_verified_at: db.fn.now() }).returning('*');
  const token = signToken(u);
  assert.equal((await api('GET', '/api/auth/me', null, token)).body.user.terms_ok, false);
  assert.equal((await api('POST', '/api/me/terms', { version: 'old' }, token)).body.code, 'TERMS_CHANGED');
  const r = await api('POST', '/api/me/terms', { version: VERSION }, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.terms_ok, true);
});

test('forgot password: same answer for any phone, the code resets the password, all devices are logged out', async () => {
  const u = await db('users').where({ phone: `255${P2}` }).first();
  const old = signToken(u);

  // an unknown phone and a known phone look the same
  const unknown = await api('POST', '/api/auth/forgot', { phone: '799910099' });
  const known = await api('POST', '/api/auth/forgot', { phone: P2 });
  assert.equal(unknown.status, 200); assert.equal(known.status, 200);
  assert.equal(unknown.body.ok, true); assert.equal(known.body.ok, true);
  assert.ok(await db('password_resets').where({ user_id: u.id }).first()); // a code was made only for the real account

  await setCode('password_resets', u.id, '123456');
  assert.equal((await api('POST', '/api/auth/reset', { phone: P2, code: '000000', password: 'newpass123' })).body.code, 'CODE_INVALID');
  assert.equal((await api('POST', '/api/auth/reset', { phone: P2, code: '123456', password: 'short' })).status, 400);
  assert.equal((await api('POST', '/api/auth/reset', { phone: P2, code: '123456', password: 'newpass123' })).status, 200);
  assert.equal((await api('POST', '/api/auth/reset', { phone: P2, code: '123456', password: 'another123' })).body.code, 'CODE_INVALID'); // a code works once

  assert.equal((await api('POST', '/api/auth/login', { phone: P2, password: 'oldpass123' })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { phone: P2, password: 'newpass123' })).status, 200);
  assert.equal((await api('GET', '/api/auth/me', null, old)).status, 401); // the old session is closed
});

test('a reset code cannot log in, and a sign-up code cannot reset a password', async () => {
  const u = await db('users').where({ phone: `255${P2}` }).first();
  await setCode('password_resets', u.id, '654321');
  assert.equal((await api('POST', '/api/auth/verify', { phone: P2, code: '654321' })).status, 400); // verified accounts log in with the password
  await db('phone_verifications').insert({ user_id: u.id, code_hash: hashCode(u.id, '111111'), attempts: 0, expires_at: new Date(Date.now() + 600000), last_sent_at: new Date(0) }).onConflict('user_id').merge();
  assert.equal((await api('POST', '/api/auth/reset', { phone: P2, code: '111111', password: 'hack12345' })).body.code, 'CODE_INVALID');
  // an account that never verified its phone cannot reset
  const nv = await db('users').where({ phone: `255${P1}` }).first();
  await setCode('password_resets', nv.id, '222222');
  assert.equal((await api('POST', '/api/auth/reset', { phone: P1, code: '222222', password: 'hack12345' })).body.code, 'CODE_INVALID');
});
