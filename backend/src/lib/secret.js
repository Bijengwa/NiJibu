// Encrypt / hash sensitive values (NIDA number). Key comes from NIDA_KEY (falls back to JWT_SECRET in dev).
const crypto = require('crypto');

const key = () => crypto.createHash('sha256').update(process.env.NIDA_KEY || process.env.JWT_SECRET || 'dev').digest();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

function decrypt(blob) {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

const hash = (text) => crypto.createHmac('sha256', key()).update(String(text)).digest('hex');

module.exports = { encrypt, decrypt, hash };
