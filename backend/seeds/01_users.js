const bcrypt = require('bcryptjs');

// Dev login -> phone: 700000000 (+255), password: test1234 (already verified)
exports.seed = async (knex) => {
  await knex('users').del();
  await knex('users').insert([
    {
      name: 'Test User',
      email: 'test@example.com',
      phone: '255700000000',
      password_hash: await bcrypt.hash('test1234', 10),
      phone_verified_at: knex.fn.now(),
    },
  ]);
};
