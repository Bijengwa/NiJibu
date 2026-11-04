// The worker's one-time registration fee (default 1,000 TSh). Asked after the phone code, so the worker is logged in.
//   GET  /fee        how much, and whether this worker already paid     -> { amount, currency, paid }
//   POST /pay        pay the fee (mobile money; demo in development)    body: { pay_phone }  the number the worker pays from
//   GET  /pay/:id    is the payment done?
const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const fees = require('../services/registrationFee');

router.use(requireAuth);

const payLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, key: (req) => `regfee:${req.user.id}` });

router.get('/fee', async (req, res, next) => {
  try {
    res.json({ amount: fees.amount(), currency: 'TZS', paid: await fees.isRegistered(req.user.id) });
  } catch (e) {
    next(e);
  }
});

router.post('/pay', payLimit, async (req, res, next) => {
  try {
    const me = await db('users').where({ id: req.user.id }).first('id', 'phone');
    res.json({ fee: await fees.pay(me, { pay_phone: req.body?.pay_phone }) });
  } catch (e) {
    next(e);
  }
});

router.get('/pay/:id', async (req, res, next) => {
  try {
    const me = await db('users').where({ id: req.user.id }).first('id', 'phone');
    res.json({ fee: await fees.status(Number(req.params.id), me) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
