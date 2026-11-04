// Tracking what NiJibu uses from outside services (Google Maps, Africa's Talking, Selcom, ...) and what it costs.
//   service_usage    one row per call (or per message / per payment). Cheap to write, never holds personal data.
//   service_prices   the price list the admin can edit: unit price, free monthly units, % of the money moved.
//   service_settings small key/value table: dollar rate, monthly budget.
// Costs are worked out when the admin page is opened (not saved), so changing a price re-prices the whole history.
exports.up = async (knex) => {
  await knex.schema.createTable('service_usage', (t) => {
    t.bigIncrements('id').primary();
    t.string('service', 30).notNullable(); // google_maps | osm | osrm | africastalking | whatsapp | selcom | nida | expo_push
    t.string('operation', 40).notNullable(); // places_text_search, geocode_reverse, sms, collect, ...
    t.integer('units').notNullable().defaultTo(1); // calls, or SMS parts
    t.boolean('ok').notNullable().defaultTo(true);
    t.boolean('cached').notNullable().defaultTo(false); // answered from our own cache: no cost, but shows what caching saves
    t.integer('ms').nullable();
    t.bigInteger('amount_tzs').nullable(); // money moved (Selcom): its fee is a % of this
    t.decimal('reported_cost', 14, 4).nullable(); // the cost the provider told us (Africa's Talking answers with it)
    t.string('reported_currency', 3).nullable();
    t.string('tag', 40).nullable(); // free label, e.g. the SMS template
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['created_at']);
    t.index(['service', 'operation', 'created_at']);
  });

  await knex.schema.createTable('service_prices', (t) => {
    t.string('service', 30).notNullable();
    t.string('operation', 40).notNullable();
    t.string('label', 80).notNullable();
    t.string('currency', 3).notNullable().defaultTo('USD'); // USD | TZS
    t.decimal('unit_price', 14, 6).notNullable().defaultTo(0); // per unit, in `currency`
    t.decimal('percent_fee', 6, 3).notNullable().defaultTo(0); // % of amount_tzs (payment gateways)
    t.integer('free_units').notNullable().defaultTo(0); // free units every month
    t.boolean('verified').notNullable().defaultTo(false); // true = the price was checked against the provider's price page
    t.string('note', 200).nullable();
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.primary(['service', 'operation']);
  });

  await knex.schema.createTable('service_settings', (t) => {
    t.string('key', 40).primary();
    t.string('value', 100).notNullable();
  });

  // Starting prices. Google's were read from Google's price page on 2026-11-04 (first price tier, USD per call).
  // Everything with verified=false is a placeholder: set it from your own contract or invoice on the Services page.
  const row = (service, operation, label, o) => ({ service, operation, label, currency: 'USD', unit_price: 0, percent_fee: 0, free_units: 0, verified: false, note: null, ...o });
  await knex('service_prices').insert([
    row('google_maps', 'places_text_search', 'Place search (Text Search Pro)', { unit_price: 0.032, free_units: 5000, verified: true, note: 'Google: USD 32 per 1,000 after 5,000 free a month' }),
    row('google_maps', 'geocode_reverse', 'Address from map point (Geocoding)', { unit_price: 0.005, free_units: 10000, verified: true, note: 'Google: USD 5 per 1,000 after 10,000 free a month' }),
    row('google_maps', 'map_load', 'Map shown in an app (Dynamic Maps)', { unit_price: 0.007, free_units: 10000, verified: true, note: 'Google: USD 7 per 1,000 after 10,000 free a month. Phone apps using the native Maps SDK are free.' }),
    row('google_maps', 'route', 'Road route (Routes Essentials)', { unit_price: 0.005, free_units: 10000, verified: true, note: 'Google: USD 5 per 1,000 after 10,000 free a month' }),
    row('osm', 'places_search', 'OpenStreetMap place search', { note: 'Free. Public servers allow light use only; use your own server when you grow.' }),
    row('osm', 'places_reverse', 'OpenStreetMap address from point', { note: 'Free, same fair-use rule' }),
    row('osrm', 'route', 'OSRM road route', { note: 'Free public demo server: for development only. Host your own in production.' }),
    row('africastalking', 'sms', 'SMS (per SMS part)', { currency: 'TZS', unit_price: 25, note: 'Placeholder. Africa\'s Talking sends the real cost with every SMS and the page uses it when it is there.' }),
    row('whatsapp', 'message', 'WhatsApp template message', { unit_price: 0.02, note: 'Placeholder. Meta charges per message by type and country; copy your rate here.' }),
    row('selcom', 'collect', 'Mobile money collection', { currency: 'TZS', percent_fee: 1.5, note: 'Placeholder percentage. Use the fee in your Selcom agreement.' }),
    row('selcom', 'status', 'Payment status check', { currency: 'TZS', note: 'Not charged' }),
    row('selcom', 'payout', 'Payout to a worker', { currency: 'TZS', percent_fee: 1, note: 'Placeholder percentage. Payouts are not connected yet.' }),
    row('nida', 'check', 'NIDA identity check (one hit)', { currency: 'TZS', unit_price: 1000, note: 'Placeholder: what NIDA or your vendor charges for one hit. The worker pays 1,000 TSh per try.' }),
    row('expo_push', 'push', 'Phone push notification', { note: 'Free' }),
  ]);
  await knex('service_settings').insert([
    { key: 'usd_to_tzs', value: '2600' },
    { key: 'monthly_budget_tzs', value: '0' },
  ]);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('service_settings');
  await knex.schema.dropTableIfExists('service_prices');
  await knex.schema.dropTableIfExists('service_usage');
};
