// 1) The customer confirms that the work is done, then pays.
// 2) The fundi confirms that he received the money, or files a complaint that the admin handles.
exports.up = async (knex) => {
  await knex.schema.alterTable('requests', (t) => {
    t.timestamp('customer_confirmed_at').nullable();
  });
  await knex.schema.alterTable('payouts', (t) => {
    t.timestamp('received_at').nullable(); // the fundi said "I received it"
    t.string('complaint', 300).nullable(); // the fundi says he did not receive it (or the amount is wrong)
    t.timestamp('complaint_at').nullable();
    t.string('complaint_status', 10).nullable(); // open | resolved
    t.string('complaint_note', 300).nullable(); // the admin's answer
    t.timestamp('resolved_at').nullable();
    t.index(['complaint_status']);
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('payouts', (t) => {
    t.dropColumn('received_at');
    t.dropColumn('complaint');
    t.dropColumn('complaint_at');
    t.dropColumn('complaint_status');
    t.dropColumn('complaint_note');
    t.dropColumn('resolved_at');
  });
  await knex.schema.alterTable('requests', (t) => {
    t.dropColumn('customer_confirmed_at');
  });
};
