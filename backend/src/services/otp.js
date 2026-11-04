const crypto = require('crypto');
const db = require('../db');

const TTL_MS = 10 * 60 * 1000; // code valid for 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// table: 'phone_verifications' (sign-up code) or 'password_resets' (forgot password).
// The table name is part of the hash, so a code for one purpose never works for the other.
const hashCode = (userId, code, table = 'phone_verifications') =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(table === 'phone_verifications' ? `${userId}:${code}` : `${table}:${userId}:${code}`).digest('hex');

// OTP_DELIVERY=console (default in development): the code is printed in the backend terminal.
// OTP_DELIVERY=sms (default in production): Africa's Talking SMS.  =whatsapp: WhatsApp first, SMS if it fails.
const messaging = require('./messaging');

// Creates (or replaces) the code for a user and delivers it.
// Returns { sent: true } or { sent: false, retryAfter } when asked again too soon.
async function issueCode(user, table = 'phone_verifications') {
  const existing = await db(table).where({ user_id: user.id }).first();
  if (existing) {
    const wait = new Date(existing.last_sent_at).getTime() + RESEND_COOLDOWN_MS - Date.now();
    if (wait > 0) return { sent: false, retryAfter: Math.ceil(wait / 1000) };
  }

  const code = generateCode();
  const now = new Date();
  const row = {
    user_id: user.id,
    code_hash: hashCode(user.id, code, table),
    attempts: 0,
    expires_at: new Date(now.getTime() + TTL_MS),
    last_sent_at: now,
  };
  await db(table).insert(row).onConflict('user_id').merge();
  try {
    await messaging.sendOtp(user, code);
  } catch (e) {
    // The code never reached the phone: let the person ask again right away (no 60 second wait)
    await db(table).where({ user_id: user.id }).update({ last_sent_at: new Date(0) });
    throw e;
  }
  return { sent: true, retryAfter: RESEND_COOLDOWN_MS / 1000 };
}

// Returns { ok: true } or { error: 'CODE_INVALID' | 'CODE_EXPIRED' | 'CODE_ATTEMPTS' }
async function checkCode(user, code, table = 'phone_verifications') {
  const rec = await db(table).where({ user_id: user.id }).first();
  if (!rec) return { error: 'CODE_INVALID' };

  if (new Date(rec.expires_at).getTime() < Date.now()) {
    await db(table).where({ id: rec.id }).del();
    return { error: 'CODE_EXPIRED' };
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await db(table).where({ id: rec.id }).del(); // must request a new code
    return { error: 'CODE_ATTEMPTS' };
  }

  const a = Buffer.from(hashCode(user.id, code, table), 'hex');
  const b = Buffer.from(rec.code_hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await db(table).where({ id: rec.id }).increment('attempts', 1);
    return { error: 'CODE_INVALID' };
  }

  await db(table).where({ id: rec.id }).del();
  return { ok: true };
}

module.exports = { issueCode, checkCode, hashCode };
