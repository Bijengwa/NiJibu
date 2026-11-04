// Profit of NiJibu: what comes in (13% commission + the 1,000 TSh registration fees), what goes out (outside services,
// plans, other monthly costs) and what is left, before and after tax. Costs of outside services come from serviceReport.
const db = require('../db');
const costs = require('../lib/serviceCosts');
const report = require('./serviceReport');
const { HttpError } = require('../lib/httpError');

const TZ = 'Africa/Dar_es_Salaam';
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const num = (v) => Number(v) || 0;

// ---- plans and other monthly costs ----
const list = () => db('service_expenses').orderBy([{ column: 'from_month', order: 'desc' }, { column: 'id', order: 'desc' }]);

function readExpense(b, partial = false) {
  const out = {};
  const bad = (m) => { throw new HttpError(400, 'VALIDATION', m); };
  if (!partial || b.label !== undefined) {
    const label = typeof b.label === 'string' ? b.label.trim() : '';
    if (!label || label.length > 80) bad('Write a name for it (up to 80 letters)');
    out.label = label;
  }
  if (!partial || b.amount !== undefined) {
    const a = Number(b.amount);
    if (!Number.isFinite(a) || a < 0 || a > 1e9) bad('Check the amount');
    out.amount = a;
  }
  if (!partial || b.currency !== undefined) {
    if (!['USD', 'TZS'].includes(b.currency)) bad('Currency must be USD or TZS');
    out.currency = b.currency;
  }
  if (!partial || b.from_month !== undefined) {
    if (!MONTH.test(String(b.from_month))) bad('Choose the first month');
    out.from_month = b.from_month;
  }
  if (b.to_month !== undefined) {
    if (b.to_month !== null && b.to_month !== '' && !MONTH.test(String(b.to_month))) bad('Check the last month');
    out.to_month = b.to_month || null;
  }
  if (b.service !== undefined) out.service = typeof b.service === 'string' && b.service.trim() ? b.service.trim().slice(0, 30) : null;
  if (b.replaces_usage !== undefined) out.replaces_usage = b.replaces_usage === true;
  if (b.note !== undefined) out.note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 200) : null;
  return out;
}

async function addExpense(b) {
  const row = readExpense(b);
  if (row.to_month && row.to_month < row.from_month) throw new HttpError(400, 'VALIDATION', 'The last month is before the first month');
  if (!row.service) row.replaces_usage = false;
  const [r] = await db('service_expenses').insert(row).returning('*');
  return r;
}

async function updateExpense(id, b) {
  const cur = await db('service_expenses').where({ id }).first();
  if (!cur) throw new HttpError(404, 'NOT_FOUND', 'Not found');
  const patch = readExpense(b, true);
  const to = patch.to_month === undefined ? cur.to_month : patch.to_month;
  if (to && to < (patch.from_month || cur.from_month)) throw new HttpError(400, 'VALIDATION', 'The last month is before the first month');
  await db('service_expenses').where({ id }).update(patch);
}

const removeExpense = (id) => db('service_expenses').where({ id }).del();

const activeIn = (e, month) => e.from_month <= month && (!e.to_month || e.to_month >= month);

