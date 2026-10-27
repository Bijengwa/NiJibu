const jwt = require('jsonwebtoken');
const db = require('../db');

const unauthorized = (res) => res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });

// Authentication: valid Bearer token AND the user still exists, is verified,
// and the token has not been revoked (token_version). Sets req.user = { id, role }.
async function requireAuth(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) return unauthorized(res);

    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const user = await db('users')
      .where({ id: Number(payload.sub) })
      .first('id', 'role', 'token_version', 'phone_verified_at');

    if (!user || !user.phone_verified_at || user.token_version !== payload.tv) {
      return unauthorized(res);
    }
    req.user = { id: user.id, role: user.role };
    next();
  } catch (err) {
    unauthorized(res);
  }
}

// Authorization: only the listed roles may continue. Use after requireAuth.
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
  }
  next();
};

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
