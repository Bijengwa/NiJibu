const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign({ sub: String(user.id), tv: user.token_version ?? 0 }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

module.exports = { signToken };
