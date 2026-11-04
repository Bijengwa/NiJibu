// Profit tracking.
//   service_expenses  money NiJibu pays by plan or by month: a Google Maps plan (USD 100 / 275 a month), hosting, domain, ...
//                     from_month .. to_month (to_month empty = still running). replaces_usage = the plan covers that service,
//                     so its pay-per-call cost is not counted on top of the plan.
//   service_settings  tax_percent (share of the profit paid as tax; 0 = not counted)
// The monthly budget for outside services starts at TZS 100,000 (only if it was never set).
exports.up = async (knex) => {
  await knex.schema.createTable('service_expenses', (t) => {
    t.increments('id').primary();
    t.string('service', 30).nullable(); // google_maps | africastalking | selcom | whatsapp | ... | empty for other costs
    t.string('label', 80).notNullable();
    t.decimal('amount', 14, 2).notNullable(); // per month, in `currency`
    t.string('currency', 3).notNullable().defaultTo('TZS');
    t.string('from_month', 7).notNullable(); // 2026-11
    t.string('to_month', 7).nullable();
    t.boolean('replaces_usage').notNullable().defaultTo(false);
    t.string('note', 200).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex('service_settings').insert({ key: 'tax_percent', value: '0' }).onConflict('key').ignore();
  await knex('service_settings').where({ key: 'monthly_budget_tzs', value: '0' }).update({ value: '100000' });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('service_expenses');
  await knex('service_settings').where({ key: 'tax_percent' }).del();
};
