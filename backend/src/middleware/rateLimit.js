// Tiny in-memory limiter (fine for one server). Use Redis-backed one if you scale out.
module.exports = function rateLimit({ windowMs, max, key }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    const entry = hits.get(k);
    if (!entry || entry.reset < now) {
      hits.set(k, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many attempts', code: 'TOO_MANY_ATTEMPTS' });
    }
    next();
  };
};
