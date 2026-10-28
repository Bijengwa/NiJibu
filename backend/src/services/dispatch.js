// Matching: finds nearby providers and offers them the job, a few at a time.
// It is driven by the database (offers have an expiry time), so a server restart loses nothing.
const db = require('../db');
const { distanceKm, boundingBox } = require('../lib/geo');
const realtime = require('../lib/realtime');
const { notify } = require('./notify');
const { sendPush } = require('../lib/push');

const RADII_KM = [3, 5, 10]; // start close, widen when nobody is found
const BATCH_SIZE = 3; // offers sent at the same time
const OFFER_TTL_MS = 45 * 1000;
// A provider not seen for this long counts as offline. The worker app sends its place every 30 s while it is open;
// a phone that sleeps or has the app in the background stops sending, so allow a few minutes.
const FRESH_MS = (Number(process.env.PROVIDER_FRESH_SECONDS) || 5 * 60) * 1000;
const MAX_TRIES = 2; // a fundi who did not answer (offer ran out) is asked once more before we move on
const MAX_SEARCH_MS = 5 * 60 * 1000; // give up after 5 minutes
const WAIT_FOR_ANYONE_MS = 2 * 60 * 1000; // when nobody at all is found, keep looking this long (a fundi may go online)
const ACTIVE_JOB = ['accepted', 'on_the_way', 'arrived', 'in_progress'];

// Verified providers who are online, offer the service, are free, and are inside the radius.
// Nearest first. `q` can be db or a transaction.
async function findCandidates(q, { serviceId, lat, lng, radiusKm, customerId, excludeIds = [] }) {
  const box = boundingBox(lat, lng, radiusKm);
  const rows = await q('provider_profiles as p')
    .join('provider_services as ps', 'ps.provider_id', 'p.id')
    .where('ps.service_id', serviceId)
    .where({ 'p.is_online': true, 'p.verification_status': 'verified' })
    .where('p.last_seen', '>', new Date(Date.now() - FRESH_MS))
    .whereBetween('p.lat', [box.minLat, box.maxLat])
    .whereBetween('p.lng', [box.minLng, box.maxLng])
    .whereNot('p.user_id', customerId ?? 0) // you cannot be your own provider
    .whereNotIn('p.id', excludeIds)
    .whereNotExists(function () {
      this.select(q.raw('1')).from('requests as r').whereRaw('r.provider_id = p.id').whereIn('r.status', ACTIVE_JOB);
    })
    .select('p.id', 'p.user_id', 'p.lat', 'p.lng');

  return rows
    .map((p) => ({ ...p, distance_km: distanceKm(lat, lng, p.lat, p.lng) }))
    .filter((p) => p.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);
}

// Count the providers that pass each filter, one more filter at a time, so the log says exactly
// why nobody was found (wrong job, not verified, offline, too far, same account...).
async function explainNoCandidates(q, { serviceId, lat, lng, radiusKm, customerId }) {
  const box = boundingBox(lat, lng, radiusKm);
  const count = async (fn) => Number((await fn(q('provider_profiles as p').join('provider_services as ps', 'ps.provider_id', 'p.id').count({ n: 'p.id' }).first())).n);
  const withService = await count((b) => b.where('ps.service_id', serviceId));
  const verified = await count((b) => b.where('ps.service_id', serviceId).where('p.verification_status', 'verified'));
  const online = await count((b) => b.where('ps.service_id', serviceId).where('p.verification_status', 'verified').where('p.is_online', true));
  const fresh = await count((b) => b.where('ps.service_id', serviceId).where('p.verification_status', 'verified').where('p.is_online', true).where('p.last_seen', '>', new Date(Date.now() - FRESH_MS)));
  const near = await count((b) => b.where('ps.service_id', serviceId).where('p.verification_status', 'verified').where('p.is_online', true).where('p.last_seen', '>', new Date(Date.now() - FRESH_MS)).whereBetween('p.lat', [box.minLat, box.maxLat]).whereBetween('p.lng', [box.minLng, box.maxLng]));
  const own = await count((b) => b.where('ps.service_id', serviceId).where('p.user_id', customerId ?? 0));
  return { withService, verified, online, fresh, inRadius: near, ownAccount: own };
}

// Tell both sides (and the job room) that the status changed. The apps refetch the request.
async function publishStatus(requestId) {
  const r = await db('requests')
    .leftJoin('provider_profiles as p', 'p.id', 'requests.provider_id')
    .where('requests.id', requestId)
    .first('requests.status', 'requests.customer_id', 'p.user_id as provider_user_id');
  if (!r) return;
  const payload = { request_id: requestId, status: r.status, at: new Date().toISOString() };
  realtime.emitToUser(r.customer_id, 'request:status', payload);
  if (r.provider_user_id) realtime.emitToUser(r.provider_user_id, 'request:status', payload);
  realtime.emitToRequest(requestId, 'request:status', payload);
}

// What a provider may see in an offer: no phone, no exact point, no note (those come after accept).
function offerView(offer, service, request) {
  return {
    offer_id: offer.id,
    request_id: offer.request_id,
    service: { id: service.id, slug: service.slug, name_sw: service.name_sw, name_en: service.name_en },
    distance_km: Math.round(offer.distance_km * 10) / 10,
    address: request.address,
    expires_at: offer.expires_at,
  };
}

