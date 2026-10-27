const jwt = require('jsonwebtoken');
const db = require('../db');

const unauthorized = (res) => res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });

// Checks a token and returns { id, role } or null. Used by HTTP and by sockets.
// The user must still exist, be verified, and the token must not be revoked (token_version).
async function authenticate(token) {
  try {
    if (!token) return null;
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const user = await db('users')
      .where({ id: Number(payload.sub) })
      .first('id', 'role', 'token_version', 'phone_verified_at');
    if (!user || !user.phone_verified_at || user.token_version !== payload.tv) return null;
    return { id: user.id, role: user.role };
  } catch (err) {
    return null;
  }
}

// Authentication for HTTP: valid Bearer token. Sets req.user = { id, role }.
async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer') return unauthorized(res);
  const user = await authenticate(token);
  if (!user) return unauthorized(res);
  req.user = user;
  next();
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
module.exports.authenticate = authenticate;
