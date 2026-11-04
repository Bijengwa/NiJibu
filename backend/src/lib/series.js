// Time series for the admin charts. The admin chooses the range (from / to) and the step (minute ... year).
// Buckets are cut in Tanzania time, so "a day" is a Tanzanian day.
const db = require('../db');
const { HttpError } = require('./httpError');

const TZ = 'Africa/Dar_es_Salaam';
const UNITS = ['minute', 'hour', 'day', 'week', 'month', 'year'];
const UNIT_MS = { minute: 60e3, hour: 3600e3, day: 864e5, week: 6048e5, month: 2629746e3, year: 31556952e3 };
const AUTO_POINTS = 90; // when the step is not chosen, pick the smallest step that gives at most this many points
const MAX_POINTS = 400; // a chosen step that would give more points is made bigger
const MAX_SPAN = 11 * UNIT_MS.year;
const KEY = `'YYYY-MM-DD"T"HH24:MI:SS'`;

const bad = (msg) => new HttpError(400, 'VALIDATION', msg);

// ?from=ISO&to=ISO   or   ?last=3&unit=week (the last 3 weeks until now)   and   &bucket=auto|minute|hour|day|week|month|year
function parseRange(q = {}) {
  let to = q.to ? new Date(q.to) : new Date();
  let from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * UNIT_MS.day);
  if (q.last !== undefined || q.unit !== undefined) {
    const n = Number(q.last);
    if (!Number.isFinite(n) || n <= 0 || !UNITS.includes(q.unit)) throw bad('Say how many (a number) and the unit');
    to = new Date();
    from = new Date(to.getTime() - n * UNIT_MS[q.unit]);
  }
  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime())) throw bad('Bad date');
  if (from >= to) throw bad('The start must be before the end');
  const span = to - from;
  if (span > MAX_SPAN) throw bad('The range is too long (11 years at most)');

  const asked = UNITS.includes(q.bucket) ? q.bucket : null;
  let unit = asked || UNITS.find((u) => span / UNIT_MS[u] <= AUTO_POINTS) || 'year';
  let i = UNITS.indexOf(unit);
  while (span / UNIT_MS[UNITS[i]] > MAX_POINTS && i < UNITS.length - 1) i += 1;
  unit = UNITS[i];
  return { from, to, unit, auto: !asked, adjusted: Boolean(asked) && unit !== asked };
}

// The empty axis: one key per bucket, in Tanzania time
async function axis({ from, to, unit }) {
  const r = await db.raw(
    `select to_char(g, ${KEY}) as k from generate_series(
       date_trunc(?, ?::timestamptz at time zone ?),
       date_trunc(?, ?::timestamptz at time zone ?),
       ('1 ' || ?)::interval) g order by 1`,
    [unit, from.toISOString(), TZ, unit, to.toISOString(), TZ, unit]
  );
  return r.rows.map((x) => x.k);
}

// One source of numbers: rows of `table` whose `col` is inside the range, grouped by bucket.
//   agg: { name: 'sql aggregate' }   e.g. { gross: 'coalesce(sum(amount),0)' }
// Returns Map(key -> { name: number })
async function bucketed(range, { table, col, where, agg }) {
  const q = db(table)
    .select(db.raw(`to_char(date_trunc(?, ${col} at time zone ?), ${KEY}) as k`, [range.unit, TZ]))
    .whereBetween(col, [range.from, range.to])
    .groupByRaw('1');
  for (const [name, sql] of Object.entries(agg)) q.select(db.raw(`${sql}::bigint as "${name}"`));
  if (where) q.whereRaw(where);
  const rows = await q;
  const out = new Map();
  for (const r of rows) out.set(r.k, r);
  return out;
}

// Join several sources onto one axis. sources: [Map, names[]] ; names not found are 0.
function merge(keys, sources) {
  return keys.map((k) => {
    const row = { t: k };
    for (const [map, names] of sources) for (const n of names) row[n] = Number(map.get(k)?.[n] || 0);
    return row;
  });
}

module.exports = { parseRange, axis, bucketed, merge, TZ };
