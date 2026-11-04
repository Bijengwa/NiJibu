// The fixed list of jobs. Providers pick from this list, customers search it.
// Safe to run many times: it adds or updates, it never deletes.
const SERVICES = [
  { slug: 'dobi', name_sw: 'Dobi', name_en: 'Laundry' },
  { slug: 'fundi-bomba', name_sw: 'Fundi bomba', name_en: 'Plumber' },
  { slug: 'fundi-umeme', name_sw: 'Fundi umeme', name_en: 'Electrician' },
  { slug: 'fundi-viatu', name_sw: 'Fundi viatu', name_en: 'Shoe repair' },
  { slug: 'fundi-seremala', name_sw: 'Fundi seremala', name_en: 'Carpenter' },
  { slug: 'fundi-rangi', name_sw: 'Fundi rangi', name_en: 'Painter' },
  { slug: 'fundi-simu', name_sw: 'Fundi simu', name_en: 'Phone repair' },
  { slug: 'fundi-friji', name_sw: 'Fundi friji na TV', name_en: 'Fridge and TV repair' },
  { slug: 'usafi', name_sw: 'Usafi wa nyumba', name_en: 'House cleaning' },
  { slug: 'fundi-magari', name_sw: 'Fundi magari', name_en: 'Mechanic' },
];

// The words customers type for each job (the other names). They are saved once; the admin edits them later.
const { WORDS } = require('../migrations/20240113000000_seed_job_aliases');

exports.seed = async (knex) => {
  await knex('services').insert(SERVICES.map((s) => ({ ...s, aliases: `{${(WORDS[s.slug] || []).map((w) => `"${w}"`).join(',')}}` }))).onConflict('slug').merge(['name_sw', 'name_en']);
};
