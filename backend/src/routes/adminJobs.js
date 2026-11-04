// Admin: jobs (registered, requested but missing, worker suggestions) and the dashboard summary.
// Mounted inside routes/admin.js, so requireAuth + the staff gate already ran.
const router = require('express').Router();
const db = require('../db');
const { notify } = require('../services/notify');
const { normalizeQuery } = require('../lib/text');
const { findOrCreateJob, wordsOf, uniqueSlug } = require('../lib/jobs');
const { SUPER, SUPPORT, STAFF } = require('../lib/roles');

const DAY = 24 * 60 * 60 * 1000;
const bad = (res) => res.status(400).json({ error: 'Bad request', code: 'VALIDATION' });
const clampDays = (v, def = 30) => Math.min(90, Math.max(1, Number(v) || def));
const cleanName = (v) => (typeof v === 'string' && v.trim() && v.trim().length <= 80 ? v.trim().replace(/\s+/g, ' ') : null);
const slugify = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const byService = (rows) => new Map(rows.map((r) => [r.service_id, r]));
const trend = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);

// Existing jobs that may be the same as a typed word: shares a whole word, or one contains the other
function similarJobs(services, norm) {
  const tokens = norm.split(' ').filter((t) => t.length >= 3);
  return services
    .filter((s) => [s.name_sw, s.name_en, ...(s.aliases || [])].some((w) => {
      const n = normalizeQuery(w);
      return n && (n.includes(norm) || norm.includes(n) || tokens.some((t) => n.split(' ').includes(t)));
    }))
    .slice(0, 3)
    .map((s) => ({ id: s.id, name_sw: s.name_sw, name_en: s.name_en }));
}

// ---------------------------------------------------------------- 1) Registered jobs
router.get('/jobs/registered', async (req, res, next) => {
  try {
    const days = clampDays(req.query.days);
    const since = new Date(Date.now() - days * DAY);
    const before = new Date(Date.now() - 2 * days * DAY);
    const [services, searches, prev, reqs, provs, money, linkedRows] = await Promise.all([
      db('services').where({ status: 'approved' }).orderBy('name_en').select('id', 'slug', 'name_sw', 'name_en', 'active', 'aliases', 'created_at'),
      db('search_logs').where('created_at', '>=', since).groupBy('service_id')
        .select('service_id', db.raw('count(*)::int as searches'), db.raw('count(distinct user_id)::int as people'), db.raw('count(*) filter (where providers_found = 0)::int as no_provider')),
      db('search_logs').where('created_at', '>=', before).where('created_at', '<', since).groupBy('service_id')
        .select('service_id', db.raw('count(*)::int as searches')),
      db('requests').where('created_at', '>=', since).groupBy('service_id')
        .select('service_id', db.raw('count(*)::int as requests'), db.raw("count(*) filter (where status = 'completed')::int as completed")),
      db('provider_services as ps').join('provider_profiles as p', 'p.id', 'ps.provider_id')
        .where('p.verification_status', 'verified').groupBy('ps.service_id')
        .select('ps.service_id', db.raw('count(*)::int as providers'), db.raw('count(*) filter (where p.is_online)::int as online')),
      db('payments as pay').join('requests as r', 'r.id', 'pay.request_id')
        .where('pay.status', 'paid').where('pay.paid_at', '>=', since).groupBy('r.service_id')
        .select('r.service_id', db.raw('coalesce(avg(pay.amount), 0)::int as avg_price'), db.raw('coalesce(sum(pay.fee), 0)::int as earned')),
      db('provider_services').groupBy('service_id').select('service_id', db.raw('count(*)::int as linked')),
    ]);
    const S = byService(searches), P = byService(prev), R = byService(reqs), V = byService(provs), M = byService(money), L = byService(linkedRows);
    const items = services.map((s) => {
      const se = S.get(s.id)?.searches ?? 0;
      return {
        ...s,
        searches: se,
        people: S.get(s.id)?.people ?? 0,
        searches_trend: trend(se, P.get(s.id)?.searches ?? 0),
        no_provider: S.get(s.id)?.no_provider ?? 0,
        requests: R.get(s.id)?.requests ?? 0,
        completed: R.get(s.id)?.completed ?? 0,
        providers: V.get(s.id)?.providers ?? 0,
        providers_online: V.get(s.id)?.online ?? 0,
        workers_linked: L.get(s.id)?.linked ?? 0, // every worker who chose this job (they are told when it is renamed)
        avg_price: M.get(s.id)?.avg_price ?? 0,
        earned: M.get(s.id)?.earned ?? 0,
      };
    });
    items.sort((a, b) => b.searches - a.searches || a.name_en.localeCompare(b.name_en));
    res.json({ days, items });
  } catch (err) {
    next(err);
  }
});

