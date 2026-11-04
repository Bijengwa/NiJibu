// The "Services" page of the admin: what NiJibu used from outside services this month, what it cost, and what to do about it.
const db = require('../db');
const costs = require('../lib/serviceCosts');
const { HttpError } = require('../lib/httpError');

const LABELS = {
  google_maps: 'Google Maps',
  osm: 'OpenStreetMap',
  osrm: 'OSRM routes',
  africastalking: "Africa's Talking SMS",
  whatsapp: 'WhatsApp',
  selcom: 'Selcom payments',
  expo_push: 'Push notifications',
};
const ORDER = Object.keys(LABELS);
const TZ = 'Africa/Dar_es_Salaam';

const DEFAULTS = { usd_to_tzs: 2600, monthly_budget_tzs: 0, profit_target_per_job: 2000, tax_percent: 0 };

async function settings() {
  const rows = await db('service_settings').select('key', 'value');
  const out = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) out[r.key] = Number(r.value);
  return out;
}

// Usage of a time range, per service / operation (and per day when `daily`)
function usageQuery(from, to, { daily = false, monthly = false } = {}) {
  const q = db('service_usage').where('created_at', '>=', from).where('created_at', '<', to);
  const sel = [
    'service', 'operation',
    db.raw('count(*)::int as calls'),
    db.raw('count(*) filter (where not ok)::int as errors'),
    db.raw('count(*) filter (where cached)::int as cached'),
    db.raw('coalesce(sum(units) filter (where ok and not cached), 0)::int as units'),
    db.raw('coalesce(sum(amount_tzs) filter (where ok and not cached), 0)::bigint as amount_tzs'),
    db.raw("coalesce(sum(units) filter (where ok and not cached and reported_cost is not null and reported_currency in ('TZS','USD')), 0)::int as reported_units"),
    db.raw("coalesce(sum(reported_cost) filter (where ok and not cached and reported_currency = 'TZS'), 0)::float as rep_tzs"),
    db.raw("coalesce(sum(reported_cost) filter (where ok and not cached and reported_currency = 'USD'), 0)::float as rep_usd"),
    db.raw('coalesce(avg(ms), 0)::int as avg_ms'),
  ];
  const groups = ['service', 'operation'];
  if (daily) {
    sel.push(db.raw(`extract(day from (created_at at time zone '${TZ}'))::int as day`));
    groups.push(db.raw(`extract(day from (created_at at time zone '${TZ}'))`));
  }
  if (monthly) {
    sel.push(db.raw(`to_char(created_at at time zone '${TZ}', 'YYYY-MM') as month`));
    groups.push(db.raw(`to_char(created_at at time zone '${TZ}', 'YYYY-MM')`));
  }
  return q.select(sel).groupBy(groups);
}

// Add usage rows together into the shape lineCost() wants
function sumUse(rows, fx) {
  const u = { units: 0, calls: 0, errors: 0, cached: 0, amount_tzs: 0, reported_units: 0, reported_cost_tzs: 0, ms_sum: 0 };
  for (const r of rows) {
    u.units += r.units; u.calls += r.calls; u.errors += r.errors; u.cached += r.cached;
    u.amount_tzs += Number(r.amount_tzs); u.reported_units += r.reported_units;
    u.reported_cost_tzs += r.rep_tzs + r.rep_usd * fx;
    u.ms_sum += r.avg_ms * r.calls;
  }
  return u;
}

