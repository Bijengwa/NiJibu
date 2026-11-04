// Calls from outside services (no login). Each one is protected by a secret in the address and re-checked with the provider.
const router = require('express').Router();
const crypto = require('crypto');
const rateLimit = require('../middleware/rateLimit');
const payments = require('../services/payments');

const same = (a, b) => {
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};

// Selcom tells us a payment changed. Register  <public address>/api/webhooks/selcom/<SELCOM_WEBHOOK_TOKEN>  at Selcom
// (same value as SELCOM_WEBHOOK_URL). We only read the order id; the real status is asked from Selcom.
router.post('/selcom/:token', rateLimit({ windowMs: 60 * 1000, max: 120, key: (req) => `hook:${req.ip}` }), (req, res) => {
  const expected = process.env.SELCOM_WEBHOOK_TOKEN;
  if (!expected || expected.length < 16 || !same(req.params.token, expected)) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  const orderId = typeof req.body?.order_id === 'string' ? req.body.order_id.slice(0, 80) : null;
  res.json({ result: 'SUCCESS' }); // answer fast; the work continues below, and the 20 second check is the safety net
  if (orderId) payments.onProviderNotice(orderId).catch((e) => console.warn('[webhook] selcom:', e.message));
});

module.exports = router;
