// The apps tell us when they show a Google map (the server cannot see that: the phone talks to Google by itself).
// Only counting; the admin Services page prices it. Keep the apps on the free native Maps SDK to pay nothing.
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const usage = require('../lib/usage');

router.use(requireAuth);
router.use(rateLimit({ windowMs: 60 * 1000, max: 30, key: (req) => `usage:${req.user.id}` }));

// body: { kind: 'map_load', paid: true }  paid=false (native phone map, free) is not counted
router.post('/map-load', (req, res) => {
  if (req.body?.paid === true) usage.record({ service: 'google_maps', operation: 'map_load' });
  res.status(204).end();
});

module.exports = router;
