const crypto = require('crypto');
const db = require('../db');

const TTL_MS = 10 * 60 * 1000; // code valid for 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const hashCode = (userId, code) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${userId}:${code}`).digest('hex');

// For now the code is printed in the backend terminal.
// TODO: send through an SMS provider (e.g. Africa's Talking) when OTP_DELIVERY=sms.
async function deliver(phone, code) {
  if (process.env.OTP_DELIVERY === 'sms') throw new Error('SMS delivery is not configured yet');
  console.log(`\n[OTP] +${phone}  code: ${code}  (valid 10 min)\n`);
}

// Creates (or replaces) the code for a user and delivers it.
// Returns { sent: true } or { sent: false, retryAfter } when asked again too soon.
async function issueCode(user) {
  const existing = await db('phone_verifications').where({ user_id: user.id }).first();
  if (existing) {
    const wait = new Date(existing.last_sent_at).getTime() + RESEND_COOLDOWN_MS - Date.now();
    if (wait > 0) return { sent: false, retryAfter: Math.ceil(wait / 1000) };
  }

  const code = generateCode();
  const now = new Date();
  const row = {
    user_id: user.id,
    code_hash: hashCode(user.id, code),
    attempts: 0,
    expires_at: new Date(now.getTime() + TTL_MS),
    last_sent_at: now,
  };
  await db('phone_verifications').insert(row).onConflict('user_id').merge();
  await deliver(user.phone, code);
  return { sent: true, retryAfter: RESEND_COOLDOWN_MS / 1000 };
}

// Returns { ok: true } or { error: 'CODE_INVALID' | 'CODE_EXPIRED' | 'CODE_ATTEMPTS' }
async function checkCode(user, code) {
  const rec = await db('phone_verifications').where({ user_id: user.id }).first();
  if (!rec) return { error: 'CODE_INVALID' };

  if (new Date(rec.expires_at).getTime() < Date.now()) {
    await db('phone_verifications').where({ id: rec.id }).del();
    return { error: 'CODE_EXPIRED' };
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await db('phone_verifications').where({ id: rec.id }).del(); // must request a new code
    return { error: 'CODE_ATTEMPTS' };
  }

  const a = Buffer.from(hashCode(user.id, code), 'hex');
  const b = Buffer.from(rec.code_hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await db('phone_verifications').where({ id: rec.id }).increment('attempts', 1);
    return { error: 'CODE_INVALID' };
  }

  await db('phone_verifications').where({ id: rec.id }).del();
  return { ok: true };
}

module.exports = { issueCode, checkCode };
