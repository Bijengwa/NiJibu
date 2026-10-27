const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { requireProvider } = require('../middleware/provider');
const svc = require('../services/requests');

router.use(requireAuth, requireProvider);

const idOf = (req) => {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

router.post('/:id/accept', async (req, res, next) => {
  try {
    const id = idOf(req);
    if (!id) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    const requestId = await svc.acceptOffer(req.user, id);
    res.json({ request: await svc.loadView(req.user, requestId) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/decline', async (req, res, next) => {
  try {
    const id = idOf(req);
    if (!id) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    await svc.declineOffer(req.user, id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
