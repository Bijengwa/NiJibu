const db = require('../db');

// What the Worker app shows about the fundi.
// status: incomplete (registration fee not paid yet) | pending | verified | rejected
async function providerView(userId) {
  const user = await db('users').where({ id: userId }).first('name', 'email');
  const p = await db('provider_profiles').where({ user_id: userId }).first();
  const base = { full_name: user?.name || null, email: user?.email || null };
  if (!p) {
    return { status: 'incomplete', rejection_reason: null, ...base, services: [], region: null, district: null,
      ward: null, service_details: [], other_jobs: [], lat: null, lng: null, experience: null, availability: null, fee_paid: false, payout_set: false, is_online: false };
  }
  const details = await db('provider_services as ps')
    .join('services as s', 's.id', 'ps.service_id')
    .where('ps.provider_id', p.id)
    .where('s.status', 'approved') // jobs the worker wrote and the admin has not approved yet are in other_jobs
    .select('s.slug as key', 'ps.experience', 'ps.availability');
  const services = details.map((d) => d.key);
  const other_jobs = await db('service_suggestions')
    .where({ provider_id: p.id })
    .whereIn('status', ['pending', 'rejected'])
    .orderBy('id')
    .select('name', 'name_sw', 'name_en', 'experience', 'availability', 'status');
  return {
    status: p.registered_at ? p.verification_status : 'incomplete',
    rejection_reason: p.rejection_reason,
    ...base,
    services,
    service_details: details,
    other_jobs,
    region: p.region,
    district: p.district,
    ward: p.ward,
    lat: p.work_lat,
    lng: p.work_lng,
    experience: p.experience,
    availability: p.availability,
    fee_paid: !!p.registered_at,
    payout_set: !!p.payout_number,
    is_online: p.is_online,
  };
}

module.exports = { providerView };
