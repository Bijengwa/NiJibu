// The life of a request: create, accept, move through the stages, cancel.
// Every state change is ONE guarded update (`where status = <expected>`), so double taps,
// two providers accepting together, or a cancel racing with a stage change cannot corrupt a job.
const db = require('../db');
const { HttpError } = require('../lib/httpError');
const { distanceKm } = require('../lib/geo');
const { avatarUrl } = require('../lib/user');
const realtime = require('../lib/realtime');
const { notify } = require('./notify');
const dispatch = require('./dispatch');
const payments = require('./payments');

const ARRIVE_MAX_KM = Number(process.env.ARRIVE_MAX_KM ?? 0.5); // 0 = do not check (dev only)
const AVG_SPEED_KMH = 20; // rough city speed for the ETA until real routing is added

// stage name in the URL -> change
const STAGES = {
  'on-the-way': { from: ['accepted'], to: 'on_the_way', at: 'on_the_way_at' },
  arrived: { from: ['on_the_way'], to: 'arrived', at: 'arrived_at' },
  start: { from: ['arrived'], to: 'in_progress', at: 'started_at' },
  complete: { from: ['in_progress'], to: 'completed', at: 'completed_at' },
};

// A finished job that the customer has not paid yet (there is no "pay later": pay first, then ask again)
async function unpaidJobOf(customerId) {
  return db('requests as r')
    .where({ 'r.customer_id': customerId, 'r.status': 'completed' })
    .whereNotNull('r.agreed_price')
    .whereNotExists(function () {
      this.select(db.raw('1')).from('payments as pay').whereRaw('pay.request_id = r.id').where('pay.status', 'paid');
    })
    .orderBy('r.id', 'desc')
    .first('r.id');
}

async function createRequest(user, { service_id, lat, lng, address, note }) {
  if (await unpaidJobOf(user.id)) throw new HttpError(409, 'PAYMENT_DUE', 'Pay for your finished job first');
  const service = await db('services').where({ id: service_id, active: true }).first();
  if (!service) throw new HttpError(400, 'VALIDATION', 'Unknown service');

  let request;
  try {
    [request] = await db('requests')
      .insert({
        customer_id: user.id,
        service_id: service.id,
        lat,
        lng,
        address: address || null,
        note: note || null,
      })
      .returning('*');
  } catch (err) {
    // the unique index: this customer already has an open request
    if (err.code === '23505') throw new HttpError(409, 'ALREADY_OPEN', 'You already have an open request');
    throw err;
  }

  await dispatch.advance(request.id); // first offers go out right away
  return request.id;
}

async function acceptOffer(user, offerId) {
  const closedUsers = [];
  let requestId;

  await db.transaction(async (trx) => {
    const offer = await trx('request_offers as o')
      .join('provider_profiles as p', 'p.id', 'o.provider_id')
      .where('o.id', offerId)
      .forUpdate()
      .first('o.*', 'p.user_id as provider_user_id');

    if (!offer || offer.provider_user_id !== user.id) throw new HttpError(404, 'NOT_FOUND', 'Offer not found');
    if (offer.status !== 'sent' || new Date(offer.expires_at) <= new Date()) {
      // Not available any more. Say "taken" if another provider holds the job, else "expired".
      const r = await trx('requests').where({ id: offer.request_id }).first('provider_id');
      if (r && r.provider_id && r.provider_id !== offer.provider_id) {
        throw new HttpError(409, 'ALREADY_TAKEN', 'Someone else took this job');
      }
      throw new HttpError(410, 'OFFER_EXPIRED', 'This offer is no longer available');
    }
    requestId = offer.request_id;

    // The one guarded update: only the first provider to get here wins
    let won;
    try {
      [won] = await trx('requests')
        .where({ id: offer.request_id, status: 'searching' })
        .update({ provider_id: offer.provider_id, status: 'accepted', accepted_at: db.fn.now() })
        .returning('id');
    } catch (err) {
      // unique index: this provider already has a job in progress
      if (err.code === '23505') throw new HttpError(409, 'PROVIDER_BUSY', 'Finish your current job first');
      throw err;
    }
    if (!won) throw new HttpError(409, 'ALREADY_TAKEN', 'Someone else took this job');

    await trx('request_offers').where({ id: offer.id }).update({ status: 'accepted' });
    const others = await trx('request_offers as o')
      .join('provider_profiles as p', 'p.id', 'o.provider_id')
      .where({ 'o.request_id': offer.request_id, 'o.status': 'sent' })
      .select('o.id', 'p.user_id');
    if (others.length) {
      await trx('request_offers').whereIn('id', others.map((o) => o.id)).update({ status: 'closed' });
      closedUsers.push(...others);
    }
  });

  for (const o of closedUsers) realtime.emitToUser(o.user_id, 'offer:closed', { offer_id: o.id, request_id: requestId, reason: 'taken' });
  const r = await db('requests').where({ id: requestId }).first('customer_id');
  await notify(r.customer_id, 'request_accepted', 'Provider on the way soon', 'A provider accepted your request.');
  await dispatch.publishStatus(requestId);
  return requestId;
}