// Register a new job by hand (the admin does not have to wait for a customer search or a worker suggestion)
router.post('/services', async (req, res, next) => {
  try {
    const name_sw = cleanName(req.body?.name_sw);
    const name_en = cleanName(req.body?.name_en);
    if (!name_sw || !name_en) return bad(res);
    const extra = Array.isArray(req.body?.aliases) ? req.body.aliases.slice(0, 40) : [];
    let service;
    await db.transaction(async (trx) => {
      await assertNameFree(trx, name_sw, name_en, 0);
      // A worker may have written the same job already (pending): then registering it approves that job
      const pendingJob = (await trx('services').where({ status: 'pending' }))
        .find((s) => wordsOf(s).some((w) => w === normalizeQuery(name_sw) || w === normalizeQuery(name_en)));
      if (pendingJob) {
        [service] = await trx('services').where({ id: pendingJob.id }).update({ name_sw, name_en, status: 'approved', active: true }).returning('*');
        await trx('service_suggestions').where({ service_id: service.id, status: 'pending' }).update({ status: 'added', handled_at: db.fn.now() });
      } else {
        const slug = await uniqueSlug(trx, name_en);
        [service] = await trx('services').insert({ slug, name_sw, name_en }).returning('*');
      }
      await addAliases(trx, service.id, [name_sw, name_en, ...extra.map(String)]);
      service = await trx('services').where({ id: service.id }).first();
    });
    res.status(201).json({ service });
  } catch (err) {
    next(err);
  }
});

// Edit a job: switch on/off, rename, or change its other words.
// A rename changes the name everywhere at once (the workers and requests point to the job, not to the name).
// The old names stay as search words, so customers who type the old name still find the job.
// Every worker who chose the job gets a notification and an SMS.
router.patch('/services/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res);
    const patch = {};
    if (typeof req.body?.active === 'boolean') patch.active = req.body.active;
    if (req.body?.name_sw !== undefined) { patch.name_sw = cleanName(req.body.name_sw); if (!patch.name_sw) return bad(res); }
    if (req.body?.name_en !== undefined) { patch.name_en = cleanName(req.body.name_en); if (!patch.name_en) return bad(res); }
    if (req.body?.aliases !== undefined) {
      if (!Array.isArray(req.body.aliases) || req.body.aliases.length > 40) return bad(res);
      patch.aliases = [...new Set(req.body.aliases.map((a) => String(a).trim().toLowerCase().slice(0, 60)).filter((a) => a.length >= 2))];
    }
    if (!Object.keys(patch).length) return bad(res);

    let service, renamed = null;
    await db.transaction(async (trx) => {
      const before = await trx('services').where({ id }).first();
      if (!before) throw Object.assign(new Error('Not found'), { status: 404, code: 'NOT_FOUND', expose: true });
      const sw = patch.name_sw ?? before.name_sw;
      const en = patch.name_en ?? before.name_en;
      if (sw !== before.name_sw || en !== before.name_en) {
        if (before.status === 'approved') await assertNameFree(trx, sw, en, id);
        renamed = { old_sw: before.name_sw, old_en: before.name_en, new_sw: sw, new_en: en };
        // keep the old names as search words
        const keep = patch.aliases ?? before.aliases ?? [];
        patch.aliases = [...new Set([...keep, renamed.old_sw, renamed.old_en].map((a) => String(a).trim().toLowerCase()).filter((a) => a.length >= 2))].slice(0, 40);
      }
      [service] = await trx('services').where({ id }).update(patch).returning('*');
    });

    // Tell the workers (after the change is saved; one failed message never undoes the rename)
    let workers_notified = 0;
    if (renamed) {
      const rows = await db('provider_services as ps')
        .join('provider_profiles as p', 'p.id', 'ps.provider_id')
        .join('users as u', 'u.id', 'p.user_id')
        .where('ps.service_id', id)
        .select('u.id as user_id', 'u.language');
      for (const w of rows) {
        const en = w.language === 'en';
        const oldName = en ? renamed.old_en : renamed.old_sw;
        const newName = en ? renamed.new_en : renamed.new_sw;
        try {
          await notify(
            w.user_id, 'job_renamed',
            en ? 'Your job was renamed' : 'Jina la kazi yako limebadilishwa',
            en ? `"${oldName}" is now called "${newName}". Your profile keeps the job.` : `"${oldName}" sasa inaitwa "${newName}". Kazi yako inabaki kwenye wasifu wako.`,
            { ...renamed, old: `${renamed.old_sw} / ${renamed.old_en}`, new: `${renamed.new_sw} / ${renamed.new_en}` }
          );
          workers_notified += 1;
        } catch (e) {
          console.warn('[admin] rename notice failed for user', w.user_id, e.message);
        }
      }
    }
    res.json({ service, renamed: !!renamed, workers_notified });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- 2) Requested but not registered
// Pending worker suggestions as { normalized -> distinct providers }
async function suggestionSupply() {
  const rows = await db('service_suggestions').where({ status: 'pending' }).select('name', 'name_sw', 'name_en', 'provider_id');
  const m = new Map();
  for (const r of rows) {
    for (const k of new Set([r.name, r.name_sw, r.name_en].map(normalizeQuery).filter(Boolean))) {
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(r.provider_id);
    }
  }
  return m;
}

