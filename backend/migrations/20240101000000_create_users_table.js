exports.up = (knex) =>
  knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('email').notNullable().unique();
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('users');
