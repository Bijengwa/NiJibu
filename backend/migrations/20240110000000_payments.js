// Payment for a finished job: the customer pays NiJibu, NiJibu keeps its commission and pays the fundi the rest.
//   payments: money in from the customer      payouts: money out to the fundi
exports.up = async (knex) => {
  await knex.schema.createTable('payments', (t) => {
    t.increments('id').primary();
    t.integer('request_id').notNullable().unique().references('id').inTable('requests').onDelete('CASCADE');
    t.integer('customer_id').notNullable().references('id').inTable('users');
    t.integer('provider_id').notNullable().references('id').inTable('provider_profiles');
    t.integer('amount').notNullable(); // TZS, what the customer pays
    t.integer('fee_percent').notNullable(); // commission % at the time of payment
    t.integer('fee').notNullable(); // TZS kept by NiJibu
    t.integer('payout').notNullable(); // TZS for the fundi (amount - fee)
    t.string('status', 10).notNullable().defaultTo('pending'); // pending | paid | failed
    t.string('network', 12).nullable();
    t.string('phone', 15).nullable(); // the number the customer paid from
    t.string('reference', 80).nullable(); // id from the payment provider
    t.string('failure', 100).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('paid_at').nullable();
    t.index(['status', 'created_at']);
    t.index(['provider_id', 'created_at']);
  });

  await knex.schema.createTable('payouts', (t) => {
    t.increments('id').primary();
    t.integer('payment_id').notNullable().unique().references('id').inTable('payments').onDelete('CASCADE');
    t.integer('provider_id').notNullable().references('id').inTable('provider_profiles');
    t.integer('amount').notNullable();
    t.string('network', 12).nullable();
    t.string('number', 15).nullable();
    t.string('status', 10).notNullable().defaultTo('pending'); // pending | sent | failed
    t.string('reference', 80).nullable();
    t.string('failure', 100).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('sent_at').nullable();
    t.index(['status']);
    t.index(['provider_id', 'created_at']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('payouts');
  await knex.schema.dropTableIfExists('payments');
};
