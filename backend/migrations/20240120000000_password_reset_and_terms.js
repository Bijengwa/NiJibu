// Forgot / reset password (a code sent by SMS, same way as the sign-up code) and the Terms and Conditions agreement.
//   password_resets: one pending reset code per user (the code is stored only as a hash)
//   users.terms_version / terms_accepted_at: which version of the terms the person agreed to, and when
exports.up = async (knex) => {
  await knex.schema.createTable('password_resets', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
    t.string('code_hash', 64).notNullable();
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('expires_at').notNullable();
    t.timestamp('last_sent_at').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
  await knex.schema.alterTable('users', (t) => {
    t.string('terms_version', 20).nullable();
    t.timestamp('terms_accepted_at').nullable();
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('terms_version');
    t.dropColumn('terms_accepted_at');
  });
  await knex.schema.dropTableIfExists('password_resets');
};
