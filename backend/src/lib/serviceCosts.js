// Cost maths for outside services. Pure functions (no database), so they are easy to test.
//
// One "line" = one service operation in one month, e.g. google_maps / places_text_search.
//   price = { currency: 'USD' | 'TZS', unit_price, percent_fee, free_units }
//   use   = { units, calls, errors, cached, amount_tzs, reported_units, reported_cost_tzs }
//     units            billable units: calls that worked and were not answered from our cache
//     reported_units   how many of those units already carry the cost the provider told us (Africa's Talking)
//     reported_cost_tzs  the sum of those provider costs, already in TZS

const toTzs = (price, value, fx) => (price.currency === 'USD' ? Number(value) * fx : Number(value));

// What a month costs, in TZS
function lineCost(price, use, fx) {
  const free = Number(price.free_units) || 0;
  const units = Number(use.units) || 0;
  const reportedUnits = Math.min(Number(use.reported_units) || 0, units);
  // The free allowance is used up first; units with a provider-reported cost are charged at that cost instead of our price
  const unpricedUnits = units - reportedUnits;
  const billableUnpriced = Math.max(0, unpricedUnits - Math.max(0, free - reportedUnits));
  const byUnit = billableUnpriced * toTzs(price, price.unit_price, fx);
  const byReport = Number(use.reported_cost_tzs) || 0;
  const byPercent = ((Number(use.amount_tzs) || 0) * (Number(price.percent_fee) || 0)) / 100;
  return Math.round(byUnit + byReport + byPercent);
}

// Straight-line forecast for the month. elapsed = days passed (can be a fraction), total = days in the month.
function project(value, elapsed, total) {
  if (!(elapsed > 0)) return 0;
  return (Number(value) || 0) * (total / elapsed);
}

// The day of the month when the free allowance runs out at today's pace (null = it will not, or there is none)
function freeRunsOutOnDay(freeUnits, units, elapsed, total) {
  if (!(freeUnits > 0) || !(units > 0) || !(elapsed > 0)) return null;
  const day = freeUnits / (units / elapsed);
  return day > total ? null : Math.max(1, Math.ceil(day));
}

const LEVELS = ['ok', 'watch', 'over'];
const worst = (a, b) => (LEVELS.indexOf(b) > LEVELS.indexOf(a) ? b : a);

// Is this operation fine, close to its free allowance, or over it?
function opVerdict({ free_units: free, unit_price: price, percent_fee: pct }, projectedUnits, projectedCost) {
  if (free > 0) {
    const ratio = projectedUnits / free;
    if (ratio > 1) return { level: 'over', text: 'Will pass the free allowance this month' };
    if (ratio >= 0.7) return { level: 'watch', text: `Will use ${Math.round(ratio * 100)}% of the free allowance` };
    return { level: 'ok', text: projectedUnits ? 'Inside the free allowance' : 'Not used yet' };
  }
  if (!Number(price) && !Number(pct)) return { level: 'ok', text: 'Free' };
  return { level: 'ok', text: projectedCost > 0 ? 'Paid by use' : 'Not used yet' };
}

// Budget check on the forecast. budget = 0 means "no budget set".
function budgetVerdict(budget, projected, actual) {
  if (!(budget > 0)) return { level: 'ok', text: 'No monthly budget set', used_pct: null };
  const pct = Math.round((actual / budget) * 100);
  if (actual >= budget) return { level: 'over', text: 'Budget already used up', used_pct: pct };
  if (projected > budget) return { level: 'over', text: 'At this pace you will pass the budget', used_pct: pct };
  if (projected >= budget * 0.8) return { level: 'watch', text: 'Close to the budget at this pace', used_pct: pct };
  return { level: 'ok', text: 'Inside the budget', used_pct: pct };
}

// "2026-11" -> { key, y, m, start, end, days }. Months follow Dar es Salaam time (UTC+3, no daylight saving).
const DAR_MS = 3 * 3600e3;
function monthRange(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  const now = new Date(Date.now() + DAR_MS);
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
  if (mo < 0 || mo > 11) return monthRange(null);
  return {
    key: `${y}-${String(mo + 1).padStart(2, '0')}`, y, m: mo,
    start: new Date(Date.UTC(y, mo, 1) - DAR_MS),
    end: new Date(Date.UTC(y, mo + 1, 1) - DAR_MS),
    days: new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(),
  };
}

// Days of this month that have passed (a fraction), or the whole month when it is over
function elapsedDays(range, nowMs = Date.now()) {
  const done = Math.min(Math.max(nowMs - range.start.getTime(), 0), range.end.getTime() - range.start.getTime());
  return done / 86400e3;
}

// Plain advice from the numbers. Short, concrete, and only when there is something to say.
function advice(service, ctx) {
  const out = [];
  const { lines, projectedTotal, worstLevel } = ctx;
  if (service === 'google_maps') {
    const over = lines.filter((l) => l.verdict.level === 'over');
    if (over.length) {
      out.push(`Above the free allowance: ${over.map((l) => l.label).join(', ')}. Extra cost this month is about ${Math.round(ctx.projectedCost).toLocaleString('en-US')} TZS.`);
      out.push('To bring it down: start the place search only after 4 or more letters, keep answers in the cache longer, or use OpenStreetMap for search (PLACES_PROVIDER=osm).');
      out.push('If it stays high every month, compare it with the monthly plans on Google\'s pricing page before you pay per call.');
    } else if (worstLevel === 'watch') {
      out.push('Getting close to the free allowance. Nothing to pay yet; watch it weekly.');
    } else if (projectedTotal === 0) {
      out.push('No Google cost expected this month. The free allowance is enough.');
    }
    if (ctx.cacheShare !== null && ctx.cacheShare < 0.1 && ctx.calls > 200) out.push('Few answers come from the cache. A longer cache would save calls.');
  }
  if (service === 'africastalking') {
    if (ctx.topTag) out.push(`Most SMS are "${ctx.topTag.name}" (${ctx.topTag.share}%). Cut the ones people do not need.`);
    if (ctx.failRate > 0.05) out.push(`${Math.round(ctx.failRate * 100)}% of SMS failed. Check the API key, sender ID and balance.`);
    if (projectedTotal > 0 && ctx.costPerJob > 0) out.push(`SMS cost about ${Math.round(ctx.costPerJob).toLocaleString('en-US')} TZS for each finished job.`);
  }
  if (service === 'selcom' && ctx.commission > 0) {
    out.push(`Selcom fees are about ${Math.round((ctx.cost / ctx.commission) * 100)}% of the commission NiJibu kept this month.`);
  }
  return out;
}

module.exports = { lineCost, project, freeRunsOutOnDay, opVerdict, budgetVerdict, worst, monthRange, elapsedDays, advice, toTzs };
