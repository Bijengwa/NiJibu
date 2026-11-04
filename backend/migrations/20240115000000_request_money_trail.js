// A clear trail from every request to its money.
//  - every request, payment and payout gets a short readable code (NJ-000012, PAY-000007, PO-000007)
//  - the price, NiJibu's commission and the fundi's share are saved on the request when the fundi sets the price,
//    so later we know exactly what should be paid for that job
//  - every payment try is kept in payment_attempts (before, a retry overwrote the failed one)
//  - the payment remembers the job (service) it was for
exports.up = async (knex) => {
  await knex.raw(`alter table requests add column code text generated always as ('NJ-' || lpad(id::text, 6, '0')) stored`);
  await knex.raw('create unique index requests_code_unique on requests (code)');
  await knex.raw(`alter table payments add column code text generated always as ('PAY-' || lpad(id::text, 6, '0')) stored`);
  await knex.raw(`alter table payouts add column code text generated always as ('PO-' || lpad(id::text, 6, '0')) stored`);

  await knex.schema.alterTable('requests', (t) => {
    t.integer('fee_percent').nullable(); // commission % when the price was set
    t.integer('fee_due').nullable(); // TZS NiJibu should keep
    t.integer('payout_due').nullable(); // TZS the fundi should get
  });
  // Old jobs that already have a price: work out what should have been paid (10% was the rule)
  await knex.raw(`
    update requests set
      fee_percent = 10,
      fee_due = round(agreed_price * 10 / 100.0),
      payout_due = agreed_price - round(agreed_price * 10 / 100.0)
    where agreed_price is not null and fee_due is null`);
  // Where a payment already exists, its numbers are the truth
  await knex.raw(`
    update requests r set fee_percent = p.fee_percent, fee_due = p.fee, payout_due = p.payout
    from payments p where p.request_id = r.id`);

  await knex.schema.alterTable('payments', (t) => {
    t.integer('service_id').nullable().references('id').inTable('services');
    t.integer('attempts').notNullable().defaultTo(1);
  });
  await knex.raw('update payments p set service_id = r.service_id from requests r where r.id = p.request_id');

  await knex.schema.createTable('payment_attempts', (t) => {
    t.increments('id').primary();
    t.integer('payment_id').notNullable().references('id').inTable('payments').onDelete('CASCADE');
    t.integer('request_id').notNullable().references('id').inTable('requests').onDelete('CASCADE');
    t.integer('customer_id').notNullable().references('id').inTable('users');
    t.integer('amount').notNullable();
    t.string('network', 12).nullable();
    t.string('phone', 15).nullable();
    t.string('status', 10).notNullable(); // success | failed
    t.string('reference', 80).nullable();
    t.string('failure', 100).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['payment_id']);
    t.index(['request_id']);
  });
  // The one try each existing payment already has
  await knex.raw(`
    insert into payment_attempts (payment_id, request_id, customer_id, amount, network, phone, status, reference, failure, created_at)
    select id, request_id, customer_id, amount, network, phone,
           case when status = 'paid' then 'success' else 'failed' end, reference, failure, coalesce(paid_at, created_at)
    from payments where status in ('paid', 'failed')`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('payment_attempts');
  await knex.schema.alterTable('payments', (t) => {
    t.dropColumn('attempts');
    t.dropColumn('service_id');
  });
  await knex.schema.alterTable('requests', (t) => {
    t.dropColumn('payout_due');
    t.dropColumn('fee_due');
    t.dropColumn('fee_percent');
  });
  await knex.raw('alter table payouts drop column code');
  await knex.raw('alter table payments drop column code');
  await knex.raw('drop index if exists requests_code_unique');
  await knex.raw('alter table requests drop column code');
};
