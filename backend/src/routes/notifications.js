const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const items = await db('notifications')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(50)
      .select('id', 'type', 'title', 'body', 'read_at', 'created_at');
    const [{ count }] = await db('notifications')
      .where({ user_id: req.user.id })
      .whereNull('read_at')
      .count({ count: '*' });
    res.json({ items, unread: Number(count) });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await db('notifications').where({ user_id: req.user.id }).whereNull('read_at').update({ read_at: db.fn.now() });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    await db('notifications').where({ id, user_id: req.user.id }).whereNull('read_at').update({ read_at: db.fn.now() });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