async function declineOffer(user, offerId) {
  const offer = await db('request_offers as o')
    .join('provider_profiles as p', 'p.id', 'o.provider_id')
    .where({ 'o.id': offerId, 'p.user_id': user.id })
    .first('o.id', 'o.request_id');
  if (!offer) throw new HttpError(404, 'NOT_FOUND', 'Offer not found');

  const changed = await db('request_offers').where({ id: offer.id, status: 'sent' }).update({ status: 'declined' });
  if (changed) await dispatch.advance(offer.request_id); // maybe everyone declined: next batch now
}

// Provider moves the job forward: on-the-way -> arrived -> start -> complete
async function moveStage(user, requestId, stageName, body = {}) {
  const stage = STAGES[stageName];
  if (!stage) throw new HttpError(404, 'NOT_FOUND', 'Unknown stage');

  const job = await db('requests as r')
    .join('provider_profiles as p', 'p.id', 'r.provider_id')
    .where({ 'r.id': requestId, 'p.user_id': user.id })
    .first('r.*', 'p.lat as p_lat', 'p.lng as p_lng');
  if (!job) throw new HttpError(404, 'NOT_FOUND', 'Request not found');

  // Wrong step? Say so first (the guarded update below is still the real protection)
  if (!stage.from.includes(job.status)) throw new HttpError(409, 'BAD_STATE', 'This step is not allowed now');

  if (stageName === 'arrived' && ARRIVE_MAX_KM > 0 && job.p_lat != null) {
    const away = distanceKm(job.lat, job.lng, job.p_lat, job.p_lng);
    if (away > ARRIVE_MAX_KM) throw new HttpError(400, 'TOO_FAR', 'You are not at the customer location yet');
  }

  // The fundi sets the price BEFORE the work starts. When the work is done the customer confirms it and pays in the app.
  const change = { status: stage.to, [stage.at]: db.fn.now() };
  if (stageName === 'start') {
    if (!payments.validPrice(body.price)) throw new HttpError(400, 'PRICE_REQUIRED', 'Enter the price of the job');
    change.agreed_price = body.price;
  }

  const changed = await db('requests')
    .where({ id: requestId, provider_id: job.provider_id })
    .whereIn('status', stage.from)
    .update(change);
  if (!changed) throw new HttpError(409, 'BAD_STATE', 'This step is not allowed now');

  const text = {
    on_the_way: ['provider_on_the_way', 'Provider is on the way', 'Your provider has started driving to you.'],
    arrived: ['provider_arrived', 'Provider has arrived', 'Your provider is at your location.'],
    in_progress: ['job_started', 'Work started', `The work has started. Price: TZS ${change.agreed_price}.`],
    completed: ['job_completed', 'Work completed', 'The fundi says the work is done. Please confirm and pay in the app.'],
  }[stage.to];
  await notify(job.customer_id, ...text);
  await dispatch.publishStatus(requestId);
}

// Customer: "yes, the work is done". Only after this the customer can pay.
async function confirmWork(user, requestId) {
  const r = await db('requests').where({ id: requestId, customer_id: user.id }).first();
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Request not found');
  if (r.status !== 'completed' || !r.agreed_price) throw new HttpError(409, 'BAD_STATE', 'The fundi has not finished yet');
  const changed = await db('requests').where({ id: r.id, status: 'completed' }).whereNull('customer_confirmed_at').update({ customer_confirmed_at: db.fn.now() });
  if (changed) {
    const p = await db('provider_profiles').where({ id: r.provider_id }).first('user_id');
    if (p) await notify(p.user_id, 'work_confirmed', 'Customer confirmed the work', 'The customer confirmed the work. Payment is next.');
    await dispatch.publishStatus(r.id);
  }
}

