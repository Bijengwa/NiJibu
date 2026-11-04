// Complaints from customers and workers about one request. The admin answers them.
// Rules: only the customer or the worker of that request, only after a worker was assigned,
// only within 7 days, and one complaint in progress per person per request.
const db = require('../db');
const { HttpError } = require('../lib/httpError');
const { notify } = require('./notify');

const WINDOW_DAYS = 7;
const STATUSES = ['open', 'in_review', 'resolved', 'rejected'];
const ACTIVE = ['open', 'in_review'];

// Fixed lists so every complaint is easy to count
const REASONS = {
  customer: ['worker_no_show', 'bad_work', 'price_changed', 'rude', 'payment_problem', 'other'],
  worker: ['customer_no_show', 'wrong_location', 'refused_to_pay', 'rude', 'other'], // "money not received" has its own button on the payout card
};

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function adminIds() {
  return db('users').where({ role: 'admin' }).pluck('id');
}

// The customer or the worker files a complaint about a request
async function file(user, role, requestId, { reason, message }) {
  if (!REASONS[role]) throw new HttpError(400, 'VALIDATION', 'Bad role');
  if (!REASONS[role].includes(reason)) throw new HttpError(400, 'VALIDATION', 'Choose a reason');
  const text = clean(message, 500);
  if (text.length < 5) throw new HttpError(400, 'VALIDATION', 'Say what happened');

  const r = await db('requests as r')
    .leftJoin('provider_profiles as p', 'p.id', 'r.provider_id')
    .where('r.id', requestId)
    .first('r.id', 'r.customer_id', 'r.provider_id', 'r.created_at', 'r.accepted_at', 'r.completed_at', 'r.cancelled_at', 'p.user_id as worker_user_id');
  const mine = r && (role === 'customer' ? r.customer_id === user.id : r.worker_user_id === user.id);
  if (!mine) throw new HttpError(404, 'NOT_FOUND', 'Request not found');
  if (!r.provider_id) throw new HttpError(409, 'BAD_STATE', 'No worker was assigned to this request');

  const last = new Date(r.completed_at || r.cancelled_at || r.accepted_at || r.created_at);
  if (Date.now() - last.getTime() > WINDOW_DAYS * 24 * 3600 * 1000) {
    throw new HttpError(409, 'TOO_LATE', `You can complain only within ${WINDOW_DAYS} days`);
  }

  const against = role === 'customer' ? r.worker_user_id : r.customer_id;
  let row;
  try {
    [row] = await db('complaints')
      .insert({ request_id: r.id, from_user_id: user.id, from_role: role, against_user_id: against, reason, message: text })
      .returning('*');
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'COMPLAINT_OPEN', 'You already have a complaint for this request');
    throw err;
  }
  for (const id of await adminIds()) await notify(id, 'new_complaint', 'New complaint', `A ${role} reported a problem (request ${r.id}).`);
  return row;
}

// My complaints (as customer or worker)
function listMine(userId, role) {
  return db('complaints as c')
    .join('requests as r', 'r.id', 'c.request_id')
    .where({ 'c.from_user_id': userId, 'c.from_role': role })
    .orderBy('c.created_at', 'desc')
    .limit(50)
    .select('c.id', 'c.code', 'c.request_id', 'r.code as request_code', 'c.reason', 'c.message', 'c.status', 'c.admin_reply', 'c.created_at', 'c.resolved_at');
}

// Does this request have a complaint in progress from its customer? (the worker's money waits then)
async function holdsPayout(requestId) {
  const c = await db('complaints').where({ request_id: requestId, from_role: 'customer' }).whereIn('status', ACTIVE).first('id');
  return Boolean(c);
}

// Admin: list with filters
async function adminList({ status, from_role, search } = {}) {
  const q = db('complaints as c')
    .join('requests as r', 'r.id', 'c.request_id')
    .join('users as fu', 'fu.id', 'c.from_user_id')
    .leftJoin('users as au', 'au.id', 'c.against_user_id')
    .join('services as s', 's.id', 'r.service_id')
    .leftJoin('payments as pay', 'pay.request_id', 'r.id')
    .orderByRaw("case c.status when 'open' then 0 when 'in_review' then 1 else 2 end, c.created_at desc")
    .limit(300)
    .select(
      'c.id', 'c.code', 'c.request_id', 'r.code as request_code', 'c.from_role', 'c.reason', 'c.message', 'c.status', 'c.admin_reply', 'c.payout_id',
      'c.created_at', 'c.resolved_at',
      'fu.id as from_user_id', 'fu.name as from_name', 'fu.phone as from_phone',
      'au.id as against_user_id', 'au.name as against_name', 'au.phone as against_phone',
      's.name_en as service', 'r.status as request_status', 'r.agreed_price as price', 'pay.status as payment_status'
    );
  if (STATUSES.includes(status)) q.where('c.status', status);
  else if (status === 'active') q.whereIn('c.status', ACTIVE);
  if (['customer', 'worker'].includes(from_role)) q.where('c.from_role', from_role);
  const s = clean(search, 60);
  if (s) q.where((b) => b.whereILike('c.code', `%${s}%`).orWhereILike('r.code', `%${s}%`).orWhereILike('fu.name', `%${s}%`).orWhereILike('fu.phone', `%${s}%`));
  return q;
}

// Admin: counts for the page header
async function counts() {
  const rows = await db('complaints').select('status').count('* as n').groupBy('status');
  const out = { open: 0, in_review: 0, resolved: 0, rejected: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

// Admin: set the status and write a reply.
// `resend` (only for "money not received"): try the payout again before closing.
async function answer(adminId, id, { status, reply, resend }) {
  if (!['in_review', 'resolved', 'rejected'].includes(status)) throw new HttpError(400, 'VALIDATION', 'Bad status');
  const text = clean(reply, 500);
  const final = status !== 'in_review';
  if (final && text.length < 3) throw new HttpError(400, 'VALIDATION', 'Write a reply');

  const c = await db('complaints').where({ id }).first();
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'Complaint not found');
  if (!ACTIVE.includes(c.status)) throw new HttpError(409, 'BAD_STATE', 'This complaint is already closed');

  await db('complaints').where({ id }).update({
    status,
    admin_reply: text || c.admin_reply,
    admin_id: adminId,
    updated_at: db.fn.now(),
    resolved_at: final ? db.fn.now() : null,
  });

  if (final) {
    const payments = require('./payments'); // loaded here: payments also needs this file
    // Keep the old payout columns in step (the worker app still reads them)
    if (c.payout_id) {
      if (resend && status === 'resolved') {
        const po = await db('payouts').where({ id: c.payout_id }).first();
        if (po) {
          await db('payouts').where({ id: po.id }).update({ status: 'failed' });
          await payments.sendPayout(po.payment_id);
        }
      }
      await db('payouts').where({ id: c.payout_id }).update({ complaint_status: 'resolved', complaint_note: text, resolved_at: db.fn.now(), received_at: null });
    }
    // A customer complaint was holding the worker's money: let it go now
    if (c.from_role === 'customer' && !(await holdsPayout(c.request_id))) {
      const pay = await db('payments').where({ request_id: c.request_id, status: 'paid' }).first('id');
      if (pay) await payments.sendPayout(pay.id);
    }
  }

  const label = { in_review: 'is being looked at', resolved: 'was answered', rejected: 'was closed' }[status];
  await notify(c.from_user_id, 'complaint_update', 'Your complaint ' + label, text || 'The admin is looking at your complaint.');
}

module.exports = { file, listMine, holdsPayout, adminList, counts, answer, REASONS, WINDOW_DAYS, ACTIVE };