router.get('/jobs/missing', async (req, res, next) => {
  try {
    const days = clampDays(req.query.days);
    const since = new Date(Date.now() - days * DAY);
    const before = new Date(Date.now() - 2 * days * DAY);
    const [rows, prev, supply, services] = await Promise.all([
      db('search_misses').where({ status: 'open' }).where('created_at', '>=', since).select('user_id', 'query', 'normalized', 'lat', 'lng', 'created_at'),
      db('search_misses').where('created_at', '>=', before).where('created_at', '<', since).groupBy('normalized')
        .select('normalized', db.raw('count(*)::int as n')),
      suggestionSupply(),
      db('services').where({ active: true, status: 'approved' }).select('id', 'name_sw', 'name_en', 'aliases'),
    ]);
    const prevN = new Map(prev.map((r) => [r.normalized, r.n]));

    const groups = new Map();
    for (const r of rows) {
      let g = groups.get(r.normalized);
      if (!g) groups.set(r.normalized, (g = { normalized: r.normalized, searches: 0, users: new Set(), perUser: new Map(), queries: new Map(), last_seen: r.created_at, cells: new Map() }));
      g.searches += 1;
      if (r.user_id) { g.users.add(r.user_id); g.perUser.set(r.user_id, (g.perUser.get(r.user_id) || 0) + 1); }
      g.queries.set(r.query, (g.queries.get(r.query) || 0) + 1);
      if (r.created_at > g.last_seen) g.last_seen = r.created_at;
      if (r.lat !== null && r.lng !== null) {
        const key = `${r.lat.toFixed(2)},${r.lng.toFixed(2)}`;
        g.cells.set(key, (g.cells.get(key) || 0) + 1);
      }
    }

    const similarTo = (norm) => similarJobs(services, norm);

    const items = [...groups.values()].map((g) => {
      const workers = supply.get(g.normalized)?.size ?? 0;
      return {
        normalized: g.normalized,
        query: [...g.queries.entries()].sort((a, b) => b[1] - a[1])[0][0],
        spellings: [...g.queries.keys()].slice(0, 6),
        searches: g.searches,
        customers: g.users.size,
        repeat_people: [...g.perUser.values()].filter((n) => n >= 2).length, // searched the same word again (the first time failed)
        trend: trend(g.searches, prevN.get(g.normalized) ?? 0),
        last_seen: g.last_seen,
        areas: [...g.cells.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => {
          const [lat, lng] = k.split(',').map(Number);
          return { lat, lng, searches: n };
        }),
        workers, // fundis who wrote this job in "Kazi yako haipo kwenye orodha"
        action: workers > 0 ? 'add' : 'recruit', // customers + workers: add now. Customers only: find workers.
        similar: similarTo(g.normalized),
      };
    });
    items.sort((a, b) => b.searches - a.searches);
    res.json({ days, items });
  } catch (err) {
    next(err);
  }
});

// Closes every open miss with this spelling. Returns the customers who searched it.
async function closeMisses(trx, normalized, status, serviceId) {
  const rows = await trx('search_misses').where({ status: 'open', normalized }).select('id', 'user_id', 'query');
  if (!rows.length) return { users: [], queries: [] };
  await trx('search_misses').whereIn('id', rows.map((r) => r.id)).update({ status, service_id: serviceId ?? null, handled_at: db.fn.now() });
  return { users: [...new Set(rows.map((r) => r.user_id).filter(Boolean))], queries: [...new Set(rows.map((r) => r.query.toLowerCase()))] };
}

const wordList = (v) => (Array.isArray(v) ? v.slice(0, 40).map((w) => String(w)) : []);

async function addAliases(trx, serviceId, words) {
  const s = await trx('services').where({ id: serviceId }).first('aliases');
  const merged = [...new Set([...(s?.aliases || []), ...words.map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2)])].slice(0, 40);
  await trx('services').where({ id: serviceId }).update({ aliases: merged });
}

// Same word, another name: link it to an existing job so the next search finds it
router.post('/jobs/missing/merge', async (req, res, next) => {
  try {
    const normalized = normalizeQuery(req.body?.normalized);
    const serviceId = Number(req.body?.service_id);
    if (!normalized || !Number.isInteger(serviceId)) return bad(res);
    let service, closed;
    await db.transaction(async (trx) => {
      service = await trx('services').where({ id: serviceId }).first('id', 'name_sw', 'name_en');
      if (!service) throw Object.assign(new Error('Not found'), { status: 404, code: 'NOT_FOUND', expose: true });
      closed = await closeMisses(trx, normalized, 'merged', serviceId);
      await addAliases(trx, serviceId, [normalized, ...closed.queries, ...wordList(req.body?.aliases)]);
    });
    for (const uid of closed.users) await notify(uid, 'job_available', 'Service available', `${service.name_en} is available. Search again to find it.`);
    res.json({ ok: true, customers_notified: closed.users.length });
  } catch (err) {
    next(err);
  }
});

