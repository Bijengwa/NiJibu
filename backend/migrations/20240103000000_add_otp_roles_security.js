// Phone verification (OTP), roles and token revocation.
exports.up = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.string('role', 20).notNullable().defaultTo('customer'); // customer | fundi | admin
    t.timestamp('phone_verified_at').nullable();
    t.integer('token_version').notNullable().defaultTo(0); // bump to log out everywhere
  });

  await knex.schema.createTable('phone_verifications', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
    t.string('code_hash', 64).notNullable(); // HMAC of the code, never the code itself
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('expires_at').notNullable();
    t.timestamp('last_sent_at').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Accounts created before OTP existed are treated as verified
  await knex('users').whereNotNull('phone').update({ phone_verified_at: knex.fn.now() });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('phone_verifications');
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('role');
    t.dropColumn('phone_verified_at');
    t.dropColumn('token_version');
  });
};
