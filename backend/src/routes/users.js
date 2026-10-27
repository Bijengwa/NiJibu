const router = require('express').Router();
const db = require('../db');

router.get('/', async (req, res, next) => {
  try {
    res.json(await db('users').select('id', 'name', 'email', 'created_at'));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
    const [user] = await db('users').insert({ name, email }).returning(['id', 'name', 'email', 'created_at']);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
