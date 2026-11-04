// Admin: money in separate parts, and the price data we collect while workers and customers still agree prices themselves.
// Superadmin only (see the gate in routes/admin.js).
const router = require('express').Router();
const db = require('../db');
const { bucketed, axis, merge, TZ } = require('../lib/series');

// Money split by where it comes from and where it goes
router.get('/payments/summary', async (req, res, next) => {
  try {
    const [jobs, fees, payouts, expected] = await Promise.all([
      db('payments').first(
        db.raw("count(*) filter (where status = 'paid')::int as paid"),
        db.raw("count(*) filter (where status = 'pending')::int as pending"),
        db.raw("count(*) filter (where status = 'failed')::int as failed"),
        db.raw("coalesce(sum(amount) filter (where status = 'paid'), 0)::int as gross"),
        db.raw("coalesce(sum(fee) filter (where status = 'paid'), 0)::int as commission"),
        db.raw("coalesce(sum(payout) filter (where status = 'paid'), 0)::int as for_workers")
      ),
      db('registration_fees').first(
        db.raw("count(*) filter (where status = 'paid')::int as paid"),
        db.raw("count(*) filter (where status = 'pending')::int as pending"),
        db.raw("count(*) filter (where status = 'failed')::int as failed"),
        db.raw("coalesce(sum(amount) filter (where status = 'paid'), 0)::int as collected")
      ),
      db('payouts').first(
        db.raw("count(*) filter (where status = 'sent')::int as sent"),
        db.raw("count(*) filter (where status = 'pending')::int as waiting"),
        db.raw("count(*) filter (where status = 'failed')::int as failed"),
        db.raw("coalesce(sum(amount) filter (where status = 'sent'), 0)::int as sent_amount"),
        db.raw("coalesce(sum(amount) filter (where status <> 'sent'), 0)::int as owed_amount"),
        db.raw("count(*) filter (where complaint_status = 'open')::int as complaints")
      ),
      db('requests as r').where('r.status', 'completed').whereNotNull('r.agreed_price')
        .whereNotExists(function () { this.select(db.raw('1')).from('payments as pay').whereRaw('pay.request_id = r.id').where('pay.status', 'paid'); })
        .first(db.raw('count(*)::int as jobs'), db.raw('coalesce(sum(r.agreed_price), 0)::int as gross')),
    ]);
    res.json({
      jobs, registration: fees, payouts, to_collect: expected,
      // NiJibu's own income: the commission on jobs + the registration fees
      income: { commission: jobs.commission, registration: fees.collected, total: jobs.commission + fees.collected },
    });
  } catch (err) {
    next(err);
  }
});

// Prices people agreed (customer and worker negotiate; NiJibu does not set prices yet).
// We keep the numbers so that later NiJibu can set fair prices, like Bolt does.
router.get('/payments/prices', async (req, res, next) => {
  try {
    const serviceId = Number(req.query.service_id) || null;
    const days = Math.min(3650, Math.max(1, Number(req.query.days) || 365));
    const since = new Date(Date.now() - days * 864e5);
    const priced = () => {
      const q = db('requests as r').join('services as s', 's.id', 'r.service_id').whereNotNull('r.agreed_price').where('r.created_at', '>=', since);
      if (serviceId) q.where('r.service_id', serviceId);
      return q;
    };
    const [by_service, all, trend] = await Promise.all([
      priced().groupBy('s.id', 's.name_en', 's.name_sw').orderByRaw('count(*) desc')
        .select(
          's.id', 's.name_en', 's.name_sw',
          db.raw('count(*)::int as jobs'),
          db.raw("count(*) filter (where r.status = 'completed')::int as done"),
          db.raw('min(r.agreed_price)::int as min'),
          db.raw('round(avg(r.agreed_price))::int as avg'),
          db.raw('round(percentile_cont(0.5) within group (order by r.agreed_price))::int as median'),
          db.raw('max(r.agreed_price)::int as max'),
          db.raw("coalesce(round(avg(r.agreed_price) filter (where r.created_at >= now() - interval '30 days')), 0)::int as avg_30d"),
          db.raw("count(*) filter (where r.created_at >= now() - interval '30 days')::int as jobs_30d")
        ),
      priced().first(
        db.raw('count(*)::int as jobs'), db.raw('min(r.agreed_price)::int as min'), db.raw('round(avg(r.agreed_price))::int as avg'),
        db.raw('round(percentile_cont(0.5) within group (order by r.agreed_price))::int as median'), db.raw('max(r.agreed_price)::int as max')
      ),
      // month by month: how many priced jobs and the average price
      (async () => {
        const range = { from: new Date(Math.max(since.getTime(), Date.now() - 24 * 31 * 864e5)), to: new Date(), unit: 'month' };
        const [keys, rows] = await Promise.all([
          axis(range),
          (async () => {
            const q = db('requests')
              .select(db.raw("to_char(date_trunc('month', created_at at time zone ?), 'YYYY-MM-DD\"T\"HH24:MI:SS') as k", [TZ]))
              .select(db.raw('count(*)::bigint as jobs'), db.raw('coalesce(round(avg(agreed_price)), 0)::bigint as avg'))
              .whereNotNull('agreed_price').whereBetween('created_at', [range.from, range.to]).groupByRaw('1');
            if (serviceId) q.where('service_id', serviceId);
            const m = new Map();
            for (const r of await q) m.set(r.k, r);
            return m;
          })(),
        ]);
        return merge(keys, [[rows, ['jobs', 'avg']]]);
      })(),
    ]);
    const unpriced = await db('requests').whereNull('agreed_price').where('created_at', '>=', since).whereNotIn('status', ['searching', 'no_provider']).count('* as n').first();
    res.json({ days, all, by_service, trend, without_price: Number(unpriced.n) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
