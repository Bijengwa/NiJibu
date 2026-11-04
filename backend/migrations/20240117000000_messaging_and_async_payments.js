// SMS / WhatsApp messages to customers and fundis, and mobile-money payments that finish later (Selcom).
//  - users.whatsapp_opt_in: WhatsApp is used only when the person agreed (Meta rule). Default: no.
//  - message_log: one row per message sent. It never keeps the message text (OTP codes stay out of the database).
//  - payments.pending_at: when the customer was asked to approve on the phone (old pending payments are closed as TIMEOUT).
exports.up = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.boolean('whatsapp_opt_in').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('message_log', (t) => {
    t.increments('id').primary();
    t.integer('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('phone', 15).notNullable();
    t.string('channel', 10).notNullable(); // sms | whatsapp
    t.string('template', 40).notNullable(); // otp, request_accepted, ...
    t.string('status', 10).notNullable(); // sent | failed
    t.string('provider_ref', 100).nullable();
    t.string('error', 200).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['user_id', 'created_at']);
    t.index(['status', 'created_at']);
  });

  await knex.schema.alterTable('payments', (t) => {
    t.timestamp('pending_at').nullable();
  });
  await knex.raw("update payments set pending_at = created_at where status = 'pending' and pending_at is null");
  await knex.raw('create index payments_reference_idx on payments (reference)');
};

exports.down = async (knex) => {
  await knex.raw('drop index if exists payments_reference_idx');
  await knex.schema.alterTable('payments', (t) => t.dropColumn('pending_at'));
  await knex.schema.dropTableIfExists('message_log');
  await knex.schema.alterTable('users', (t) => t.dropColumn('whatsapp_opt_in'));
};
