const db = require('../db');

// Use after requireAuth. Lets only a VERIFIED provider continue. Sets req.provider.
async function requireProvider(req, res, next) {
  try {
    const provider = await db('provider_profiles').where({ user_id: req.user.id }).first();
    if (!provider) return res.status(403).json({ error: 'Not a provider', code: 'NOT_PROVIDER' });
    if (provider.verification_status !== 'verified') {
      return res.status(403).json({ error: 'Provider not verified', code: 'NOT_VERIFIED' });
    }
    req.provider = provider;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireProvider };
