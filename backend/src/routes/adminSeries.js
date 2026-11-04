// Admin: numbers over time for the charts. The range and the step are chosen by the admin.
//   GET /series?from=&to=&bucket=             whole business (customer care gets no money)
//   GET /people/:id/series?from=&to=&bucket=  one person, as customer and as provider
const router = require('express').Router();
const db = require('../db');
const { SUPER, STAFF } = require('../lib/roles');
const { parseRange, axis, bucketed, merge } = require('../lib/series');

const head = (r) => ({ from: r.from.toISOString(), to: r.to.toISOString(), bucket: r.unit, auto: r.auto, adjusted: r.adjusted });

router.get('/series', async (req, res, next) => {
  try {
    const r = parseRange(req.query);
    const money = req.user.role === SUPER;
    const noStaff = `role <> all(array[${STAFF.map((s) => `'${s}'`).join(',')}])`;
    const [keys, reqs, done, cancelled, newUsers, newWorkers, searches, misses, complaints, pay, out, fees] = await Promise.all([
      axis(r),
      bucketed(r, { table: 'requests', col: 'created_at', agg: { requests: 'count(*)', no_provider: "count(*) filter (where status = 'no_provider')" } }),
      bucketed(r, { table: 'requests', col: 'completed_at', where: "status = 'completed'", agg: { completed: 'count(*)' } }),
      bucketed(r, { table: 'requests', col: 'cancelled_at', where: "status = 'cancelled'", agg: { cancelled: 'count(*)' } }),
      bucketed(r, { table: 'users', col: 'created_at', where: noStaff, agg: { new_users: 'count(*)' } }),
      bucketed(r, { table: 'provider_profiles', col: 'created_at', agg: { new_workers: 'count(*)' } }),
      bucketed(r, { table: 'search_logs', col: 'created_at', agg: { searches: 'count(*)', searches_empty: 'count(*) filter (where providers_found = 0)' } }),
      bucketed(r, { table: 'search_misses', col: 'created_at', agg: { misses: 'count(*)' } }),
      bucketed(r, { table: 'complaints', col: 'created_at', agg: { complaints: 'count(*)' } }),
      money ? bucketed(r, { table: 'payments', col: 'paid_at', where: "status = 'paid'", agg: { gross: 'coalesce(sum(amount),0)', commission: 'coalesce(sum(fee),0)', paid_jobs: 'count(*)' } }) : new Map(),
      money ? bucketed(r, { table: 'payouts', col: 'sent_at', where: "status = 'sent'", agg: { payouts_sent: 'coalesce(sum(amount),0)' } }) : new Map(),
      money ? bucketed(r, { table: 'registration_fees', col: 'paid_at', where: "status = 'paid'", agg: { registration: 'coalesce(sum(amount),0)', registered: 'count(*)' } }) : new Map(),
    ]);
    const points = merge(keys, [
      [reqs, ['requests', 'no_provider']], [done, ['completed']], [cancelled, ['cancelled']],
      [newUsers, ['new_users']], [newWorkers, ['new_workers']],
      [searches, ['searches', 'searches_empty']], [misses, ['misses']], [complaints, ['complaints']],
      [pay, ['gross', 'commission', 'paid_jobs']], [out, ['payouts_sent']], [fees, ['registration', 'registered']],
    ]);
    res.json({ ...head(r), money, points });
  } catch (err) {
    next(err);
  }
});

router.get('/people/:id/series', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    const user = await db('users').where({ id }).whereNotIn('role', STAFF).first('id');
    if (!user) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    const r = parseRange(req.query);
    const profile = await db('provider_profiles').where({ user_id: id }).first('id');
    const pid = profile ? profile.id : -1;
    const money = req.user.role === SUPER;

    const [keys, asked, doneC, cancelledC, searched, missed, spent, doneP, cancelledP, earned] = await Promise.all([
      axis(r),
      bucketed(r, { table: 'requests', col: 'created_at', where: `customer_id = ${id}`, agg: { requests: 'count(*)' } }),
      bucketed(r, { table: 'requests', col: 'completed_at', where: `customer_id = ${id} and status = 'completed'`, agg: { completed: 'count(*)' } }),
      bucketed(r, { table: 'requests', col: 'cancelled_at', where: `customer_id = ${id} and status = 'cancelled'`, agg: { cancelled: 'count(*)' } }),
      bucketed(r, { table: 'search_logs', col: 'created_at', where: `user_id = ${id}`, agg: { searches: 'count(*)' } }),
      bucketed(r, { table: 'search_misses', col: 'created_at', where: `user_id = ${id}`, agg: { misses: 'count(*)' } }),
      money ? bucketed(r, { table: 'payments', col: 'paid_at', where: `customer_id = ${id} and status = 'paid'`, agg: { spent: 'coalesce(sum(amount),0)' } }) : new Map(),
      bucketed(r, { table: 'requests', col: 'completed_at', where: `provider_id = ${pid} and status = 'completed'`, agg: { jobs_done: 'count(*)' } }),
      bucketed(r, { table: 'requests', col: 'cancelled_at', where: `provider_id = ${pid} and status = 'cancelled' and cancelled_by = 'provider'`, agg: { jobs_cancelled: 'count(*)' } }),
      money ? bucketed(r, { table: 'payments', col: 'paid_at', where: `provider_id = ${pid} and status = 'paid'`, agg: { earned: 'coalesce(sum(payout),0)', gross: 'coalesce(sum(amount),0)' } }) : new Map(),
    ]);
    const points = merge(keys, [
      [asked, ['requests']], [doneC, ['completed']], [cancelledC, ['cancelled']], [searched, ['searches']], [missed, ['misses']], [spent, ['spent']],
      [doneP, ['jobs_done']], [cancelledP, ['jobs_cancelled']], [earned, ['earned', 'gross']],
    ]);
    res.json({ ...head(r), money, is_provider: Boolean(profile), points });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
