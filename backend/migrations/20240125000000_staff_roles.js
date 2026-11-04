// Staff roles for the admin portal.
//   superadmin : sees and does everything (this is what the old 'admin' role was)
//   support    : customer care. Sees users, requests, jobs and complaints and solves problems. No money, no settings, no staff.
// disabled_at: a staff account that is switched off cannot log in and its old tokens stop working.
exports.up = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.timestamp('disabled_at').nullable();
  });
  await knex('users').where({ role: 'admin' }).update({ role: 'superadmin', token_version: knex.raw('token_version + 1') });
};

exports.down = async (knex) => {
  await knex('users').whereIn('role', ['superadmin', 'support']).update({ role: 'admin' });
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('disabled_at');
  });
};