// Customer or provider cancels before the work starts.
async function cancelRequest(user, requestId, reason) {
  const r = await db('requests as r')
    .leftJoin('provider_profiles as p', 'p.id', 'r.provider_id')
    .where('r.id', requestId)
    .first('r.*', 'p.user_id as provider_user_id');
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Request not found');

  const asCustomer = r.customer_id === user.id;
  const asProvider = r.provider_user_id === user.id;
  if (!asCustomer && !asProvider) throw new HttpError(404, 'NOT_FOUND', 'Request not found');

  const allowed = asCustomer ? ['searching', 'accepted', 'on_the_way', 'arrived'] : ['accepted', 'on_the_way', 'arrived'];
  const changed = await db('requests').where({ id: r.id }).whereIn('status', allowed).update({
    status: 'cancelled',
    cancelled_by: asCustomer ? 'customer' : 'provider',
    cancel_reason: reason ? String(reason).slice(0, 200) : null,
    cancelled_at: db.fn.now(),
  });
  if (!changed) throw new HttpError(409, 'BAD_STATE', 'This request can no longer be cancelled');

  // Close offers that are still waiting
  const open = await db('request_offers as o')
    .join('provider_profiles as p', 'p.id', 'o.provider_id')
    .where({ 'o.request_id': r.id, 'o.status': 'sent' })
    .select('o.id', 'p.user_id');
  if (open.length) {
    await db('request_offers').whereIn('id', open.map((o) => o.id)).update({ status: 'closed' });
    for (const o of open) realtime.emitToUser(o.user_id, 'offer:closed', { offer_id: o.id, request_id: r.id, reason: 'cancelled' });
  }

  const other = asCustomer ? r.provider_user_id : r.customer_id;
  if (other) {
    await notify(other, 'request_cancelled', 'Request cancelled', asCustomer ? 'The customer cancelled the request.' : 'The provider cancelled. You can request again.');
  }
  await dispatch.publishStatus(r.id);
}

// ---- What each side may see ----

async function loadView(user, requestId) {
  const r = await db('requests as r')
    .join('services as s', 's.id', 'r.service_id')
    .join('users as cu', 'cu.id', 'r.customer_id')
    .leftJoin('provider_profiles as p', 'p.id', 'r.provider_id')
    .leftJoin('users as pu', 'pu.id', 'p.user_id')
    .where('r.id', requestId)
    .first(
      'r.*',
      's.slug', 's.name_sw', 's.name_en',
      'cu.name as c_name', 'cu.phone as c_phone', 'cu.avatar_path as c_avatar',
      'p.user_id as p_user_id', 'p.lat as p_lat', 'p.lng as p_lng',
      'pu.name as p_name', 'pu.phone as p_phone', 'pu.avatar_path as p_avatar'
    );
  if (!r) return null;

  const isCustomer = r.customer_id === user.id;
  const isProvider = r.p_user_id === user.id;
  if (!isCustomer && !isProvider) return null;

  const base = {
    id: r.id,
    status: r.status,
    service: { id: r.service_id, slug: r.slug, name_sw: r.name_sw, name_en: r.name_en },
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    note: r.note,
    agreed_price: r.agreed_price,
    customer_confirmed_at: r.customer_confirmed_at,
    cancelled_by: r.cancelled_by,
    created_at: r.created_at,
    accepted_at: r.accepted_at,
    on_the_way_at: r.on_the_way_at,
    arrived_at: r.arrived_at,
    started_at: r.started_at,
    completed_at: r.completed_at,
    cancelled_at: r.cancelled_at,
  };

  if (isCustomer) {
    let provider = null;
    if (r.provider_id && r.status !== 'cancelled') {
      // Live position only while the provider is coming to you
      const live = ['accepted', 'on_the_way'].includes(r.status) && r.p_lat != null;
      provider = {
        name: r.p_name,
        phone: r.p_phone,
        avatar_url: avatarUrl({ avatar_path: r.p_avatar }),
        lat: live ? r.p_lat : null,
        lng: live ? r.p_lng : null,
        eta_min: live ? Math.max(1, Math.round((distanceKm(r.lat, r.lng, r.p_lat, r.p_lng) / AVG_SPEED_KMH) * 60)) : null,
      };
    }
    return { ...base, role: 'customer', provider, payment: await payments.paymentView(r.id, 'customer') };
  }

  // Provider side: customer details only while the job is yours and active
  const active = ['accepted', 'on_the_way', 'arrived', 'in_progress'].includes(r.status);
  return {
    ...base,
    role: 'provider',
    payment: await payments.paymentView(r.id, 'provider'),
    customer: active || r.status === 'completed'
      ? { name: r.c_name, phone: r.c_phone, avatar_url: avatarUrl({ avatar_path: r.c_avatar }) }
      : null,
  };
}

module.exports = { unpaidJobOf, createRequest, acceptOffer, declineOffer, moveStage, confirmWork, cancelRequest, loadView, STAGES };
