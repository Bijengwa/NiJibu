const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db');
const { requireAuth, requireRole } = require('./middleware/auth');

const app = express();

app.use(helmet());
// The mobile app does not need CORS. Allow browser origins only if listed in CORS_ORIGINS.
app.use(cors({ origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : false }));
app.use(express.json({ limit: '10kb' }));

app.get('/health', async (req, res) => {
  try {
    await db.raw('select 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

// Profile photos: random unguessable file names, no directory listing
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), { index: false, dotfiles: 'ignore', maxAge: '7d' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/me', require('./routes/me'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/users', requireAuth, requireRole('admin'), require('./routes/users'));
app.use('/api/admin', requireAuth, requireRole('admin'), require('./routes/admin'));
app.use('/api/services', require('./routes/services'));
app.use('/api/provider', require('./routes/provider'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/offers', require('./routes/offers'));

app.use((req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
  }
  if (err.expose) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error(err);
  res.status(err.code === '23505' ? 409 : 500).json({ error: err.code === '23505' ? 'Already exists' : 'Internal server error' });
});

module.exports = app;
