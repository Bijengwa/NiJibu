// How many times a fundi was asked for the same request (an offer that ran out is sent once more).
exports.up = (knex) =>
  knex.schema.alterTable('request_offers', (t) => {
    t.integer('tries').notNullable().defaultTo(1);
  });

exports.down = (knex) =>
  knex.schema.alterTable('request_offers', (t) => {
    t.dropColumn('tries');
  });
