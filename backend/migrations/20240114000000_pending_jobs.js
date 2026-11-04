// A job a worker writes (not in the list) now exists at once as a PENDING job, so the worker can use it.
// The admin later approves it (names fixed), merges it into an existing job, or rejects it.
//   services.status: approved | pending | rejected
//   service_suggestions keeps who wrote it (now with both names) and points to the pending job (service_id)
const norm = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
const slugify = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);

exports.up = async (knex) => {
  await knex.schema.alterTable('services', (t) => {
    t.string('status', 10).notNullable().defaultTo('approved');
  });
  await knex.schema.alterTable('service_suggestions', (t) => {
    t.string('name_sw', 80).nullable();
    t.string('name_en', 80).nullable();
  });
  await knex.raw('update service_suggestions set name_sw = name, name_en = name where name_sw is null');

  // Suggestions waiting today become pending jobs (one per spelling) so those workers can use them
  const rows = await knex('service_suggestions').where({ status: 'pending' }).whereNull('service_id').orderBy('id');
  const groups = new Map();
  for (const r of rows) {
    const k = norm(r.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const [k, list] of groups) {
    const base = slugify(list[0].name) || 'job';
    let slug = base;
    for (let n = 2; await knex('services').where({ slug }).first('id'); n += 1) slug = `${base}-${n}`;
    const [svc] = await knex('services').insert({ slug, name_sw: list[0].name, name_en: list[0].name, status: 'pending', aliases: [k] }).returning('id');
    for (const r of list) {
      await knex('service_suggestions').where({ id: r.id }).update({ service_id: svc.id });
      await knex('provider_services')
        .insert({ provider_id: r.provider_id, service_id: svc.id, experience: r.experience, availability: r.availability })
        .onConflict(['provider_id', 'service_id']).ignore();
    }
  }
};

exports.down = async (knex) => {
  await knex.schema.alterTable('service_suggestions', (t) => {
    t.dropColumns('name_sw', 'name_en');
  });
  await knex.schema.alterTable('services', (t) => {
    t.dropColumn('status');
  });
};
