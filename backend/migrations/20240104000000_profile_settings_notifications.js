// Profile photo, synced settings, in-app notifications.
exports.up = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.string('language', 2); // en | sw (null = not chosen yet)
    t.string('theme_mode', 10); // system | light | dark (null = not chosen yet)
    t.boolean('notifications_enabled').notNullable().defaultTo(true);
    t.string('avatar_path', 100); // file name inside uploads/avatars
  });

  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('type', 40).notNullable(); // the app translates by type (welcome, password_changed, ...)
    t.string('title', 120).notNullable(); // English fallback
    t.string('body', 500).notNullable(); // English fallback
    t.timestamp('read_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['user_id', 'created_at']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('language');
    t.dropColumn('theme_mode');
    t.dropColumn('notifications_enabled');
    t.dropColumn('avatar_path');
  });
};
