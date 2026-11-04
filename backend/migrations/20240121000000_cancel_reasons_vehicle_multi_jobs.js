// - A worker may hold more than one job at the same time (people also have side jobs), so the
//   "one job per provider" guard is removed. The limit is now MAX_ACTIVE_JOBS, checked in the code.
// - A cancelled job keeps a reason code (price_not_agreed, ...) so the admin can count why jobs fail.
// - A worker travels by motorbike or by car: the ETA and the route use it.
exports.up = async (knex) => {
  await knex.raw('drop index if exists requests_one_job_per_provider');
  await knex.raw("create index if not exists requests_provider_active on requests (provider_id) where status in ('accepted','on_the_way','arrived','in_progress')");

  await knex.schema.alterTable('requests', (t) => {
    t.string('cancel_code', 30).nullable();
  });
  await knex.schema.alterTable('provider_profiles', (t) => {
    t.string('vehicle', 10).notNullable().defaultTo('motorbike'); // motorbike | car
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('provider_profiles', (t) => t.dropColumn('vehicle'));
  await knex.schema.alterTable('requests', (t) => t.dropColumn('cancel_code'));
  await knex.raw('drop index if exists requests_provider_active');
  // May fail if a worker now has two active jobs: finish or cancel one of them first.
  await knex.raw(
    `create unique index requests_one_job_per_provider on requests (provider_id)
     where status in ('accepted','on_the_way','arrived','in_progress')`
  );
};
