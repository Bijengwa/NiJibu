// The worker types the number the registration fee is taken from (it can differ from the account phone).
//   verification_fees.phone     = the account phone (identity check and linking use it)
//   verification_fees.pay_phone = the number the money was asked from
exports.up = async (knex) => {
  await knex.schema.alterTable('verification_fees', (t) => {
    t.string('pay_phone', 15).nullable();
  });
  await knex.raw('update verification_fees set pay_phone = phone where pay_phone is null');
};

exports.down = async (knex) => {
  await knex.schema.alterTable('verification_fees', (t) => t.dropColumn('pay_phone'));
};
