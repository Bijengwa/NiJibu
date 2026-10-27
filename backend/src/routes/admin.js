const router = require('express').Router();
const path = require('path');
const db = require('../db');
const { notify } = require('../services/notify');

// Mounted behind requireAuth + requireRole('admin') in app.js

// Providers waiting for a decision (until NIDA verification is connected)
router.get('/providers', async (req, res, next) => {
  try {
    const status = ['pending', 'verified', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const items = await db('provider_profiles as p')
      .join('users as u', 'u.id', 'p.user_id')
      .where('p.verification_status', status)
      .orderBy('p.created_at')
      .select('p.id', 'u.name', 'u.phone', 'p.verification_status', 'p.nida_submitted', 'p.nida_name', 'p.region', 'p.district', 'p.created_at');
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

const decide = (status) => async (req, res, next) => {
  try {
    const reason = status === 'rejected' && typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) || null : null;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    const [p] = await db('provider_profiles')
      .where({ id })
      .update({ verification_status: status, verified_at: status === 'verified' ? db.fn.now() : null, rejection_reason: reason, ...(status === 'verified' ? {} : { is_online: false }) })
      .returning(['id', 'user_id']);
    if (!p) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    await notify(
      p.user_id,
      status === 'verified' ? 'provider_verified' : 'provider_rejected',
      status === 'verified' ? 'You are verified' : 'Verification not accepted',
      status === 'verified' ? 'You can now go online and receive requests.' : 'Your provider verification was not accepted.'
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
router.post('/providers/:id/verify', decide('verified'));
router.post('/providers/:id/reject', decide('rejected'));

// Demand without supply: services customers searched where no provider was near
router.get('/search-gaps', async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const items = await db('search_logs as l')
      .join('services as s', 's.id', 'l.service_id')
      .where('l.created_at', '>=', since)
      .groupBy('s.id', 's.name_sw', 's.name_en')
      .select(
        's.id', 's.name_sw', 's.name_en',
        db.raw('count(*)::int as searches'),
        db.raw('count(*) filter (where l.providers_found = 0)::int as searches_without_provider')
      )
      .havingRaw('count(*) filter (where l.providers_found = 0) > 0')
      .orderBy('searches_without_provider', 'desc');
    res.json({ days, items });
  } catch (err) {
    next(err);
  }
});

// Private NIDA photos (admin only): kind = selfie | id
router.get('/providers/:id/nida/:kind', async (req, res, next) => {
  try {
    const p = await db('provider_profiles').where({ id: Number(req.params.id) || 0 }).first('nida_selfie_path', 'nida_id_path');
    const file = p && (req.params.kind === 'selfie' ? p.nida_selfie_path : req.params.kind === 'id' ? p.nida_id_path : null);
    if (!file) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    res.set('Cache-Control', 'private, no-store');
    res.sendFile(path.join(require('./providerProfile').NIDA_DIR, path.basename(file)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
