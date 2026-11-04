// Admin: staff accounts (superadmin only, see the gate in routes/admin.js).
//   superadmin = everything.  support = customer care (users, requests, jobs, complaints).
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { STAFF, SUPER, SUPPORT, PAGES } = require('../lib/roles');

const bad = (res, msg) => res.status(400).json({ error: msg || 'Bad request', code: 'VALIDATION' });
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;

// Accepts 9 digits (795259567) or 255 + 9 digits. Returns 255XXXXXXXXX or null.
function normalizePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (/^\d{9}$/.test(digits)) return `255${digits}`;
  if (/^255\d{9}$/.test(digits)) return digits;
  return null;
}
const validPassword = (p) => typeof p === 'string' && p.length >= MIN_PASSWORD && p.length <= MAX_PASSWORD;

const publicStaff = (u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role, disabled: Boolean(u.disabled_at), created_at: u.created_at, pages: PAGES[u.role] || [] });
const COLS = ['id', 'name', 'phone', 'email', 'role', 'disabled_at', 'created_at'];

// Who am I (the portal reads the role and the pages it may show)
router.get('/me', async (req, res, next) => {
  try {
    const u = await db('users').where({ id: req.user.id }).first(COLS);
    res.json({ staff: publicStaff(u) });
  } catch (err) {
    next(err);
  }
});

router.get('/staff', async (req, res, next) => {
  try {
    const rows = await db('users').whereIn('role', STAFF).orderByRaw("(role = 'superadmin') desc, disabled_at is not null, created_at").select(COLS);
    res.json({ items: rows.map(publicStaff) });
  } catch (err) {
    next(err);
  }
});

router.post('/staff', async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 100) : '';
    const phone = normalizePhone(req.body?.phone);
    const role = req.body?.role;
    const { password } = req.body || {};
    if (name.length < 2) return bad(res, 'Write the name');
    if (!phone) return bad(res, 'Phone must be 9 digits, like 712345678');
    if (!STAFF.includes(role)) return bad(res, 'Choose a role');
    if (!validPassword(password)) return bad(res, `Password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters`);
    // A staff account is a new account. A customer or a worker keeps their own account, so the phone must be free.
    if (await db('users').where({ phone }).first('id')) {
      return res.status(409).json({ error: 'This phone number already has an account', code: 'PHONE_TAKEN' });
    }
    const password_hash = await bcrypt.hash(password, 12);
    const [u] = await db('users').insert({ name, phone, role, password_hash, phone_verified_at: db.fn.now() }).returning(COLS);
    res.status(201).json({ staff: publicStaff(u) });
  } catch (err) {
    next(err);
  }
});

// Change role, name, switch on/off, or set a new password. Every change logs the person out everywhere.
router.patch('/staff/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return bad(res);
    const target = await db('users').where({ id }).whereIn('role', STAFF).first(COLS);
    if (!target) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

    const b = req.body || {};
    const patch = {};
    if (b.name !== undefined) {
      const name = typeof b.name === 'string' ? b.name.trim().slice(0, 100) : '';
      if (name.length < 2) return bad(res, 'Write the name');
      patch.name = name;
    }
    if (b.role !== undefined) {
      if (!STAFF.includes(b.role)) return bad(res, 'Choose a role');
      patch.role = b.role;
    }
    if (b.disabled !== undefined) patch.disabled_at = b.disabled ? db.fn.now() : null;
    if (b.password !== undefined) {
      if (!validPassword(b.password)) return bad(res, `Password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters`);
      patch.password_hash = await bcrypt.hash(b.password, 12);
    }
    if (!Object.keys(patch).length) return bad(res);

    // Nobody locks themselves out, and the portal always keeps one working superadmin
    const losesPower = (patch.role && patch.role !== SUPER) || patch.disabled_at;
    if (target.id === req.user.id && losesPower) return bad(res, 'You cannot lower or switch off your own account');
    if (target.role === SUPER && !target.disabled_at && losesPower) {
      const others = await db('users').where({ role: SUPER }).whereNull('disabled_at').whereNot({ id }).count('* as n').first();
      if (Number(others.n) < 1) return bad(res, 'There must be at least one working superadmin');
    }

    await db('users').where({ id }).update({ ...patch, token_version: db.raw('token_version + 1') });
    const u = await db('users').where({ id }).first(COLS);
    res.json({ staff: publicStaff(u) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
