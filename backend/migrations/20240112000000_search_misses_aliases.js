// Demand we cannot serve yet:
// - search_misses: what customers typed when no job matched (the admin turns these into jobs or synonyms)
// - services.aliases: other words for a job ("bomba" for "Fundi bomba"), added when the admin merges a miss
exports.up = async (knex) => {
  await knex.schema.alterTable('services', (t) => {
    t.specificType('aliases', 'text[]').notNullable().defaultTo('{}');
  });
  await knex.schema.createTable('search_misses', (t) => {
    t.increments('id');
    t.integer('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('query', 60).notNullable(); // as typed
    t.string('normalized', 60).notNullable(); // lower case, no accents, single spaces: groups the spellings
    t.double('lat').nullable();
    t.double('lng').nullable();
    t.string('status', 10).notNullable().defaultTo('open'); // open | added | merged | ignored
    t.integer('service_id').nullable().references('id').inTable('services').onDelete('SET NULL');
    t.timestamp('handled_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['status', 'normalized']);
    t.index(['created_at']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('search_misses');
  await knex.schema.alterTable('services', (t) => {
    t.dropColumn('aliases');
  });
};