// Do the next step for one searching request: offer to the next batch, widen the radius, or give up.
async function advance(requestId) {
  const effects = [];

  await db.transaction(async (trx) => {
    // Lock the row so two ticks can never work on the same request together
    const req = await trx('requests').where({ id: requestId }).forUpdate().first();
    if (!req || req.status !== 'searching') return;

    const live = await trx('request_offers')
      .where({ request_id: req.id, status: 'sent' })
      .where('expires_at', '>', new Date())
      .first();
    if (live) return; // still waiting for answers

    const giveUp = async () => {
      await trx('requests').where({ id: req.id }).update({ status: 'no_provider' });
      effects.push(async () => {
        await publishStatus(req.id);
        await notify(req.customer_id, 'no_provider', 'No provider found', 'No provider is available near you right now. Please try again later.');
      });
    };

    if (Date.now() - new Date(req.created_at).getTime() > MAX_SEARCH_MS) return giveUp();

    const service = await trx('services').where({ id: req.service_id }).first();
    // Who not to ask again: answered (declined / accepted / closed), or asked MAX_TRIES times without an answer
    const past = await trx('request_offers').where({ request_id: req.id }).select('id', 'provider_id', 'status', 'tries');
    const alreadyOffered = past.filter((o) => o.status !== 'expired' || o.tries >= MAX_TRIES).map((o) => o.provider_id);
    const expiredOnce = new Map(past.filter((o) => o.status === 'expired' && o.tries < MAX_TRIES).map((o) => [o.provider_id, o]));

    let radius = req.search_radius_km;
    for (;;) {
      const found = await findCandidates(trx, {
        serviceId: req.service_id,
        lat: req.lat,
        lng: req.lng,
        radiusKm: radius,
        customerId: req.customer_id,
        excludeIds: alreadyOffered,
      });

      if (found.length) {
        const expires_at = new Date(Date.now() + OFFER_TTL_MS);
        for (const p of found.slice(0, BATCH_SIZE)) {
          const again = expiredOnce.get(p.id);
          const [offer] = again
            ? await trx('request_offers').where({ id: again.id }).update({ status: 'sent', expires_at, distance_km: p.distance_km, tries: again.tries + 1 }).returning('*')
            : await trx('request_offers')
                .insert({ request_id: req.id, provider_id: p.id, distance_km: p.distance_km, expires_at, tries: 1 })
                .returning('*');
          effects.push(async () => {
            realtime.emitToUser(p.user_id, 'offer:new', offerView(offer, service, req));
            // Also a phone alert, for a fundi whose app is closed or in the background
            sendPush(p.user_id, {
              title: `${service.name_en} - ${Math.round(offer.distance_km * 10) / 10} km`,
              body: req.address || 'New request near you',
              data: { type: 'offer', offer_id: offer.id },
            });
          });
        }
        if (radius !== req.search_radius_km) await trx('requests').where({ id: req.id }).update({ search_radius_km: radius });
        return;
      }

      const next = RADII_KM.find((r) => r > radius);
      if (!next) {
        // Say why in the server log (once per request, here at the widest radius)
        const why = await explainNoCandidates(trx, { serviceId: req.service_id, lat: req.lat, lng: req.lng, radiusKm: radius, customerId: req.customer_id });
        const age = Date.now() - new Date(req.created_at).getTime();
        if (!alreadyOffered.length && age < WAIT_FOR_ANYONE_MS) {
          // Nobody was ever found: keep looking for a short time, a fundi may just be going online
          if (radius !== req.search_radius_km) await trx('requests').where({ id: req.id }).update({ search_radius_km: radius });
          if (age % 30000 < 5500) {
            console.warn(`[dispatch] request ${req.id}: no provider yet. service=${req.service_id} at ${req.lat},${req.lng} radius=${radius}km`, why,
              '(withService = fundis with this job; verified; online; fresh = seen recently; inRadius; ownAccount = the customer is the fundi)');
          }
          return;
        }
        console.warn(`[dispatch] request ${req.id}: no provider found. service=${req.service_id} at ${req.lat},${req.lng} radius=${radius}km`, why,
          '(withService = fundis with this job; verified; online; fresh = seen recently; inRadius; ownAccount = the customer is the fundi)');
        return giveUp();
      }
      radius = next;
    }
  });

  for (const run of effects) await run();
}

// Offers whose time ran out: mark them and tell the provider's app to remove the card.
async function expireOffers() {
  const expired = await db('request_offers as o')
    .join('provider_profiles as p', 'p.id', 'o.provider_id')
    .where('o.status', 'sent')
    .where('o.expires_at', '<=', new Date())
    .select('o.id', 'o.request_id', 'p.user_id');
  if (!expired.length) return;
  await db('request_offers').whereIn('id', expired.map((o) => o.id)).where({ status: 'sent' }).update({ status: 'expired' });
  for (const o of expired) realtime.emitToUser(o.user_id, 'offer:closed', { offer_id: o.id, request_id: o.request_id, reason: 'expired' });
}

// Runs every few seconds from server.js
async function tick() {
  // Providers who stopped sending signals go offline
  await db('provider_profiles')
    .where({ is_online: true })
    .where('last_seen', '<', new Date(Date.now() - FRESH_MS))
    .update({ is_online: false });

  await expireOffers();

  const searching = await db('requests').where({ status: 'searching' }).pluck('id');
  for (const id of searching) {
    try {
      await advance(id);
    } catch (err) {
      console.error('dispatch advance failed for request', id, err.message);
    }
  }
}

module.exports = { findCandidates, advance, tick, publishStatus, expireOffers, offerView, RADII_KM, ACTIVE_JOB };
