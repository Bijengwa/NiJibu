const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await db.raw('select 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

app.use('/api/users', require('./routes/users'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.code === '23505' ? 409 : 500).json({ error: err.code === '23505' ? 'Already exists' : 'Internal server error' });
});

module.exports = app;
