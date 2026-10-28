// The phone's push token, so a fundi gets a new request even when the app is closed or the screen is off.
exports.up = (knex) =>
  knex.schema.alterTable('users', (t) => {
    t.string('push_token', 200).nullable();
  });

exports.down = (knex) =>
  knex.schema.alterTable('users', (t) => {
    t.dropColumn('push_token');
  });