async function build(monthKey) {
  const range = costs.monthRange(monthKey);
  const cfg = await settings();
  const fx = cfg.usd_to_tzs;
  const prices = await db('service_prices').select('*');
  const priceOf = new Map(prices.map((p) => [`${p.service}/${p.operation}`, p]));
  const isCurrent = Date.now() >= range.start.getTime() && Date.now() < range.end.getTime();
  const elapsed = Math.max(costs.elapsedDays(range), 0.01);
  const total = range.days;

  const [dailyRows, tagRows, jobRow, commRow] = await Promise.all([
    usageQuery(range.start, range.end, { daily: true }),
    db('service_usage').where({ service: 'africastalking', operation: 'sms' }).where('created_at', '>=', range.start).where('created_at', '<', range.end).whereNotNull('tag')
      .groupBy('tag').select('tag', db.raw('sum(units)::int as units')).orderBy('units', 'desc'),
    db('requests').where({ status: 'completed' }).where('completed_at', '>=', range.start).where('completed_at', '<', range.end).count({ n: '*' }).first(),
    db('payments').where({ status: 'paid' }).where('paid_at', '>=', range.start).where('paid_at', '<', range.end).sum({ fee: 'fee', gross: 'amount' }).first(),
  ]);
  const jobs = Number(jobRow.n || 0);
  const commission = Number(commRow.fee || 0);

  // Group rows per service -> operation
  const per = new Map();
  for (const r of dailyRows) {
    const key = `${r.service}/${r.operation}`;
    if (!per.has(key)) per.set(key, { service: r.service, operation: r.operation, rows: [] });
    per.get(key).rows.push(r);
  }
  // A price row with no usage still shows (so the page lists everything that can cost money)
  for (const p of prices) if (!per.has(`${p.service}/${p.operation}`)) per.set(`${p.service}/${p.operation}`, { service: p.service, operation: p.operation, rows: [] });

  const byService = new Map();
  const dayCost = {}; // service -> [daily cost in TZS], via cumulative cost so the free allowance is spent in order
  const dayUnits = {};
  for (const e of per.values()) {
    const price = priceOf.get(`${e.service}/${e.operation}`) || { currency: 'TZS', unit_price: 0, percent_fee: 0, free_units: 0, label: e.operation, verified: false };
    const use = sumUse(e.rows, fx);
    const cost = costs.lineCost(price, use, fx);
    const projUnits = isCurrent ? costs.project(use.units, elapsed, total) : use.units;
    const projUse = isCurrent
      ? { ...use, units: projUnits, amount_tzs: costs.project(use.amount_tzs, elapsed, total), reported_units: costs.project(use.reported_units, elapsed, total), reported_cost_tzs: costs.project(use.reported_cost_tzs, elapsed, total) }
      : use;
    const projCost = costs.lineCost(price, projUse, fx);
    const free = Number(price.free_units) || 0;

    // Day by day (cumulative cost, then the difference)
    const cum = { units: 0, amount_tzs: 0, reported_units: 0, reported_cost_tzs: 0 };
    const costs_d = dayCost[e.service] || (dayCost[e.service] = Array(total).fill(0));
    const units_d = dayUnits[e.service] || (dayUnits[e.service] = Array(total).fill(0));
    let prev = 0;
    for (let d = 1; d <= total; d++) {
      const rows = e.rows.filter((r) => r.day === d);
      if (rows.length) {
        const s = sumUse(rows, fx);
        cum.units += s.units; cum.amount_tzs += s.amount_tzs; cum.reported_units += s.reported_units; cum.reported_cost_tzs += s.reported_cost_tzs;
        units_d[d - 1] += s.calls;
      }
      const c = costs.lineCost(price, cum, fx);
      costs_d[d - 1] += c - prev;
      prev = c;
    }

    const line = {
      operation: e.operation, label: price.label, currency: price.currency, unit_price: Number(price.unit_price), percent_fee: Number(price.percent_fee),
      free_units: free, verified: Boolean(price.verified), note: price.note || null,
      calls: use.calls, errors: use.errors, cached: use.cached, units: use.units,
      avg_ms: use.calls ? Math.round(use.ms_sum / use.calls) : 0,
      free_used_pct: free > 0 ? Math.round((use.units / free) * 100) : null,
      billable_units: Math.max(0, use.units - free),
      cost_tzs: cost,
      projected_units: Math.round(projUnits),
      projected_cost_tzs: projCost,
      runs_out_day: isCurrent ? costs.freeRunsOutOnDay(free, use.units, elapsed, total) : null,
      verdict: costs.opVerdict(price, projUnits, projCost),
    };
    if (!byService.has(e.service)) byService.set(e.service, []);
    byService.get(e.service).push(line);
  }

  const smsCalls = (byService.get('africastalking') || []).reduce((n, l) => n + l.calls, 0);
  const smsErrors = (byService.get('africastalking') || []).reduce((n, l) => n + l.errors, 0);
  const smsUnits = tagRows.reduce((n, t) => n + t.units, 0);

  const services = [];
  for (const key of [...ORDER, ...[...byService.keys()].filter((k) => !ORDER.includes(k))]) {
    const lines = byService.get(key);
    if (!lines) continue;
    const cost = lines.reduce((n, l) => n + l.cost_tzs, 0);
    const projected = lines.reduce((n, l) => n + l.projected_cost_tzs, 0);
    const calls = lines.reduce((n, l) => n + l.calls, 0);
    const cached = lines.reduce((n, l) => n + l.cached, 0);
    const worstLevel = lines.reduce((w, l) => costs.worst(w, l.verdict.level), 'ok');
    const first = tagRows[0];
    services.push({
      service: key, label: LABELS[key] || key, calls, errors: lines.reduce((n, l) => n + l.errors, 0), cached,
      cost_tzs: cost, projected_cost_tzs: projected, level: worstLevel,
      lines: lines.sort((a, b) => b.cost_tzs - a.cost_tzs || b.calls - a.calls),
      advice: costs.advice(key, {
        lines, worstLevel, projectedTotal: projected, projectedCost: projected, cost, calls,
        cacheShare: calls + cached > 0 ? cached / (calls + cached) : null,
        topTag: key === 'africastalking' && first && smsUnits ? { name: first.tag, share: Math.round((first.units / smsUnits) * 100) } : null,
        failRate: key === 'africastalking' && smsCalls ? smsErrors / smsCalls : 0,
        costPerJob: jobs ? cost / jobs : 0, commission,
      }),
    });
  }

  const totalCost = services.reduce((n, s) => n + s.cost_tzs, 0);
  const totalProjected = services.reduce((n, s) => n + s.projected_cost_tzs, 0);
  const budget = costs.budgetVerdict(cfg.monthly_budget_tzs, totalProjected, totalCost);

  // Last 6 months, each priced with its own free allowances
  const from6 = new Date(Date.UTC(range.y, range.m - 5, 1) - 3 * 3600e3);
  const hist = await usageQuery(from6, range.end, { monthly: true });
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(range.y, range.m - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const by = {};
    let sum = 0;
    for (const p of prices) {
      const rows = hist.filter((r) => r.month === key && r.service === p.service && r.operation === p.operation);
      if (!rows.length) continue;
      const c = costs.lineCost(p, sumUse(rows, fx), fx);
      by[p.service] = (by[p.service] || 0) + c;
      sum += c;
    }
    months.push({ month: key, cost_tzs: sum, by_service: by });
  }

  return {
    month: range.key, is_current: isCurrent, days_in_month: total, day_of_month: Math.min(total, Math.ceil(elapsed)),
    settings: cfg,
    totals: { cost_tzs: totalCost, projected_cost_tzs: totalProjected, budget_tzs: cfg.monthly_budget_tzs, budget },
    per_job: {
      completed_jobs: jobs, commission_tzs: commission,
      cost_per_job_tzs: jobs ? Math.round(totalCost / jobs) : null,
      commission_per_job_tzs: jobs ? Math.round(commission / jobs) : null,
      profit_per_job_tzs: jobs ? Math.round((commission - totalCost) / jobs) : null,
      target_per_job_tzs: cfg.profit_target_per_job,
    },
    services,
    daily: {
      days: Array.from({ length: total }, (_, i) => i + 1),
      cost_by_service: dayCost,
      calls_by_service: dayUnits,
      today: isCurrent ? Math.ceil(elapsed) : null,
    },
    months,
  };
}