// New job from a missing search. Workers who wrote the same job are linked to it too.
router.post('/jobs/missing/add', async (req, res, next) => {
  try {
    const normalized = normalizeQuery(req.body?.normalized);
    const name_sw = cleanName(req.body?.name_sw);
    const name_en = cleanName(req.body?.name_en);
    const slug = slugify(req.body?.slug || name_en || '');
    if (!normalized || !name_sw || !name_en || !slug) return bad(res);
    let service, closed;
    const linked = [];
    await db.transaction(async (trx) => {
      // Workers may have written this job already: then it exists as a pending job, and adding approves it
      const pendingJob = (await trx('services').where({ status: 'pending' })).find((s) => wordsOf(s).includes(normalized));
      if (pendingJob) {
        await assertNameFree(trx, name_sw, name_en, pendingJob.id);
        await trx('services').where({ id: pendingJob.id }).update({ name_sw, name_en, status: 'approved', active: true });
        service = { ...pendingJob, name_sw, name_en, status: 'approved' };
      } else {
        if (await trx('services').where({ slug }).first('id')) {
          throw Object.assign(new Error('A job with this name already exists'), { status: 409, code: 'EXISTS', expose: true });
        }
        await assertNameFree(trx, name_sw, name_en, 0);
        [service] = await trx('services').insert({ slug, name_sw, name_en }).returning('*');
      }
      closed = await closeMisses(trx, normalized, 'added', service.id);
      const sugs = (await trx('service_suggestions').where({ status: 'pending' })).filter((g) => g.service_id === service.id || normalizeQuery(g.name) === normalized);
      for (const g of sugs) {
        await trx('provider_services')
          .insert({ provider_id: g.provider_id, service_id: service.id, experience: g.experience, availability: g.availability })
          .onConflict(['provider_id', 'service_id']).ignore();
        await trx('service_suggestions').where({ id: g.id }).update({ status: 'added', service_id: service.id, handled_at: db.fn.now() });
        linked.push(g.provider_id);
      }
      await addAliases(trx, service.id, [normalized, ...closed.queries, ...sugs.map((g) => g.name), ...wordList(req.body?.aliases)]);
    });
    for (const uid of closed.users) await notify(uid, 'job_available', 'New service available', `${service.name_en} is now on NiJibu. Search again to find it.`);
    const pUsers = linked.length ? await db('provider_profiles').whereIn('id', linked).pluck('user_id') : [];
    for (const uid of pUsers) await notify(uid, 'job_added', 'Your job was added', 'The job you wrote is now in the list and linked to your profile.');
    res.status(201).json({ service, customers_notified: closed.users.length, providers_linked: linked.length });
  } catch (err) {
    next(err);
  }
});

