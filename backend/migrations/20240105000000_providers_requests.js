// Services list, providers, requests, offers and search log.
// One person = one users row. A user is also a provider when they have a provider_profiles row.
exports.up = async (knex) => {
  await knex.schema.createTable('services', (t) => {
    t.increments('id').primary();
    t.string('slug', 40).notNullable().unique();
    t.string('name_sw', 80).notNullable();
    t.string('name_en', 80).notNullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('provider_profiles', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
    // pending -> verified | rejected (NIDA check sets this; never set it from the app)
    t.string('verification_status', 20).notNullable().defaultTo('pending');
    t.timestamp('verified_at').nullable();
    t.boolean('is_online').notNullable().defaultTo(false);
    t.double('lat').nullable();
    t.double('lng').nullable();
    t.timestamp('last_seen').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['is_online', 'lat', 'lng']);
  });

  await knex.schema.createTable('provider_services', (t) => {
    t.integer('provider_id').notNullable().references('id').inTable('provider_profiles').onDelete('CASCADE');
    t.integer('service_id').notNullable().references('id').inTable('services').onDelete('CASCADE');
    t.primary(['provider_id', 'service_id']);
  });

  await knex.schema.createTable('requests', (t) => {
    t.increments('id').primary();
    t.integer('customer_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('service_id').notNullable().references('id').inTable('services');
    t.integer('provider_id').nullable().references('id').inTable('provider_profiles');
    // searching | accepted | on_the_way | arrived | in_progress | completed | cancelled | no_provider
    t.string('status', 20).notNullable().defaultTo('searching');
    t.double('lat').notNullable();
    t.double('lng').notNullable();
    t.string('address', 200).nullable();
    t.string('note', 300).nullable();
    t.integer('search_radius_km').notNullable().defaultTo(3);
    t.integer('agreed_price').nullable(); // TZS, agreed with the fundi (used tomorrow)
    t.string('cancelled_by', 10).nullable(); // customer | provider | system
    t.string('cancel_reason', 200).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('accepted_at').nullable();
    t.timestamp('on_the_way_at').nullable();
    t.timestamp('arrived_at').nullable();
    t.timestamp('started_at').nullable();
    t.timestamp('completed_at').nullable();
    t.timestamp('cancelled_at').nullable();
    t.index(['status', 'created_at']);
    t.index(['customer_id', 'created_at']);
    t.index(['provider_id', 'created_at']);
  });

  // Database-level guards (they hold even when two requests race):
  // - a customer can have only one open request
  // - a provider can have only one job in progress
  await knex.raw(
    `create unique index requests_one_open_per_customer on requests (customer_id)
     where status in ('searching','accepted','on_the_way','arrived','in_progress')`
  );
  await knex.raw(
    `create unique index requests_one_job_per_provider on requests (provider_id)
     where status in ('accepted','on_the_way','arrived','in_progress')`
  );

  await knex.schema.createTable('request_offers', (t) => {
    t.increments('id').primary();
    t.integer('request_id').notNullable().references('id').inTable('requests').onDelete('CASCADE');
    t.integer('provider_id').notNullable().references('id').inTable('provider_profiles').onDelete('CASCADE');
    // sent | accepted | declined | expired | closed (someone else took the job)
    t.string('status', 12).notNullable().defaultTo('sent');
    t.double('distance_km').notNullable();
    t.timestamp('expires_at').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['request_id', 'provider_id']); // a provider is offered a request only once
    t.index(['provider_id', 'status']);
  });

  await knex.schema.createTable('search_logs', (t) => {
    t.increments('id').primary();
    t.integer('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.integer('service_id').notNullable().references('id').inTable('services');
    t.double('lat').nullable();
    t.double('lng').nullable();
    t.integer('providers_found').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['service_id', 'providers_found', 'created_at']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('search_logs');
  await knex.schema.dropTableIfExists('request_offers');
  await knex.schema.dropTableIfExists('requests');
  await knex.schema.dropTableIfExists('provider_services');
  await knex.schema.dropTableIfExists('provider_profiles');
  await knex.schema.dropTableIfExists('services');
};
