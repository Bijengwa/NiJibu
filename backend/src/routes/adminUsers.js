// Admin: people (customers and service providers). One account per person: a worker can also request services,
// so the same person can show in both groups. Mounted inside routes/admin.js (admin only).
const router = require('express').Router();
const db = require('../db');

const PAGE = 25;
const bad = (res) => res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
const like = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Everyone who is not an admin. "Customer" = role customer, or a worker who made at least one request.
const customerWhere = (b) =>
  b.where('u.role', 'customer').orWhereExists(db('requests as r').whereRaw('r.customer_id = u.id').select(db.raw('1')));
const providerWhere = (b) => b.whereExists(db('provider_profiles as p').whereRaw('p.user_id = u.id').select(db.raw('1')));

function search(qb, q) {
  if (!q) return;
  qb.where((b) => b.whereRaw("coalesce(u.name,'') ilike ?", [like(q)]).orWhere('u.phone', 'like', like(q.replace(/\D/g, '') || '@@')).orWhereRaw("coalesce(u.email,'') ilike ?", [like(q)]));
}

router.get('/people', async (req, res, next) => {
  try {
    const group = req.query.group === 'providers' ? 'providers' : 'customers';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const base = () => db('users as u').whereNot('u.role', 'admin');

    const [c, p] = await Promise.all([
      base().where(customerWhere).count('* as n').first(),
      base().where(providerWhere).count('* as n').first(),
    ]);
    const counts = { customers: Number(c.n), providers: Number(p.n) };

    const scope = (qb) => { qb.where(group === 'providers' ? providerWhere : customerWhere); search(qb, q); return qb; };

    if (group === 'customers') {
      const status = ['completed', 'cancelled', 'active', 'none'].includes(req.query.status) ? req.query.status : '';
      const total = Number((await scope(base()).count('* as n').first()).n);
      const rows = await scope(base())
        .leftJoin('provider_profiles as pp', 'pp.user_id', 'u.id')
        .select(
          'u.id', 'u.name', 'u.phone', 'u.email', 'u.role', 'u.avatar_path', 'u.created_at', 'pp.id as provider_id',
          db.raw("case when pp.id is null then '[]'::json else (select coalesce(json_agg(json_build_object('name', s.name_en, 'experience', ps.experience) order by s.name_en), '[]') from provider_services ps join services s on s.id = ps.service_id where ps.provider_id = pp.id) end as jobs"),
          db.raw('(select count(*)::int from requests r where r.customer_id = u.id) as requests'),
          db.raw("(select count(*)::int from requests r where r.customer_id = u.id and r.status = 'completed') as completed"),
          db.raw("(select count(*)::int from requests r where r.customer_id = u.id and r.status = 'cancelled') as cancelled"),
          db.raw('(select count(*)::int from search_logs l where l.user_id = u.id) + (select count(*)::int from search_misses m where m.user_id = u.id) as searches'),
          db.raw('(select count(*)::int from search_logs l where l.user_id = u.id and l.providers_found = 0) + (select count(*)::int from search_misses m where m.user_id = u.id) as failed_searches'),
          db.raw("(select coalesce(sum(amount),0)::int from payments y where y.customer_id = u.id and y.status = 'paid') as spent"),
          db.raw('greatest((select max(r.created_at) from requests r where r.customer_id = u.id), (select max(l.created_at) from search_logs l where l.user_id = u.id), (select max(m.created_at) from search_misses m where m.user_id = u.id)) as last_activity')
        )
        .modify((qb) => {
          if (status === 'completed') qb.whereRaw("exists (select 1 from requests r where r.customer_id = u.id and r.status = 'completed')");
          if (status === 'cancelled') qb.whereRaw("exists (select 1 from requests r where r.customer_id = u.id and r.status = 'cancelled')");
          if (status === 'active') qb.whereRaw("exists (select 1 from requests r where r.customer_id = u.id and r.status not in ('completed','cancelled'))");
          if (status === 'none') qb.whereRaw('not exists (select 1 from requests r where r.customer_id = u.id)');
        })
        .orderBy('u.created_at', 'desc').limit(PAGE).offset((page - 1) * PAGE);
      return res.json({ group, counts, page, page_size: PAGE, total, items: rows.map((r) => ({ ...r, also_provider: Boolean(r.provider_id) })) });
    }

    const status = ['pending', 'verified', 'rejected', 'online'].includes(req.query.status) ? req.query.status : '';
    const total = Number((await scope(base()).count('* as n').first()).n);
    const rows = await scope(base())
      .join('provider_profiles as pp', 'pp.user_id', 'u.id')
      .select(
        'u.id', 'u.name', 'u.phone', 'u.email', 'u.avatar_path', 'u.created_at',
        'pp.id as provider_id', 'pp.verification_status', 'pp.is_online', 'pp.region', 'pp.district', 'pp.ward', 'pp.last_seen',
        db.raw("(select coalesce(json_agg(json_build_object('name', s.name_en, 'experience', ps.experience) order by s.name_en), '[]') from provider_services ps join services s on s.id = ps.service_id where ps.provider_id = pp.id) as jobs"),
        db.raw("(select count(*)::int from service_suggestions g where g.provider_id = pp.id and g.status = 'pending') as pending_jobs"),
        db.raw("(select count(*)::int from requests r where r.provider_id = pp.id and r.status = 'completed') as completed"),
        db.raw("(select count(*)::int from requests r where r.provider_id = pp.id and r.status = 'cancelled' and r.cancelled_by = 'provider') as cancelled"),
        db.raw("(select coalesce(sum(y.payout),0)::int from payments y where y.provider_id = pp.id and y.status = 'paid') as earned"),
        db.raw("(select count(*)::int from payouts o where o.provider_id = pp.id and o.complaint_status = 'open') as open_complaints"),
        db.raw('(select count(*)::int from requests r where r.customer_id = u.id) as requests_as_customer')
      )
      .modify((qb) => {
        if (status === 'online') qb.where('pp.is_online', true);
        else if (status) qb.where('pp.verification_status', status);
      })
      .orderByRaw("(pp.verification_status = 'pending') desc, u.created_at desc").limit(PAGE).offset((page - 1) * PAGE);
    res.json({ group, counts, page, page_size: PAGE, total, items: rows.map((r) => ({ ...r, also_customer: r.requests_as_customer > 0 })) });
  } catch (err) {
    next(err);
  }
});

