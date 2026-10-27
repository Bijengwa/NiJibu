// Fundi sign-up identity check (NIDA). match + answer are open (the account does not exist yet),
// so they are rate limited. The final link needs a logged-in user.
const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const nida = require('../services/nida');
const secret = require('../lib/secret');
const { providerView } = require('../lib/providerView');

const bad = (res) => res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
const isNida = (v) => typeof v === 'string' && /^\d{20}$/.test(v);

const limit = rateLimit({ windowMs: 10 * 60 * 1000, max: 40, key: (req) => `nida:${req.ip}` });

router.post('/match', limit, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!isNida(b.nida_number) || !b.first_name || !b.last_name || !b.phone) return bad(res);
    await nida.match(b);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/answer', limit, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!isNida(b.nida_number) || typeof b.question_id !== 'string' || typeof b.answer !== 'string') return bad(res);
    res.json(await nida.answer(b));
  } catch (e) {
    next(e);
  }
});

// After the phone code: link the checked NIDA number to this account.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!isNida(b.nida_number) || !b.first_name || !b.last_name) return bad(res);
    if (!nida.hasPassed(b.nida_number)) return res.status(403).json({ error: 'Identity not verified', code: 'IDENTITY_NOT_VERIFIED' });

    const hash = secret.hash(b.nida_number);
    const taken = await db('provider_profiles').where({ nida_hash: hash }).whereNot({ user_id: req.user.id }).first('id');
    if (taken) return res.status(409).json({ error: 'NIDA already used', code: 'NIDA_TAKEN' });

    const fields = {
      nida_submitted: true,
      nida_enc: secret.encrypt(b.nida_number),
      nida_hash: hash,
      nida_name: nida.nameFor([b.first_name, b.middle_name, b.last_name].filter(Boolean).join(' ')),
      rejection_reason: null,
    };
    const existing = await db('provider_profiles').where({ user_id: req.user.id }).first();
    const status = nida.MODE === 'mock' ? 'verified' : 'pending'; // real NIDA: set by the NIDA result / admin
    const verified = status === 'verified' ? { verification_status: 'verified', verified_at: db.fn.now() } : { verification_status: 'pending' };
    if (existing) await db('provider_profiles').where({ id: existing.id }).update({ ...fields, ...verified });
    else await db('provider_profiles').insert({ user_id: req.user.id, ...fields, ...verified });
    res.json({ provider: await providerView(req.user.id) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
