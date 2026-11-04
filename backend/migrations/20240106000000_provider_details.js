// Fundi details used by the Worker app: work place, NIDA check, payout.
// The NIDA number is stored encrypted (nida_enc) plus a keyed hash (nida_hash) so one NIDA = one account.
exports.up = async (knex) => {
  await knex.schema.alterTable('provider_profiles', (t) => {
    t.double('work_lat').nullable();
    t.double('work_lng').nullable();
    t.string('region', 60).nullable();
    t.string('district', 60).nullable();
    t.string('ward', 60).nullable();
    t.string('experience', 10).nullable();
    t.string('availability', 10).nullable();
    t.boolean('nida_submitted').notNullable().defaultTo(false);
    t.text('nida_enc').nullable();
    t.string('nida_hash', 64).nullable().unique();
    t.string('nida_name', 120).nullable();
    t.string('nida_selfie_path', 80).nullable();
    t.string('nida_id_path', 80).nullable();
    t.string('rejection_reason', 300).nullable();
    t.string('payout_network', 12).nullable();
    t.string('payout_number', 12).nullable();
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('provider_profiles', (t) => {
    t.dropColumns(
      'work_lat', 'work_lng', 'region', 'district', 'ward', 'experience', 'availability', 'nida_submitted',
      'nida_enc', 'nida_hash', 'nida_name', 'nida_selfie_path', 'nida_id_path', 'rejection_reason',
      'payout_network', 'payout_number'
    );
  });
};
