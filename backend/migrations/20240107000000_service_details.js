// Each job a fundi picks has its own experience and availability.
// Jobs the fundi types because they are not in the list go to service_suggestions; an admin adds them to the list.
exports.up = async (knex) => {
  await knex.schema.alterTable('provider_services', (t) => {
    t.string('experience', 10).nullable();
    t.string('availability', 10).nullable();
  });
  // Fundis saved before this change: copy their one experience / availability to each job
  await knex.raw(`update provider_services ps set experience = p.experience, availability = p.availability
                  from provider_profiles p where p.id = ps.provider_id`);

  await knex.schema.createTable('service_suggestions', (t) => {
    t.increments('id').primary();
    t.integer('provider_id').notNullable().references('id').inTable('provider_profiles').onDelete('CASCADE');
    t.string('name', 80).notNullable();
    t.string('experience', 10).nullable();
    t.string('availability', 10).nullable();
    // pending -> added (admin put it in the list) | rejected
    t.string('status', 12).notNullable().defaultTo('pending');
    t.integer('service_id').nullable().references('id').inTable('services').onDelete('SET NULL');
    t.timestamp('handled_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['status', 'created_at']);
  });
  await knex.raw('create unique index service_suggestions_one_per_name on service_suggestions (provider_id, lower(name))');
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('service_suggestions');
  await knex.schema.alterTable('provider_services', (t) => {
    t.dropColumns('experience', 'availability');
  });
};
