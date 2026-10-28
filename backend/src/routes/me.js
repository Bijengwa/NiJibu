const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { publicUser } = require('../lib/user');
const { signToken } = require('../lib/token');
const { saveAvatar, removeAvatar } = require('../services/avatar');
const { notify } = require('../services/notify');
const { TOKEN_RE } = require('../lib/push');

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,59}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.use(requireAuth);

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  key: (req) => `${req.method}:${req.path}:${req.user?.id}`,
});

const fail = (res, status, code, error) => res.status(status).json({ error, code });
const validPassword = (p) => typeof p === 'string' && p.length >= MIN_PASSWORD && p.length <= MAX_PASSWORD;
const loadUser = (id) => db('users').where({ id }).first();

// The phone's push token (called by the apps after login)
router.put('/push-token', async (req, res, next) => {
  try {
    const token = req.body?.token;
    if (token !== null && !(typeof token === 'string' && TOKEN_RE.test(token))) return fail(res, 400, 'VALIDATION', 'Bad request');
    if (token) await db('users').where({ push_token: token }).whereNot({ id: req.user.id }).update({ push_token: null }); // one phone, one account
    await db('users').where({ id: req.user.id }).update({ push_token: token });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    res.json({ user: publicUser(await loadUser(req.user.id)) });
  } catch (err) {
    next(err);
  }
});

// Full name + email (both required)
router.patch('/profile', async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!NAME_RE.test(name) || name.split(' ').length < 2) {
      return fail(res, 400, 'NAME_INVALID', 'Enter your full name (first and last)');
    }
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return fail(res, 400, 'EMAIL_INVALID', 'Enter a valid email address');
    }

    await db('users').where({ id: req.user.id }).update({ name, email, updated_at: db.fn.now() });
    res.json({ user: publicUser(await loadUser(req.user.id)) });
  } catch (err) {
    if (err.code === '23505') return fail(res, 409, 'EMAIL_TAKEN', 'Email already used');
    next(err);
  }
});

// Profile photo: field name "avatar", JPG/PNG/WebP up to 5 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(Object.assign(new Error('bad type'), { code: 'FILE_INVALID' })),
});

const avatarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  key: (req) => `avatar:${req.user?.id}`,
});

router.put(
  '/avatar',
  avatarLimiter,
  (req, res, next) =>
    upload.single('avatar')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'FILE_TOO_LARGE', 'File too large');
      return fail(res, 400, 'FILE_INVALID', 'Invalid file');
    }),
  async (req, res, next) => {
    try {
      if (!req.file) return fail(res, 400, 'FILE_INVALID', 'Invalid file');

      let name;
      try {
        name = await saveAvatar(req.user.id, req.file.buffer);
      } catch (e) {
        return fail(res, 400, 'FILE_INVALID', 'Invalid image'); // not a real image
      }

      const old = (await loadUser(req.user.id)).avatar_path;
      await db('users').where({ id: req.user.id }).update({ avatar_path: name, updated_at: db.fn.now() });
      await removeAvatar(old);
      res.json({ user: publicUser(await loadUser(req.user.id)) });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/avatar', async (req, res, next) => {
  try {
    const old = (await loadUser(req.user.id)).avatar_path;
    await db('users').where({ id: req.user.id }).update({ avatar_path: null, updated_at: db.fn.now() });
    await removeAvatar(old);
    res.json({ user: publicUser(await loadUser(req.user.id)) });
  } catch (err) {
    next(err);
  }
});

// Settings synced across devices
router.patch('/settings', async (req, res, next) => {
  try {
    const { language, theme_mode, notifications_enabled } = req.body || {};
    const changes = {};

    if (language !== undefined) {
      if (!['en', 'sw'].includes(language)) return fail(res, 400, 'VALIDATION', 'Invalid language');
      changes.language = language;
    }
    if (theme_mode !== undefined) {
      if (!['system', 'light', 'dark'].includes(theme_mode)) return fail(res, 400, 'VALIDATION', 'Invalid theme');
      changes.theme_mode = theme_mode;
    }
    if (notifications_enabled !== undefined) {
      if (typeof notifications_enabled !== 'boolean') return fail(res, 400, 'VALIDATION', 'Invalid value');
      changes.notifications_enabled = notifications_enabled;
    }
    if (!Object.keys(changes).length) return fail(res, 400, 'VALIDATION', 'Nothing to update');

    await db('users').where({ id: req.user.id }).update({ ...changes, updated_at: db.fn.now() });
    res.json({ user: publicUser(await loadUser(req.user.id)) });
  } catch (err) {
    next(err);
  }
});

// Change password: needs the current one. Logs out all other devices and returns a fresh token.
router.post('/password', sensitiveLimiter, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (typeof current_password !== 'string' || !validPassword(new_password)) {
      return fail(res, 400, 'VALIDATION', 'Invalid password');
    }

    const user = await loadUser(req.user.id);
    if (!(await bcrypt.compare(current_password, user.password_hash || ''))) {
      return fail(res, 400, 'WRONG_PASSWORD', 'Current password is wrong');
    }
    if (current_password === new_password) {
      return fail(res, 400, 'SAME_PASSWORD', 'New password must be different');
    }

    await db('users')
      .where({ id: user.id })
      .update({
        password_hash: await bcrypt.hash(new_password, 10),
        token_version: db.raw('token_version + 1'), // logs out every other device
        updated_at: db.fn.now(),
      });

    await notify(
      user.id,
      'password_changed',
      'Password changed',
      'Your password was changed. If this was not you, reset it now.'
    );

    const fresh = await loadUser(user.id);
    res.json({ token: signToken(fresh), user: publicUser(fresh) });
  } catch (err) {
    next(err);
  }
});

// Delete account for good: needs the password
router.delete('/', sensitiveLimiter, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== 'string') return fail(res, 400, 'VALIDATION', 'Password required');

    const user = await loadUser(req.user.id);
    if (!(await bcrypt.compare(password, user.password_hash || ''))) {
      return fail(res, 400, 'WRONG_PASSWORD', 'Wrong password');
    }

    await db('users').where({ id: user.id }).del(); // notifications + codes are removed by cascade
    await removeAvatar(user.avatar_path);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