// ---- editing prices and settings ----
const num = (v, { min = 0, max = 1e9 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, 'VALIDATION', 'Check the numbers');
  return n;
};

async function savePrice(service, operation, b) {
  const cur = await db('service_prices').where({ service, operation }).first();
  if (!cur) throw new HttpError(404, 'NOT_FOUND', 'Unknown service');
  const patch = { updated_at: db.fn.now() };
  if (b.currency !== undefined) {
    if (!['USD', 'TZS'].includes(b.currency)) throw new HttpError(400, 'VALIDATION', 'Currency must be USD or TZS');
    patch.currency = b.currency;
  }
  if (b.unit_price !== undefined) patch.unit_price = num(b.unit_price, { max: 1e7 });
  if (b.percent_fee !== undefined) patch.percent_fee = num(b.percent_fee, { max: 100 });
  if (b.free_units !== undefined) patch.free_units = Math.round(num(b.free_units, { max: 1e9 }));
  if (b.verified !== undefined) patch.verified = b.verified === true;
  // The admin typed the price: it is theirs now, no longer our placeholder
  if (b.unit_price !== undefined || b.percent_fee !== undefined) patch.verified = b.verified === false ? false : true;
  await db('service_prices').where({ service, operation }).update(patch);
}

async function saveSettings(b) {
  const rules = { usd_to_tzs: { min: 1, max: 100000 }, monthly_budget_tzs: { max: 1e12 }, profit_target_per_job: { max: 1e7 }, tax_percent: { max: 100 } };
  for (const [key, rule] of Object.entries(rules)) {
    if (b[key] === undefined) continue;
    const value = String(Math.round(num(b[key], rule) * 100) / 100);
    await db('service_settings').insert({ key, value }).onConflict('key').merge({ value });
  }
}

module.exports = { build, savePrice, saveSettings, settings, LABELS };