// One person with both sides: what they did as a customer and what they did as a provider.
router.get('/people/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return bad(res);
    const user = await db('users').where({ id }).whereNot('role', 'admin').first('id', 'name', 'phone', 'email', 'role', 'avatar_path', 'phone_verified_at', 'created_at');
    if (!user) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

    const [stats, requests, searches, misses, payments, profile] = await Promise.all([
      db('requests').where({ customer_id: id }).select(
        db.raw('count(*)::int as requests'),
        db.raw("count(*) filter (where status = 'completed')::int as completed"),
        db.raw("count(*) filter (where status = 'cancelled')::int as cancelled")
      ).first(),
      db('requests as r').join('services as s', 's.id', 'r.service_id').leftJoin('provider_profiles as p', 'p.id', 'r.provider_id').leftJoin('users as pu', 'pu.id', 'p.user_id')
        .where('r.customer_id', id).orderBy('r.created_at', 'desc').limit(15)
        .select('r.id', 'r.status', 'r.agreed_price', 'r.address', 'r.cancelled_by', 'r.cancel_reason', 'r.created_at', 's.name_en as service', 'pu.name as provider', 'pu.phone as provider_phone'),
      db('search_logs as l').join('services as s', 's.id', 'l.service_id').where('l.user_id', id).orderBy('l.created_at', 'desc').limit(15)
        .select('l.id', 's.name_en as service', 'l.providers_found', 'l.created_at'),
      db('search_misses').where({ user_id: id }).orderBy('created_at', 'desc').limit(15).select('id', 'query', 'status', 'created_at'),
      db('payments as y').join('requests as r', 'r.id', 'y.request_id').join('services as s', 's.id', 'r.service_id').where('y.customer_id', id)
        .orderBy('y.created_at', 'desc').limit(15).select('y.id', 'y.amount', 'y.status', 'y.network', 'y.created_at', 'y.paid_at', 's.name_en as service'),
      db('provider_profiles').where({ user_id: id }).first(
        'id', 'verification_status', 'verified_at', 'rejection_reason', 'is_online', 'region', 'district', 'ward', 'experience', 'availability', 'last_seen', 'nida_submitted', 'nida_name', 'payout_network', 'payout_number', 'created_at'
      ),
    ]);

    let as_provider = null;
    if (profile) {
      const pid = profile.id;
      const [jobs, pending, pstats, recent, payouts] = await Promise.all([
        db('provider_services as ps').join('services as s', 's.id', 'ps.service_id').where('ps.provider_id', pid).orderBy('s.name_en')
          .select('s.name_en', 's.name_sw', 'ps.experience', 'ps.availability'),
        db('service_suggestions').where({ provider_id: pid, status: 'pending' }).select('name', 'experience', 'availability', 'created_at'),
        db('requests').where({ provider_id: pid }).select(
          db.raw("count(*) filter (where status = 'completed')::int as completed"),
          db.raw("count(*) filter (where status = 'cancelled' and cancelled_by = 'provider')::int as cancelled")
        ).first(),
        db('requests as r').join('services as s', 's.id', 'r.service_id').join('users as cu', 'cu.id', 'r.customer_id').where('r.provider_id', pid)
          .orderBy('r.created_at', 'desc').limit(15)
          .select('r.id', 'r.status', 'r.agreed_price', 'r.cancelled_by', 'r.created_at', 's.name_en as service', 'cu.name as customer', 'cu.phone as customer_phone'),
        db('payouts').where({ provider_id: pid }).orderBy('created_at', 'desc').limit(15)
          .select('id', 'amount', 'status', 'received_at', 'complaint', 'complaint_status', 'complaint_note', 'created_at'),
      ]);
      const earned = await db('payments').where({ provider_id: pid, status: 'paid' }).sum({ n: 'payout' }).first();
      as_provider = { profile, jobs, pending_jobs: pending, stats: { ...pstats, earned: Number(earned.n || 0) }, recent_jobs: recent, payouts };
    }

    res.json({
      user,
      as_customer: { stats, requests, searches, misses, payments },
      as_provider,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
