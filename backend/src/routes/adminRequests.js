// Admin: every request with who asked, who did the job, did it go through, and the money that belongs to it.
// Mounted from admin.js (behind requireAuth + requireRole('admin')).
const router = require('express').Router();
const db = require('../db');
const { outcomeOf, OUTCOMES } = require('../lib/outcome');

const PAGE = 25;
const pageOf = (req) => Math.max(1, Number(req.query.page) || 1);
const qText = (req) => (typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '');

// Search by code (NJ-000012 or just 12), customer or worker name/phone
function applySearch(q, term) {
  if (!term) return;
  const like = `%${term}%`;
  // a request number: "12" or "NJ-000012" (a long phone number must not be read as an id)
  const num = /^(nj-?)?\d{1,9}$/i.test(term) ? Number(term.replace(/^\D+/, '')) : NaN;
  q.where(function () {
    this.whereILike('c.name', like).orWhereILike('c.phone', like).orWhereILike('pu.name', like).orWhereILike('pu.phone', like).orWhereILike('r.code', like);
    if (Number.isInteger(num) && num > 0) this.orWhere('r.id', num);
  });
}

// The outcome as a SQL condition (same rules as lib/outcome.js)
function applyOutcome(q, outcome) {
  if (!OUTCOMES.includes(outcome)) return;
  if (outcome === 'successful') q.where('r.status', 'completed').where('pay.status', 'paid');
  else if (outcome === 'awaiting_payment') q.where('r.status', 'completed').whereRaw("pay.status is distinct from 'paid'");
  else if (outcome === 'failed') q.whereIn('r.status', ['cancelled', 'no_provider']);
  else q.whereNotIn('r.status', ['completed', 'cancelled', 'no_provider']);
}

const baseQuery = () =>
  db('requests as r')
    .join('users as c', 'c.id', 'r.customer_id')
    .join('services as s', 's.id', 'r.service_id')
    .leftJoin('provider_profiles as p', 'p.id', 'r.provider_id')
    .leftJoin('users as pu', 'pu.id', 'p.user_id')
    .leftJoin('payments as pay', 'pay.request_id', 'r.id')
    .leftJoin('payouts as po', 'po.payment_id', 'pay.id');

// ---- List ----
router.get('/requests', async (req, res, next) => {
  try {
    const page = pageOf(req);
    const term = qText(req);
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
    const serviceId = Number(req.query.service_id) || null;

    const filtered = (q) => {
      applySearch(q, term);
      if (status) q.where('r.status', status);
      if (serviceId) q.where('r.service_id', serviceId);
      return q;
    };

    // counts per outcome (for the tabs), with search/status/job filters applied
    const countRows = await filtered(baseQuery()).select('r.status', db.raw("pay.status as payment_status"), db.raw('count(*)::int as n')).groupBy('r.status', 'pay.status');
    const counts = { all: 0, successful: 0, awaiting_payment: 0, active: 0, failed: 0 };
    for (const c of countRows) {
      counts.all += c.n;
      counts[outcomeOf({ status: c.status, payment_status: c.payment_status }).outcome] += c.n;
    }

    const list = filtered(baseQuery());
    applyOutcome(list, req.query.outcome);
    const [{ total }] = await list.clone().clearSelect().count({ total: '*' });
    const items = await list
      .orderBy('r.id', 'desc')
      .limit(PAGE)
      .offset((page - 1) * PAGE)
      .select(
        'r.id', 'r.code', 'r.status', 'r.address', 'r.created_at', 'r.accepted_at', 'r.completed_at', 'r.cancelled_by', 'r.cancel_reason',
        'r.agreed_price', 'r.fee_due', 'r.payout_due', 'r.customer_confirmed_at',
        's.id as service_id', 's.name_en as service', 's.name_sw as service_sw',
        'r.customer_id', 'c.name as customer_name', 'c.phone as customer_phone',
        'p.user_id as provider_user_id', 'pu.name as provider_name', 'pu.phone as provider_phone',
        'pay.code as payment_code', 'pay.status as payment_status', 'pay.attempts as payment_attempts', 'pay.paid_at',
        'po.status as payout_status', 'po.complaint_status'
      );
    res.json({
      page, page_size: PAGE, total: Number(total), counts,
      items: items.map((r) => ({ ...r, ...outcomeOf(r) })),
    });
  } catch (err) {
    next(err);
  }
});

