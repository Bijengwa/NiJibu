exports.seed = async (knex) => {
  await knex('users').del();
  await knex('users').insert([{ name: 'Test User', email: 'test@example.com' }]);
};
