const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { issueCode, checkCode } = require('../services/otp');
const { publicUser } = require('../lib/user');
const { signToken } = require('../lib/token');
const { notify } = require('../services/notify');

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt only uses the first 72 bytes
// Spend the same time when the phone does not exist (no user discovery by timing)
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const phoneOf = (req) => String(req.body?.phone ?? '').replace(/\D/g, '');

// Limits: per IP for everything, and per phone per endpoint (stops guessing from many IPs)
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100, key: (req) => `ip:${req.ip}` }));
const perPhone = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: (req) => `${req.path}:${phoneOf(req)}`,
});

// Accepts 9 digits (795259567) or 255 + 9 digits. Returns 255XXXXXXXXX or null.
function normalizePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (/^\d{9}$/.test(digits)) return `255${digits}`;
  if (/^255\d{9}$/.test(digits)) return digits;
  return null;
}

const validPassword = (p) =>
  typeof p === 'string' && p.length >= MIN_PASSWORD && p.length <= MAX_PASSWORD;

const fail = (res, status, code, error, extra = {}) =>
  res.status(status).json({ error, code, ...extra });

// 1) Register -> sends a code. No token until the phone is verified.
router.post('/register', perPhone, async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const { password } = req.body || {};
    if (!phone) return fail(res, 400, 'VALIDATION', 'Phone must be 9 digits');
    if (!validPassword(password)) {
      return fail(res, 400, 'VALIDATION', `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
    }

    const password_hash = await bcrypt.hash(password, 10);
    let user = await db('users').where({ phone }).first();

    if (user?.phone_verified_at) return fail(res, 409, 'PHONE_TAKEN', 'Phone already registered');

    if (user) {
      // Number registered earlier but never verified: allow a fresh start.
      // Safe, because only whoever receives the code can verify it.
      await db('users').where({ id: user.id }).update({ password_hash });
    } else {
      [user] = await db('users').insert({ phone, password_hash }).returning('*');
    }

    const { retryAfter } = await issueCode(user);
    res.status(201).json({ verification_required: true, phone, retry_after: retryAfter });
  } catch (err) {
    if (err.code === '23505') return fail(res, 409, 'PHONE_TAKEN', 'Phone already registered');
    next(err);
  }
});

// 2) Verify the code -> account active, returns token
router.post('/verify', perPhone, async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code ?? '');
    if (!phone || !/^\d{6}$/.test(code)) return fail(res, 400, 'VALIDATION', 'Invalid phone or code');

    const user = await db('users').where({ phone }).first();
    if (!user) return fail(res, 400, 'CODE_INVALID', 'Invalid code'); // same answer as a wrong code

    const result = await checkCode(user, code);
    if (!result.ok) {
      const status = result.error === 'CODE_ATTEMPTS' ? 429 : 400;
      return fail(res, status, result.error, 'Code not accepted');
    }

    await db('users').where({ id: user.id }).update({ phone_verified_at: db.fn.now() });
    await notify(
      user.id,
      'welcome',
      'Welcome to NiJibu',
      'Your account is ready. Complete your profile to get started.'
    );
    const fresh = await db('users').where({ id: user.id }).first();
    res.json({ token: signToken(fresh), user: publicUser(fresh) });
  } catch (err) {
    next(err);
  }
});

// 3) Ask for a new code (60s apart). Always answers the same, whether the phone exists or not.
router.post('/resend', perPhone, async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) return fail(res, 400, 'VALIDATION', 'Phone must be 9 digits');

    const user = await db('users').where({ phone }).first();
    if (user && !user.phone_verified_at) {
      const r = await issueCode(user);
      if (!r.sent) return fail(res, 429, 'RESEND_TOO_SOON', 'Wait before asking again', { retry_after: r.retryAfter });
      return res.json({ ok: true, retry_after: r.retryAfter });
    }
    res.json({ ok: true, retry_after: 60 });
  } catch (err) {
    next(err);
  }
});

router.post('/login', perPhone, async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const { password } = req.body || {};
    if (!phone || typeof password !== 'string') {
      return fail(res, 400, 'VALIDATION', 'Phone and password are required');
    }

    const user = await db('users').where({ phone }).first();
    const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !user.password_hash || !ok) {
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Wrong phone or password');
    }

    if (!user.phone_verified_at) {
      const r = await issueCode(user); // password was right, so send a code (respects cooldown)
      return fail(res, 403, 'PHONE_NOT_VERIFIED', 'Verify your phone', { retry_after: r.retryAfter });
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.user.id }).first();
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// Logout everywhere: old tokens stop working immediately
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await db('users').where({ id: req.user.id }).increment('token_version', 1);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
