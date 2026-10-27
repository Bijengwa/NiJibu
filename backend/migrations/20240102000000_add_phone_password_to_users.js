// Adds phone + password login. name/email become optional (phone is the login id).
exports.up = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.string('phone', 12).unique(); // stored as 255XXXXXXXXX
    t.string('password_hash');
  });
  await knex.schema.alterTable('users', (t) => {
    t.string('name').nullable().alter();
    t.string('email').nullable().alter();
  });
};

exports.down = (knex) =>
  knex.schema.alterTable('users', (t) => {
    t.dropColumn('phone');
    t.dropColumn('password_hash');
  });