// ---- One request: the whole story ----
router.get('/requests/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
    const r = await baseQuery().where('r.id', id).first(
      'r.*', 's.name_en as service', 's.name_sw as service_sw',
      'c.name as customer_name', 'c.phone as customer_phone',
      'p.user_id as provider_user_id', 'pu.name as provider_name', 'pu.phone as provider_phone',
      'pay.id as pay_id', 'pay.status as payment_status'
    );
    if (!r) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

    const offers = await db('request_offers as o')
      .join('provider_profiles as p', 'p.id', 'o.provider_id')
      .join('users as u', 'u.id', 'p.user_id')
      .where('o.request_id', id)
      .orderBy('o.created_at')
      .select('o.status', 'o.distance_km', 'o.tries', 'o.created_at', 'u.id as user_id', 'u.name', 'u.phone');

    let payment = null;
    let attempts = [];
    let payout = null;
    if (r.pay_id) {
      payment = await db('payments').where({ id: r.pay_id }).first('id', 'code', 'status', 'amount', 'fee_percent', 'fee', 'payout', 'network', 'phone', 'reference', 'failure', 'attempts', 'created_at', 'paid_at');
      attempts = await db('payment_attempts').where({ payment_id: r.pay_id }).orderBy('id').select('id', 'status', 'amount', 'network', 'phone', 'reference', 'failure', 'created_at');
      payout = await db('payouts').where({ payment_id: r.pay_id }).first('id', 'code', 'status', 'amount', 'network', 'number', 'reference', 'failure', 'sent_at', 'received_at', 'complaint', 'complaint_status', 'complaint_note', 'complaint_at', 'resolved_at');
    }

    res.json({
      request: {
        id: r.id, code: r.code, status: r.status, ...outcomeOf(r),
        service: r.service, service_sw: r.service_sw, address: r.address, note: r.note, lat: r.lat, lng: r.lng,
        cancelled_by: r.cancelled_by, cancel_reason: r.cancel_reason,
        // what should be paid for this job
        agreed_price: r.agreed_price, fee_percent: r.fee_percent, fee_due: r.fee_due, payout_due: r.payout_due,
        customer: { id: r.customer_id, name: r.customer_name, phone: r.customer_phone },
        provider: r.provider_id ? { user_id: r.provider_user_id, name: r.provider_name, phone: r.provider_phone } : null,
        times: {
          created: r.created_at, accepted: r.accepted_at, on_the_way: r.on_the_way_at, arrived: r.arrived_at, started: r.started_at,
          completed: r.completed_at, customer_confirmed: r.customer_confirmed_at, cancelled: r.cancelled_at,
        },
      },
      offers: offers.map((o) => ({ ...o, distance_km: Math.round(o.distance_km * 10) / 10 })),
      payment,
      attempts,
      payout,
      // paid vs due, so a gap is easy to see
      check: payment
        ? { paid: payment.status === 'paid' ? payment.amount : 0, due: r.agreed_price, matches: payment.status !== 'paid' || (payment.amount === r.agreed_price && payment.fee === r.fee_due && payment.payout === r.payout_due) }
        : r.status === 'completed' ? { paid: 0, due: r.agreed_price, matches: false } : null,
    });
  } catch (err) {
    next(err);
  }
});

