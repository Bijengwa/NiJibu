// Admin: outside services we use and pay for (Google Maps, Africa's Talking, Selcom, ...).
// Mounted at /api/admin/services (admin only).
const router = require('express').Router();
const report = require('../services/serviceReport');
const profit = require('../services/profitReport');

// ?month=2026-11  (default: this month)
router.get('/usage', async (req, res, next) => {
  try {
    res.json(await report.build(typeof req.query.month === 'string' ? req.query.month : null));
  } catch (err) {
    next(err);
  }
});

// Change a price: { unit_price, currency, percent_fee, free_units }
router.put('/prices/:service/:operation', async (req, res, next) => {
  try {
    await report.savePrice(req.params.service, req.params.operation, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Change the dollar rate, the monthly budget, the profit target per job
router.put('/settings', async (req, res, next) => {
  try {
    await report.saveSettings(req.body || {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Profit: commission + registration fees, minus outside services, plans and other costs, before and after tax. ?month=2026-11
router.get('/profit', async (req, res, next) => {
  try {
    res.json(await profit.build(typeof req.query.month === 'string' ? req.query.month : null));
  } catch (err) {
    next(err);
  }
});

// Plans and other monthly costs (a Google Maps plan, hosting, ...)
router.get('/expenses', async (req, res, next) => {
  try {
    res.json({ items: await profit.list() });
  } catch (err) {
    next(err);
  }
});
router.post('/expenses', async (req, res, next) => {
  try {
    res.status(201).json({ item: await profit.addExpense(req.body || {}) });
  } catch (err) {
    next(err);
  }
});
router.put('/expenses/:id', async (req, res, next) => {
  try {
    await profit.updateExpense(Number(req.params.id) || 0, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
router.delete('/expenses/:id', async (req, res, next) => {
  try {
    await profit.removeExpense(Number(req.params.id) || 0);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