router.post('/jobs/missing/ignore', async (req, res, next) => {
  try {
    const normalized = normalizeQuery(req.body?.normalized);
    if (!normalized) return bad(res);
    await db.transaction((trx) => closeMisses(trx, normalized, 'ignored', null));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- 3) Jobs written by workers (pending jobs)
// Another approved job with the same name must not exist: the admin should merge instead.
async function assertNameFree(trx, name_sw, name_en, exceptId) {
  const names = new Set([normalizeQuery(name_sw), normalizeQuery(name_en)]);
  const others = await trx('services').where({ status: 'approved' }).whereNot({ id: exceptId }).select('name_sw', 'name_en');
  if (others.some((o) => names.has(normalizeQuery(o.name_sw)) || names.has(normalizeQuery(o.name_en)))) {
    throw Object.assign(new Error('A job with this name already exists. Merge it instead.'), { status: 409, code: 'EXISTS', expose: true });
  }
}

// The pending job a suggestion belongs to (older suggestions without one get a pending job now)
async function jobOf(trx, s) {
  if (s.service_id) return trx('services').where({ id: s.service_id }).first();
  const { service } = await findOrCreateJob(trx, { name_sw: s.name_sw || s.name, name_en: s.name_en || s.name });
  await trx('service_suggestions').where({ id: s.id }).update({ service_id: service.id });
  return service;
}

// Pending jobs grouped by job: who wrote it, how many customers searched it, which approved jobs look the same
router.get('/suggestions', async (req, res, next) => {
  try {
    const status = ['pending', 'added', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const [rows, misses, services] = await Promise.all([
      db('service_suggestions as g')
        .join('provider_profiles as p', 'p.id', 'g.provider_id')
        .join('users as u', 'u.id', 'p.user_id')
        .where('g.status', status)
        .orderBy('g.created_at')
        .select('g.id', 'g.name', 'g.name_sw', 'g.name_en', 'g.experience', 'g.availability', 'g.created_at', 'g.service_id',
          'p.id as provider_id', 'p.verification_status', 'u.name as provider_name', 'u.phone'),
      db('search_misses').where({ status: 'open' }).groupBy('normalized').select('normalized', db.raw('count(*)::int as n')),
      db('services').where({ active: true, status: 'approved' }).select('id', 'name_sw', 'name_en', 'aliases'),
    ]);
    const searched = new Map(misses.map((m) => [m.normalized, m.n]));
    const groups = new Map();
    for (const r of rows) {
      const k = r.service_id ? `s${r.service_id}` : `n${normalizeQuery(r.name)}`;
      if (!groups.has(k)) {
        groups.set(k, { service_id: r.service_id, name: r.name_en || r.name, name_sw: r.name_sw || r.name, name_en: r.name_en || r.name, count: 0, first_id: r.id, created_at: r.created_at, providers: [] });
      }
      const g = groups.get(k);
      g.count += 1;
      g.providers.push({ suggestion_id: r.id, provider_id: r.provider_id, name: r.provider_name, phone: r.phone, verified: r.verification_status === 'verified', experience: r.experience, availability: r.availability });
    }
    const ids = [...groups.values()].map((g) => g.service_id).filter(Boolean);
    const used = ids.length ? await db('requests').whereIn('service_id', ids).groupBy('service_id').select('service_id', db.raw('count(*)::int as n')) : [];
    const usedBy = new Map(used.map((u) => [u.service_id, u.n]));
    for (const g of groups.values()) {
      const norms = [...new Set([normalizeQuery(g.name_en), normalizeQuery(g.name_sw)].filter(Boolean))];
      g.searches = norms.reduce((n, k) => n + (searched.get(k) || 0), 0); // customers who typed the same word
      g.requests = usedBy.get(g.service_id) || 0; // requests already made for this pending job
      g.similar = similarJobs(services, normalizeQuery(g.name_en));
    }
    res.json({ items: [...groups.values()].sort((a, b) => b.count - a.count || b.searches - a.searches) });
  } catch (err) {
    next(err);
  }
});

// Approve: the pending job becomes a normal job with the names the admin confirms.
router.post('/suggestions/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const name_sw = cleanName(req.body?.name_sw);
    const name_en = cleanName(req.body?.name_en);
    if (!Number.isInteger(id) || !name_sw || !name_en) return bad(res);
    let service, providerIds = [], closed = { users: [] };
    await db.transaction(async (trx) => {
      const s = await trx('service_suggestions').where({ id, status: 'pending' }).first();
      if (!s) throw Object.assign(new Error('Not found'), { status: 404, code: 'NOT_FOUND', expose: true });
      service = await jobOf(trx, s);
      if (!service || service.status !== 'pending') throw Object.assign(new Error('This job is not waiting any more'), { status: 409, code: 'NOT_PENDING', expose: true });
      await assertNameFree(trx, name_sw, name_en, service.id);
      const same = await trx('service_suggestions').where({ status: 'pending', service_id: service.id });
      providerIds = same.map((g) => g.provider_id);
      await trx('service_suggestions').whereIn('id', same.map((g) => g.id)).update({ status: 'added', handled_at: db.fn.now() });
      await trx('services').where({ id: service.id }).update({ name_sw, name_en, status: 'approved', active: true });
      const a = await closeMisses(trx, normalizeQuery(name_en), 'added', service.id);
      const b = normalizeQuery(name_sw) !== normalizeQuery(name_en) ? await closeMisses(trx, normalizeQuery(name_sw), 'added', service.id) : { users: [], queries: [] };
      closed = { users: [...new Set([...a.users, ...b.users])] };
      await addAliases(trx, service.id, [name_sw, name_en, ...(service.aliases || []), ...a.queries, ...b.queries, ...wordList(req.body?.aliases)]);
    });
    const pUsers = providerIds.length ? await db('provider_profiles').whereIn('id', providerIds).pluck('user_id') : [];
    for (const uid of pUsers) await notify(uid, 'job_approved', 'Your job was approved', `"${name_en}" is now in the NiJibu list.`);
    for (const uid of closed.users) await notify(uid, 'job_available', 'New service available', `${name_en} is now on NiJibu. Search again to find it.`);
    res.json({ ok: true, providers_linked: providerIds.length, customers_notified: closed.users.length });
  } catch (err) {
    next(err);
  }
});

// Merge: the same job under another name. Workers, requests and searches move to the existing job; the pending job is deleted.
router.post('/suggestions/:id/merge', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const targetId = Number(req.body?.service_id);
    if (!Number.isInteger(id) || !Number.isInteger(targetId)) return bad(res);
    let providerIds = [], closedUsers = [], targetName = '';
    await db.transaction(async (trx) => {
      const s = await trx('service_suggestions').where({ id, status: 'pending' }).first();
      const target = await trx('services').where({ id: targetId, status: 'approved' }).first('id', 'name_en');
      if (!s || !target) throw Object.assign(new Error('Not found'), { status: 404, code: 'NOT_FOUND', expose: true });
      const pending = await jobOf(trx, s);
      if (!pending || pending.status !== 'pending' || pending.id === target.id) throw Object.assign(new Error('This job is not waiting any more'), { status: 409, code: 'NOT_PENDING', expose: true });
      targetName = target.name_en;

      for (const l of await trx('provider_services').where({ service_id: pending.id })) {
        await trx('provider_services')
          .insert({ provider_id: l.provider_id, service_id: target.id, experience: l.experience, availability: l.availability })
          .onConflict(['provider_id', 'service_id']).ignore();
      }
      await trx('provider_services').where({ service_id: pending.id }).del();
      await trx('requests').where({ service_id: pending.id }).update({ service_id: target.id });
      await trx('search_logs').where({ service_id: pending.id }).update({ service_id: target.id });
      const same = await trx('service_suggestions').where({ status: 'pending', service_id: pending.id });
      providerIds = same.map((g) => g.provider_id);
      await trx('service_suggestions').whereIn('id', same.map((g) => g.id)).update({ status: 'added', service_id: target.id, handled_at: db.fn.now() });
      const norms = [...new Set([pending.name_sw, pending.name_en, ...(pending.aliases || [])].map(normalizeQuery).filter(Boolean))];
      const users = new Set();
      const queries = [];
      for (const n of norms) {
        const c = await closeMisses(trx, n, 'merged', target.id);
        c.users.forEach((u) => users.add(u));
        queries.push(...c.queries);
      }
      closedUsers = [...users];
      await addAliases(trx, target.id, [pending.name_sw, pending.name_en, ...(pending.aliases || []), ...queries, ...wordList(req.body?.aliases)]);
      await trx('services').where({ id: pending.id }).del();
    });
    const pUsers = providerIds.length ? await db('provider_profiles').whereIn('id', providerIds).pluck('user_id') : [];
    for (const uid of pUsers) await notify(uid, 'job_approved', 'Your job was approved', `Your job was linked to "${targetName}".`);
    for (const uid of closedUsers) await notify(uid, 'job_available', 'Service available', 'A service you searched for is now available. Search again to find it.');
    res.json({ ok: true, providers_linked: providerIds.length, customers_notified: closedUsers.length });
  } catch (err) {
    next(err);
  }
});

