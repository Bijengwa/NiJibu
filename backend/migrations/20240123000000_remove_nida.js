// NIDA is gone. A worker now signs up with: details -> phone code (OTP) -> registration fee (1,000 TSh).
//   provider_profiles.registered_at   when the worker paid the fee (replaces nida_submitted)
//   verification_fees                 renamed to registration_fees, without the NIDA columns
// Workers who were already registered stay registered and keep their status.
exports.up = async (knex) => {
  await knex.schema.alterTable('provider_profiles', (t) => t.timestamp('registered_at').nullable());
  await knex.raw('update provider_profiles set registered_at = coalesce(verified_at, created_at) where nida_submitted = true');
  await knex.schema.alterTable('provider_profiles', (t) => {
    t.dropColumn('nida_submitted');
    t.dropColumn('nida_enc');
    t.dropColumn('nida_hash');
    t.dropColumn('nida_name');
    t.dropColumn('nida_selfie_path');
    t.dropColumn('nida_id_path');
  });

  await knex.schema.renameTable('verification_fees', 'registration_fees');
  await knex.schema.alterTable('registration_fees', (t) => {
    t.dropColumn('outcome');
    t.dropColumn('hits');
    t.dropColumn('asked');
    t.dropColumn('offered_nida_enc');
    t.dropColumn('passed_nida_hash');
    t.dropColumn('passed_until');
    t.dropColumn('linked_at');
  });
  await knex.schema.alterTable('registration_fees', (t) => t.index(['phone', 'status']));

  await knex('service_prices').where({ service: 'nida' }).del();
  await knex('service_usage').where({ service: 'nida' }).del();
};

exports.down = async (knex) => {
  await knex.schema.alterTable('registration_fees', (t) => {
    t.dropIndex(['phone', 'status']);
    t.string('outcome', 10).notNullable().defaultTo('passed');
    t.smallint('hits').notNullable().defaultTo(0);
    t.jsonb('asked').notNullable().defaultTo('[]');
    t.text('offered_nida_enc').nullable();
    t.string('passed_nida_hash', 64).nullable();
    t.timestamp('passed_until').nullable();
    t.timestamp('linked_at').nullable();
  });
  await knex.schema.renameTable('registration_fees', 'verification_fees');
  await knex.schema.alterTable('provider_profiles', (t) => {
    t.boolean('nida_submitted').notNullable().defaultTo(false);
    t.text('nida_enc').nullable();
    t.string('nida_hash', 64).nullable().unique();
    t.string('nida_name', 120).nullable();
    t.string('nida_selfie_path', 80).nullable();
    t.string('nida_id_path', 80).nullable();
  });
  await knex.raw('update provider_profiles set nida_submitted = true where registered_at is not null');
  await knex.schema.alterTable('provider_profiles', (t) => t.dropColumn('registered_at'));
};