// ---- the report ----
async function build(monthKey) {
  const d = await report.build(monthKey);
  const fx = d.settings.usd_to_tzs;
  const taxPct = d.settings.tax_percent;
  const expenses = await list();
  const toTzs = (e) => Math.round(e.currency === 'USD' ? num(e.amount) * fx : num(e.amount));

  const months = await Promise.all(d.months.map(async (m) => {
    const r = costs.monthRange(m.month);
    const [pay, reg] = await Promise.all([
      db('payments').where({ status: 'paid' }).where('paid_at', '>=', r.start).where('paid_at', '<', r.end)
        .first(db.raw('count(*)::int as jobs'), db.raw('coalesce(sum(amount),0)::bigint as gross'), db.raw('coalesce(sum(fee),0)::bigint as commission')),
      db('registration_fees').where({ status: 'paid' }).where('paid_at', '>=', r.start).where('paid_at', '<', r.end)
        .first(db.raw('count(*)::int as workers'), db.raw('coalesce(sum(amount),0)::bigint as amount')),
    ]);

    // A plan that covers a service replaces its pay-per-call cost
    const usage = { ...m.by_service };
    const plans = [];
    for (const e of expenses.filter((x) => activeIn(x, m.month))) {
      const tz = toTzs(e);
      const payPerUse = e.service ? Math.round(usage[e.service] || 0) : null;
      if (e.service && e.replaces_usage) usage[e.service] = 0;
      plans.push({ id: e.id, label: e.label, service: e.service, amount: num(e.amount), currency: e.currency, tzs: tz, replaces_usage: e.replaces_usage, pay_per_use_tzs: e.replaces_usage ? payPerUse : null, from_month: e.from_month, to_month: e.to_month, note: e.note });
    }
    const usageCost = Math.round(Object.values(usage).reduce((n, v) => n + v, 0));
    const fixedCost = plans.reduce((n, p) => n + p.tzs, 0);
    const commission = num(pay.commission);
    const regFees = num(reg.amount);
    const revenue = commission + regFees;
    const cost = usageCost + fixedCost;
    const before = revenue - cost;
    const tax = before > 0 ? Math.round((before * taxPct) / 100) : 0;
    return {
      month: m.month, jobs: pay.jobs, gross: num(pay.gross), commission, workers_paid: reg.workers, reg_fees: regFees, revenue,
      usage_cost: usageCost, fixed_cost: fixedCost, cost, profit_before_tax: before, tax, net: before - tax,
      usage_by_service: usage, plans,
    };
  }));

  const cur = months[months.length - 1];
  const range = costs.monthRange(d.month);
  const days = d.days_in_month;

  // Per job type (this month): what each kind of job brings and what the payment gateway takes from it
  const prices = await db('service_prices').where({ service: 'selcom' }).select('operation', 'percent_fee');
  const pct = (op) => num(prices.find((p) => p.operation === op)?.percent_fee) / 100;
  const smsCost = d.services.find((s) => s.service === 'africastalking')?.cost_tzs || 0;
  const smsPerJob = cur.jobs ? smsCost / cur.jobs : 0;
  const byType = (await db('payments as y').join('services as s', 's.id', 'y.service_id')
    .where('y.status', 'paid').where('y.paid_at', '>=', range.start).where('y.paid_at', '<', range.end)
    .groupBy('s.id', 's.name_en')
    .select('s.name_en as name', db.raw('count(*)::int as jobs'), db.raw('sum(y.amount)::bigint as gross'), db.raw('sum(y.fee)::bigint as commission'), db.raw('sum(y.payout)::bigint as payout'))
    .orderByRaw('sum(y.fee) desc')).map((r) => {
    const gateway = Math.round(num(r.gross) * pct('collect') + num(r.payout) * pct('payout'));
    const sms = Math.round(r.jobs * smsPerJob);
    return { name: r.name, jobs: r.jobs, avg_price: Math.round(num(r.gross) / r.jobs), commission: num(r.commission), gateway_cost: gateway, sms_cost: sms, profit: num(r.commission) - gateway - sms, profit_per_job: Math.round((num(r.commission) - gateway - sms) / r.jobs) };
  });

  // Day by day: money in, usage cost, and the running profit (fixed costs spread evenly over the days)
  const dayRows = await Promise.all([
    db('payments').where({ status: 'paid' }).where('paid_at', '>=', range.start).where('paid_at', '<', range.end)
      .groupByRaw(`extract(day from (paid_at at time zone '${TZ}'))`).select(db.raw(`extract(day from (paid_at at time zone '${TZ}'))::int as day`), db.raw('sum(fee)::bigint as v')),
    db('registration_fees').where({ status: 'paid' }).where('paid_at', '>=', range.start).where('paid_at', '<', range.end)
      .groupByRaw(`extract(day from (paid_at at time zone '${TZ}'))`).select(db.raw(`extract(day from (paid_at at time zone '${TZ}'))::int as day`), db.raw('sum(amount)::bigint as v')),
  ]);
  const income = Array(days).fill(0);
  for (const rows of dayRows) for (const r of rows) income[r.day - 1] += num(r.v);
  const usageDaily = Array(days).fill(0);
  for (const [svc, arr] of Object.entries(d.daily.cost_by_service)) {
    if (cur.plans.some((p) => p.service === svc && p.replaces_usage)) continue;
    arr.forEach((v, i) => { usageDaily[i] += Math.max(0, v); });
  }
  const fixedDaily = cur.fixed_cost / days;
  const upto = d.daily.today || days;
  let run = 0;
  const running = [];
  for (let i = 0; i < upto; i++) { run += income[i] - usageDaily[i] - fixedDaily; running.push(Math.round(run)); }

  // How many jobs a month must be done to pay the fixed costs
  const marginPerJob = cur.jobs ? Math.round((cur.commission - cur.usage_cost) / cur.jobs) : null;
  const breakEven = marginPerJob > 0 ? Math.ceil(Math.max(0, cur.fixed_cost - cur.reg_fees) / marginPerJob) : null;

  // Budget: everything paid to outside services, plans included (usage is forecast to the end of the month)
  const projUsage = d.is_current ? costs.project(cur.usage_cost, Math.max(costs.elapsedDays(range), 0.01), days) : cur.usage_cost;
  const projectedCost = Math.round(cur.fixed_cost + projUsage);
  const budget = costs.budgetVerdict(d.settings.monthly_budget_tzs, projectedCost, cur.cost);

  return {
    month: d.month, is_current: d.is_current, days_in_month: days, day_of_month: d.day_of_month,
    settings: { usd_to_tzs: fx, tax_percent: taxPct, monthly_budget_tzs: d.settings.monthly_budget_tzs },
    budget, projected_cost: projectedCost,
    now: cur,
    months: months.map(({ usage_by_service, plans, ...m }) => m),
    plans: cur.plans,
    per_job: {
      jobs: cur.jobs,
      avg_price: cur.jobs ? Math.round(cur.gross / cur.jobs) : null,
      commission: cur.jobs ? Math.round(cur.commission / cur.jobs) : null,
      usage_cost: cur.jobs ? Math.round(cur.usage_cost / cur.jobs) : null,
      margin: marginPerJob,
      fixed_cost: cur.jobs ? Math.round(cur.fixed_cost / cur.jobs) : null,
      net: cur.jobs ? Math.round(cur.net / cur.jobs) : null,
    },
    break_even_jobs: breakEven,
    by_type: byType,
    daily: { days: Array.from({ length: days }, (_, i) => i + 1), income, usage_cost: usageDaily.map(Math.round), running_profit: running, today: d.daily.today },
  };
}

module.exports = { build, list, addExpense, updateExpense, removeExpense };
