// Matching: finds nearby providers and offers them the job, a few at a time.
// It is driven by the database (offers have an expiry time), so a server restart loses nothing.
const db = require('../db');
const { distanceKm, boundingBox } = require('../lib/geo');
const realtime = require('../lib/realtime');
const { notify } = require('./notify');

const RADII_KM = [3, 5, 10]; // start close, widen when nobody is found
const BATCH_SIZE = 3; // offers sent at the same time
const OFFER_TTL_MS = 45 * 1000;
const FRESH_MS = 2 * 60 * 1000; // a provider not seen for 2 minutes counts as offline
const MAX_SEARCH_MS = 5 * 60 * 1000; // give up after 5 minutes
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
    const alreadyOffered = await trx('request_offers').where({ request_id: req.id }).pluck('provider_id');

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
          const [offer] = await trx('request_offers')
            .insert({ request_id: req.id, provider_id: p.id, distance_km: p.distance_km, expires_at })
            .returning('*');
          effects.push(async () => realtime.emitToUser(p.user_id, 'offer:new', offerView(offer, service, req)));
        }
        if (radius !== req.search_radius_km) await trx('requests').where({ id: req.id }).update({ search_radius_km: radius });
        return;
      }

      const next = RADII_KM.find((r) => r > radius);
      if (!next) return giveUp();
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
