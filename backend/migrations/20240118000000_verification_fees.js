// The worker pays a registration fee (default 1,000 TSh) before each identity check. No refunds.
// One row = one paid try. A try allows up to 2 NIDA hits (the second one is for corrections).
//   status   : pending | paid | failed          (the money)
//   outcome  : open | passed | failed | photos  (what the try ended in)
//   passed_* : the NIDA number that passed, kept as a hash, so the account can be linked for 1 hour
exports.up = async (knex) => {
  await knex.schema.createTable('verification_fees', (t) => {
    t.increments('id').primary();
    t.string('phone', 15).notNullable(); // 255XXXXXXXXX (the worker may not have an account yet)
    t.integer('amount').notNullable();
    t.string('status', 10).notNullable().defaultTo('pending');
    t.string('network', 12).nullable();
    t.string('reference', 80).nullable(); // order id at the payment provider
    t.string('failure', 100).nullable();
    t.string('outcome', 10).notNullable().defaultTo('open');
    t.smallint('hits').notNullable().defaultTo(0);
    t.jsonb('asked').notNullable().defaultTo('[]');
    t.text('offered_nida_enc').nullable(); // NIDA's own number, when it differs from the typed one (waiting for the worker to accept)
    t.string('passed_nida_hash', 64).nullable();
    t.timestamp('passed_until').nullable();
    t.timestamp('linked_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('paid_at').nullable();
    t.index(['phone', 'status', 'outcome']);
    t.index(['reference']);
    t.index(['created_at']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('verification_fees');
};
