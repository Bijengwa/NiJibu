// Jobs written by workers: find the job they mean, or create it as a pending job.
const { normalizeQuery } = require('./text');

const slugify = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);

async function uniqueSlug(trx, name) {
  const base = slugify(name) || 'job';
  let slug = base;
  for (let n = 2; await trx('services').where({ slug }).first('id'); n += 1) slug = `${base}-${n}`;
  return slug;
}

// Every word that already points to a job: its two names, its slug and the words the admin linked
const wordsOf = (s) => [s.name_sw, s.name_en, s.slug, ...(s.aliases || [])].map(normalizeQuery).filter(Boolean);

// Returns { service, created }. The job may be an approved job (the worker is simply linked to it),
// a pending job another worker already wrote, or a new pending job.
async function findOrCreateJob(trx, { name_sw, name_en }) {
  const a = normalizeQuery(name_sw);
  const b = normalizeQuery(name_en);
  const all = await trx('services').select('id', 'slug', 'name_sw', 'name_en', 'aliases', 'status', 'active');
  const hit = all.find((s) => (s.status === 'pending' || (s.status === 'approved' && s.active)) && (wordsOf(s).includes(a) || wordsOf(s).includes(b)));
  if (hit) {
    if (hit.status === 'pending' && !hit.active) await trx('services').where({ id: hit.id }).update({ active: true });
    return { service: hit, created: false };
  }
  const slug = await uniqueSlug(trx, name_en);
  const [service] = await trx('services')
    .insert({ slug, name_sw, name_en, status: 'pending', aliases: [...new Set([a, b].filter(Boolean))] })
    .returning('*');
  return { service, created: true };
}

module.exports = { findOrCreateJob, uniqueSlug, wordsOf };
