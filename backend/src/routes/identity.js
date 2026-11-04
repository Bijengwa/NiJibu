// Worker identity check (NIDA), before or after the account exists.
//   GET  /fee            how much the fee is
//   POST /fee            pay the fee (mobile money; demo in development)       body: { phone, pay_phone }  phone = the account phone, pay_phone = the number the worker typed to pay from (no network)
//   GET  /fee/:id        is the payment done?                                  query: phone
//   POST /check          ONE NIDA hit: number + names + phone + 1 answer      (a 2nd hit only to correct mistakes)
//   POST /accept         the NIDA number NIDA has differs: accept it or not    body: { fee_id, phone, accept }
//   POST /               after the phone code: link the checked NIDA to the account (needs a login)
// The routes before the account exists are rate limited. Every try needs a paid fee (no refund).
const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const nida = require('../services/nida');
const fees = require('../services/verificationFee');
const secret = require('../lib/secret');
const { HttpError } = require('../lib/httpError');
const { providerView } = require('../lib/providerView');

const bad = (res) => res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
const isNida = (v) => typeof v === 'string' && /^\d{20}$/.test(v);
const str = (v, max = 60) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);

const limit = rateLimit({ windowMs: 10 * 60 * 1000, max: 40, key: (req) => `nida:${req.ip}` });
const payLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, key: (req) => `nidafee:${req.ip}` });

router.get('/fee', (req, res) => res.json({ amount: fees.amount(), currency: 'TZS' }));

router.post('/fee', payLimit, async (req, res, next) => {
  try {
    res.json({ fee: await fees.pay({ phone: req.body?.phone, pay_phone: req.body?.pay_phone }) });
  } catch (e) {
    next(e);
  }
});

router.get('/fee/:id', limit, async (req, res, next) => {
  try {
    res.json({ fee: await fees.status(Number(req.params.id), req.query.phone) });
  } catch (e) {
    next(e);
  }
});

// What NIDA said, as the app needs it. wrong = the parts to correct.
router.post('/check', limit, async (req, res, next) => {
  try {
    const b = req.body || {};
    const first = str(b.first_name), last = str(b.last_name), mid = typeof b.middle_name === 'string' ? b.middle_name.trim().slice(0, 60) : '';
    if (!isNida(b.nida_number) || !first || !last || !fees.msisdn(b.phone) || !nida.QUESTIONS.includes(b.question_id) || !str(b.answer, 80) || !Number.isInteger(b.fee_id)) return bad(res);

    const fee = await fees.startHit(b.fee_id, b.phone, b.question_id); // needs a paid fee and a free hit
    let r;
    try {
      r = await nida.check({
        nida_number: b.nida_number, first_name: first, middle_name: mid, last_name: last,
        phone: fees.msisdn(b.phone), question_id: b.question_id, answer: b.answer.trim(),
      });
    } catch (e) {
      await fees.giveBackHit(fee, b.question_id); // NIDA is not reachable: that is not the worker's fault
      throw e;
    }

    const wrong = [];
    if (!r.nida_ok) wrong.push('nida');
    else {
      if (!r.name_ok) wrong.push('name');
      if (!r.phone_ok) wrong.push('phone');
      if (!r.answer_ok) wrong.push('answer');
    }
    const hitsLeft = fees.MAX_HITS - fee.hits;

    if (wrong.length) {
      if (hitsLeft <= 0) {
        await fees.markFailed(fee);
        return res.json({ result: 'failed', wrong, hits_left: 0 });
      }
      return res.json({ result: 'retry', wrong, hits_left: hitsLeft });
    }
    // Everything matched. NIDA may know the person under another number: show it and let the worker accept it.
    if (r.record_number && r.record_number !== b.nida_number) {
      await fees.offer(fee, r.record_number);
      return res.json({ result: 'number_differs', nida_number: r.record_number, hits_left: hitsLeft });
    }
    await fees.markPassed(fee, b.nida_number);
    res.json({ result: 'passed', nida_number: b.nida_number, hits_left: hitsLeft });
  } catch (e) {
    next(e);
  }
});

// NIDA's own number differs. accept=true: use it (no new NIDA hit). accept=false: the worker will correct it.
router.post('/accept', limit, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!Number.isInteger(b.fee_id) || typeof b.accept !== 'boolean') return bad(res);
    const fee = await fees.open(b.fee_id, b.phone);
    if (!fee.offered_nida_enc) throw new HttpError(409, 'NOTHING_TO_ACCEPT', 'There is no number to accept');
    if (!b.accept) {
      if (fee.hits >= fees.MAX_HITS) {
        await fees.markFailed(fee);
        return res.json({ result: 'failed', hits_left: 0 });
      }
      await db('verification_fees').where({ id: fee.id }).update({ offered_nida_enc: null });
      return res.json({ result: 'retry', wrong: ['nida'], hits_left: fees.MAX_HITS - fee.hits });
    }
    const number = secret.decrypt(fee.offered_nida_enc);
    await fees.markPassed(fee, number);
    res.json({ result: 'passed', nida_number: number, hits_left: fees.MAX_HITS - fee.hits });
  } catch (e) {
    next(e);
  }
});

// After the phone code: link the checked NIDA number to this account.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!isNida(b.nida_number) || !b.first_name || !b.last_name) return bad(res);
    const me = await db('users').where({ id: req.user.id }).first('phone');
    const pass = await fees.passedFor(me.phone, b.nida_number);
    if (!pass) return res.status(403).json({ error: 'Identity not verified', code: 'IDENTITY_NOT_VERIFIED' });

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
    const status = nida.MODE === 'mock' || nida.MODE === 'live' ? 'verified' : 'pending'; // live = NIDA said yes; manual = an admin decides
    const verified = status === 'verified' ? { verification_status: 'verified', verified_at: db.fn.now() } : { verification_status: 'pending' };
    if (existing) await db('provider_profiles').where({ id: existing.id }).update({ ...fields, ...verified });
    else await db('provider_profiles').insert({ user_id: req.user.id, ...fields, ...verified });
    await fees.markLinked(pass.id);
    res.json({ provider: await providerView(req.user.id) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
