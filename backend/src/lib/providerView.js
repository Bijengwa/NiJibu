const db = require('../db');

// What the Worker app shows about the fundi.
// status: incomplete (no NIDA yet) | pending | verified | rejected
async function providerView(userId) {
  const user = await db('users').where({ id: userId }).first('name', 'email');
  const p = await db('provider_profiles').where({ user_id: userId }).first();
  const base = { full_name: user?.name || null, email: user?.email || null };
  if (!p) {
    return { status: 'incomplete', rejection_reason: null, ...base, nida_name: null, services: [], region: null, district: null,
      ward: null, lat: null, lng: null, experience: null, availability: null, nida_submitted: false, payout_set: false, is_online: false };
  }
  const services = await db('provider_services as ps').join('services as s', 's.id', 'ps.service_id').where('ps.provider_id', p.id).pluck('s.slug');
  return {
    status: p.nida_submitted ? p.verification_status : 'incomplete',
    rejection_reason: p.rejection_reason,
    ...base,
    nida_name: p.nida_name,
    services,
    region: p.region,
    district: p.district,
    ward: p.ward,
    lat: p.work_lat,
    lng: p.work_lng,
    experience: p.experience,
    availability: p.availability,
    nida_submitted: p.nida_submitted,
    payout_set: !!p.payout_number,
    is_online: p.is_online,
  };
}

module.exports = { providerView };