// ---- Payments: money in, commission, money out, and what is still to be collected ----
router.get('/payments', async (req, res, next) => {
  try {
    const page = pageOf(req);
    const term = qText(req);
    const status = ['pending', 'paid', 'failed'].includes(req.query.status) ? req.query.status : null;
    const payoutStatus = ['pending', 'sent', 'failed'].includes(req.query.payout) ? req.query.payout : null;
    const serviceId = Number(req.query.service_id) || null;

    const payBase = () =>
      db('payments as pay')
        .join('requests as r', 'r.id', 'pay.request_id')
        .join('services as s', 's.id', 'r.service_id')
        .join('users as c', 'c.id', 'pay.customer_id')
        .join('provider_profiles as p', 'p.id', 'pay.provider_id')
        .join('users as pu', 'pu.id', 'p.user_id')
        .leftJoin('payouts as po', 'po.payment_id', 'pay.id');
    const filter = (q) => {
      if (status) q.where('pay.status', status);
      if (payoutStatus) q.where('po.status', payoutStatus);
      if (serviceId) q.where('r.service_id', serviceId);
      if (term) {
        const like = `%${term}%`;
        q.where(function () {
          this.whereILike('c.name', like).orWhereILike('c.phone', like).orWhereILike('pu.name', like).orWhereILike('pu.phone', like).orWhereILike('r.code', like).orWhereILike('pay.code', like).orWhereILike('pay.reference', like);
        });
      }
      return q;
    };

    const totals = await db('payments as pay')
      .leftJoin('payouts as po', 'po.payment_id', 'pay.id')
      .where('pay.status', 'paid')
      .first(
        db.raw('count(*)::int as count'),
        db.raw('coalesce(sum(pay.amount), 0)::int as gross'),
        db.raw('coalesce(sum(pay.fee), 0)::int as commission'),
        db.raw("coalesce(sum(po.amount) filter (where po.status = 'sent'), 0)::int as paid_out"),
        db.raw("coalesce(sum(pay.payout) filter (where po.status is distinct from 'sent'), 0)::int as owed_to_fundis")
      );
    // Jobs done but not paid by the customer yet: the money we still expect (from the saved price and commission)
    const expected = await db('requests as r')
      .where('r.status', 'completed')
      .whereNotNull('r.agreed_price')
      .whereNotExists(function () { this.select(db.raw('1')).from('payments as pay').whereRaw('pay.request_id = r.id').where('pay.status', 'paid'); })
      .first(
        db.raw('count(*)::int as jobs'),
        db.raw('coalesce(sum(r.agreed_price), 0)::int as gross'),
        db.raw('coalesce(sum(r.fee_due), 0)::int as commission'),
        db.raw('coalesce(sum(r.payout_due), 0)::int as for_fundis')
      );
    // Per job type: how much came in, what NiJibu kept, what went to fundis
    const by_service = await db('payments as pay')
      .join('services as s', 's.id', 'pay.service_id')
      .where('pay.status', 'paid')
      .groupBy('s.id', 's.name_en', 's.name_sw')
      .orderByRaw('sum(pay.amount) desc')
      .select('s.id', 's.name_en as service', 's.name_sw as service_sw', db.raw('count(*)::int as payments'), db.raw('sum(pay.amount)::int as gross'), db.raw('sum(pay.fee)::int as commission'), db.raw('sum(pay.payout)::int as for_fundis'));

    const [{ total }] = await filter(payBase()).count({ total: '*' });
    const items = await filter(payBase())
      .orderBy('pay.id', 'desc')
      .limit(PAGE)
      .offset((page - 1) * PAGE)
      .select(
        'pay.id', 'pay.code', 'pay.request_id', 'r.code as request_code', 's.name_en as service',
        'pay.amount', 'pay.fee_percent', 'pay.fee', 'pay.payout', 'pay.status', 'pay.network', 'pay.phone', 'pay.reference', 'pay.attempts', 'pay.failure', 'pay.created_at', 'pay.paid_at',
        'pay.customer_id', 'c.name as customer_name', 'p.user_id as provider_user_id', 'pu.name as provider_name',
        'po.id as payout_id', 'po.code as payout_code', 'po.status as payout_status', 'po.failure as payout_failure', 'po.complaint_status'
      );
    res.json({ page, page_size: PAGE, total: Number(total), totals, expected, by_service, items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