// Reject: the job is switched off, the workers lose it and are told why.
router.post('/suggestions/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';
    let providerIds = [];
    await db.transaction(async (trx) => {
      const s = await trx('service_suggestions').where({ id, status: 'pending' }).first();
      if (!s) throw Object.assign(new Error('Not found'), { status: 404, code: 'NOT_FOUND', expose: true });
      const service = await jobOf(trx, s);
      const same = await trx('service_suggestions').where({ status: 'pending', service_id: service.id });
      providerIds = same.map((g) => g.provider_id);
      await trx('service_suggestions').whereIn('id', same.map((g) => g.id)).update({ status: 'rejected', handled_at: db.fn.now() });
      await trx('provider_services').where({ service_id: service.id }).del();
      await trx('services').where({ id: service.id }).update({ status: 'rejected', active: false });
    });
    const pUsers = providerIds.length ? await db('provider_profiles').whereIn('id', providerIds).pluck('user_id') : [];
    for (const uid of pUsers) await notify(uid, 'job_rejected', 'Job not accepted', reason || 'The job you wrote was not accepted.');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------- Search log
// Every search with what came of it. A customer who searches the same thing again within 30 minutes of a
// failed search is a retry: the first search failed them.
//   requested   = providers were found and the customer made a request within 30 minutes
//   found       = providers were found, no request
//   no_provider = the job exists but nobody was near
//   no_match    = the customer typed something that is not a job
router.get('/searches', async (req, res, next) => {
  try {
    const days = clampDays(req.query.days, 7);
    const outcome = ['requested', 'found', 'no_provider', 'no_match'].includes(req.query.outcome) ? req.query.outcome : null;
    const since = new Date(Date.now() - days * DAY);
    const WINDOW = 30 * 60 * 1000;
    const [logs, misses, reqs] = await Promise.all([
      db('search_logs as l').join('services as s', 's.id', 'l.service_id').where('l.created_at', '>=', since)
        .orderBy('l.created_at', 'desc').limit(5000)
        .select('l.id', 'l.created_at', 'l.user_id', 'l.service_id', 'l.providers_found', 'l.lat', 'l.lng', 's.name_en', 's.name_sw'),
      db('search_misses').where('created_at', '>=', since).orderBy('created_at', 'desc').limit(5000)
        .select('id', 'created_at', 'user_id', 'query', 'normalized', 'lat', 'lng', 'status'),
      db('requests').where('created_at', '>=', since).select('customer_id', 'service_id', 'created_at'),
    ]);

    const reqTimes = new Map();
    for (const r of reqs) {
      const k = `${r.customer_id}|${r.service_id}`;
      if (!reqTimes.has(k)) reqTimes.set(k, []);
      reqTimes.get(k).push(new Date(r.created_at).getTime());
    }

    const rows = [
      ...logs.map((l) => ({ id: `s${l.id}`, at: l.created_at, user_id: l.user_id, key: `s${l.service_id}`, service_id: l.service_id, kind: 'job', label: l.name_en, label_sw: l.name_sw, providers_found: l.providers_found, lat: l.lat, lng: l.lng })),
      ...misses.map((m) => ({ id: `m${m.id}`, at: m.created_at, user_id: m.user_id, key: `m${m.normalized}`, kind: 'typed', label: m.query, label_sw: null, providers_found: null, lat: m.lat, lng: m.lng, miss_status: m.status })),
    ].sort((a, b) => a.at - b.at);

    const chain = new Map();
    for (const r of rows) {
      if (r.kind === 'typed') r.outcome = 'no_match';
      else if (r.providers_found === 0) r.outcome = 'no_provider';
      else {
        const t = r.at.getTime();
        r.outcome = (reqTimes.get(`${r.user_id}|${r.service_id}`) || []).some((x) => x >= t && x - t <= WINDOW) ? 'requested' : 'found';
      }
      const failed = r.outcome === 'no_match' || r.outcome === 'no_provider';
      r.attempt = 1;
      r.retry = false;
      if (r.user_id) {
        const k = `${r.user_id}|${r.key}`;
        const prev = chain.get(k);
        if (prev && r.at.getTime() - prev.at <= WINDOW) { r.attempt = prev.attempt + 1; r.retry = prev.failed; }
        chain.set(k, { at: r.at.getTime(), attempt: r.attempt, failed });
      }
    }

    const count = (o) => rows.filter((r) => r.outcome === o).length;
    const retryRows = rows.filter((r) => r.retry);
    const stats = {
      searches: rows.length,
      people: new Set(rows.map((r) => r.user_id).filter(Boolean)).size,
      requested: count('requested'), found: count('found'), no_provider: count('no_provider'), no_match: count('no_match'),
      retries: retryRows.length,
      people_retried: new Set(retryRows.map((r) => r.user_id)).size,
      success_rate: rows.length ? Math.round(((count('requested') + count('found')) / rows.length) * 100) : null,
    };

    // Who kept trying: the longest chains of attempts after a failure
    const longest = new Map();
    for (const r of rows) {
      if (!r.user_id || r.attempt < 2) continue;
      const k = `${r.user_id}|${r.key}`;
      if (!longest.has(k) || longest.get(k).attempts < r.attempt) longest.set(k, { user_id: r.user_id, label: r.label, attempts: r.attempt });
    }
    const topRetriers = [...longest.values()].sort((a, b) => b.attempts - a.attempts).slice(0, 5);

    const shown = rows.filter((r) => !outcome || r.outcome === outcome).reverse().slice(0, 300);
    const ids = [...new Set([...shown.map((r) => r.user_id), ...topRetriers.map((r) => r.user_id)].filter(Boolean))];
    const users = ids.length ? await db('users').whereIn('id', ids).select('id', 'name', 'phone') : [];
    const U = new Map(users.map((u) => [u.id, u]));
    const who = (id) => (U.get(id) ? { name: U.get(id).name, phone: U.get(id).phone } : { name: null, phone: null });

    res.json({
      days, stats,
      top_retriers: topRetriers.map((r) => ({ ...r, ...who(r.user_id) })),
      items: shown.map(({ id, at, user_id, kind, label, label_sw, providers_found, lat, lng, outcome: o, attempt, retry }) => ({
        id, at, kind, label, label_sw, providers_found, lat, lng, outcome: o, attempt, retry, ...who(user_id),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- 4) Dashboard summary
router.get('/summary', async (req, res, next) => {
  try {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = new Date(now - 7 * DAY);
    const stuckBefore = new Date(now - 5 * 60 * 1000);
    const one = async (q) => Number((await q.first())?.n ?? 0);
    const count = (q) => one(q.select(db.raw('count(*)::int as n')));
    const rawN = async (sql) => Number((await db.raw(sql)).rows[0].n);

    const money = async (since) => {
      const pay = await db('payments').where({ status: 'paid' }).where('paid_at', '>=', since)
        .select(db.raw('count(*)::int as payments'), db.raw('coalesce(sum(amount), 0)::int as gross'), db.raw('coalesce(sum(fee), 0)::int as commission')).first();
      const out = await db('payouts').where('created_at', '>=', since)
        .select(
          db.raw("coalesce(sum(amount) filter (where status = 'sent'), 0)::int as sent"),
          db.raw("coalesce(sum(amount) filter (where status <> 'sent'), 0)::int as pending")
        ).first();
      return { ...pay, payouts_sent: out.sent, payouts_pending: out.pending };
    };
    const demand = async (since) => {
      const r = await db('requests').where('created_at', '>=', since)
        .select(
          db.raw('count(*)::int as requests'),
          db.raw("count(*) filter (where status = 'completed')::int as completed"),
          db.raw("count(*) filter (where status = 'cancelled')::int as cancelled"),
          db.raw("count(*) filter (where status = 'no_provider')::int as no_provider"),
          db.raw('coalesce(avg(extract(epoch from (accepted_at - created_at))) filter (where accepted_at is not null), 0)::int as avg_accept_seconds')
        ).first();
      return { ...r, completion_rate: r.requests ? Math.round((r.completed / r.requests) * 100) : null, no_provider_rate: r.requests ? Math.round((r.no_provider / r.requests) * 100) : null };
    };

    const isSuper = req.user.role === SUPER;
    const noStaff = (q) => q.whereNotIn('role', STAFF);
    const [providers_pending, suggestions, missing, complaints_open, payouts_failed, payments_failed, stuck, mToday, mWeek, dToday, dWeek, online, verified, topJobs, topMissing] = await Promise.all([
      count(db('provider_profiles').where({ verification_status: 'pending' })),
      rawN("select count(distinct coalesce(service_id::text, lower(name)))::int as n from service_suggestions where status = 'pending'"),
      rawN("select count(distinct normalized)::int as n from search_misses where status = 'open'"),
      count(db('complaints').whereIn('status', ['open', 'in_review'])),
      count(db('payouts').where({ status: 'failed' })),
      count(db('payments').where({ status: 'failed' }).where('created_at', '>=', week)),
      count(db('requests').where({ status: 'searching' }).where('created_at', '<', stuckBefore)),
      money(today), money(week), demand(today), demand(week),
      count(db('provider_profiles').where({ verification_status: 'verified', is_online: true })),
      count(db('provider_profiles').where({ verification_status: 'verified' })),
      db('search_logs as l').join('services as s', 's.id', 'l.service_id').where('l.created_at', '>=', week).groupBy('s.id', 's.name_sw', 's.name_en')
        .select('s.id', 's.name_sw', 's.name_en', db.raw('count(*)::int as searches')).orderBy('searches', 'desc').limit(5),
      db('search_misses').where({ status: 'open' }).where('created_at', '>=', week).groupBy('normalized')
        .select('normalized', db.raw('count(*)::int as searches'), db.raw('min(query) as query')).orderBy('searches', 'desc').limit(5),
    ]);

    // Everything since the start (real numbers from the database)
    const [people, providersAll, reqAll, complaintsAll, jobsCount] = await Promise.all([
      noStaff(db('users')).first(
        db.raw('count(*)::int as total'),
        db.raw('count(*) filter (where created_at >= ?)::int as today', [today]),
        db.raw('count(*) filter (where created_at >= ?)::int as week', [week]),
        db.raw("count(*) filter (where role = 'customer' or exists (select 1 from requests r where r.customer_id = users.id))::int as customers")
      ),
      db('provider_profiles').first(
        db.raw('count(*)::int as total'),
        db.raw("count(*) filter (where verification_status = 'rejected')::int as rejected"),
        db.raw('count(*) filter (where created_at >= ?)::int as week', [week])
      ),
      db('requests').first(
        db.raw('count(*)::int as total'),
        db.raw("count(*) filter (where status = 'completed')::int as completed"),
        db.raw("count(*) filter (where status = 'cancelled')::int as cancelled"),
        db.raw("count(*) filter (where status not in ('completed','cancelled','no_provider'))::int as active")
      ),
      db('complaints').first(db.raw('count(*)::int as total'), db.raw("count(*) filter (where status in ('resolved','rejected'))::int as closed")),
      db('services').count('* as n').first(),
    ]);

    // Money, prices and staff are for superadmin only
    let allMoney = null, registration = null, prices = null, staff = null;
    if (isSuper) {
      const [pay, out, fees, feeToday, feeWeek, price, staffRows] = await Promise.all([
        db('payments').where({ status: 'paid' }).first(db.raw('count(*)::int as payments'), db.raw('coalesce(sum(amount),0)::int as gross'), db.raw('coalesce(sum(fee),0)::int as commission')),
        db('payouts').first(db.raw("coalesce(sum(amount) filter (where status = 'sent'),0)::int as sent"), db.raw("coalesce(sum(amount) filter (where status <> 'sent'),0)::int as waiting")),
        db('registration_fees').first(db.raw("count(*) filter (where status = 'paid')::int as paid"), db.raw("coalesce(sum(amount) filter (where status = 'paid'),0)::int as collected"), db.raw("count(*) filter (where status = 'pending')::int as pending")),
        db('registration_fees').where({ status: 'paid' }).where('paid_at', '>=', today).sum({ n: 'amount' }).first(),
        db('registration_fees').where({ status: 'paid' }).where('paid_at', '>=', week).sum({ n: 'amount' }).first(),
        db('requests').whereNotNull('agreed_price').first(
          db.raw('count(*)::int as priced_jobs'), db.raw('round(avg(agreed_price))::int as avg'), db.raw('round(percentile_cont(0.5) within group (order by agreed_price))::int as median'),
          db.raw('min(agreed_price)::int as min'), db.raw('max(agreed_price)::int as max')
        ),
        db('users').whereIn('role', STAFF).orderByRaw("(role = 'superadmin') desc, created_at").select('id', 'name', 'role', 'disabled_at'),
      ]);
      allMoney = { ...pay, payouts_sent: out.sent, payouts_waiting: out.waiting };
      registration = { today: Number(feeToday.n || 0), week: Number(feeWeek.n || 0), all: fees.collected, paid: fees.paid, pending: fees.pending };
      prices = price;
      staff = {
        superadmin: staffRows.filter((x) => x.role === SUPER && !x.disabled_at).length,
        support: staffRows.filter((x) => x.role === SUPPORT && !x.disabled_at).length,
        disabled: staffRows.filter((x) => x.disabled_at).length,
        items: staffRows.map((x) => ({ id: x.id, name: x.name, role: x.role, disabled: Boolean(x.disabled_at) })),
      };
    }

    res.json({
      role: req.user.role,
      needs_action: { providers_pending, suggestions, missing_jobs: missing, complaints_open, failed_payments: isSuper ? payouts_failed + payments_failed : null, stuck_requests: stuck },
      money: isSuper ? { today: mToday, week: mWeek, all: allMoney } : null,
      registration,
      prices,
      staff,
      totals: { users: people, providers: providersAll, requests: reqAll, complaints: complaintsAll, jobs: Number(jobsCount.n) },
      demand: { today: dToday, week: dWeek },
      supply: { online, verified },
      top_jobs: topJobs,
      top_missing: topMissing,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
