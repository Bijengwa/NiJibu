// Complaints: a customer or a worker reports a problem with one request (within 7 days).
// The admin collects them, answers and sets the status. A payout complaint from a worker is copied here too.
exports.up = async (knex) => {
  await knex.schema.createTable('complaints', (t) => {
    t.increments('id').primary();
    t.integer('request_id').notNullable().references('id').inTable('requests').onDelete('CASCADE');
    t.integer('from_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('from_role', 10).notNullable(); // customer | worker
    t.integer('against_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('reason', 30).notNullable();
    t.string('message', 500).notNullable();
    // open -> in_review -> resolved | rejected
    t.string('status', 12).notNullable().defaultTo('open');
    t.string('admin_reply', 500).nullable();
    t.integer('admin_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.integer('payout_id').nullable().references('id').inTable('payouts').onDelete('SET NULL'); // set for "I did not get my money"
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('resolved_at').nullable();
    t.index(['status', 'created_at']);
    t.index(['request_id']);
    t.index(['from_user_id', 'created_at']);
  });
  await knex.raw(`alter table complaints add column code text generated always as ('CP-' || lpad(id::text, 6, '0')) stored`);
  // A person can have only one complaint in progress for the same request
  await knex.raw(
    `create unique index complaints_one_active on complaints (request_id, from_user_id) where status in ('open','in_review')`
  );

  // Payout complaints filed before this table existed
  await knex.raw(`
    insert into complaints (request_id, from_user_id, from_role, against_user_id, reason, message, status, admin_reply, payout_id, created_at, updated_at, resolved_at)
    select pay.request_id, p.user_id, 'worker', pay.customer_id, 'payment_not_received', po.complaint,
           case when po.complaint_status = 'open' then 'open' else 'resolved' end,
           po.complaint_note, po.id, po.complaint_at, coalesce(po.resolved_at, po.complaint_at), po.resolved_at
    from payouts po
    join payments pay on pay.id = po.payment_id
    join provider_profiles p on p.id = po.provider_id
    where po.complaint is not null`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('complaints');
};
