// Why a job was cancelled once a worker was involved. Fixed lists, so the admin can count them.
// "price_not_agreed" is the usual case: the customer and the worker could not agree on the price.
const REASONS = {
  customer: ['price_not_agreed', 'waiting_too_long', 'wrong_job', 'changed_mind', 'found_other', 'other'],
  worker: ['price_not_agreed', 'cannot_reach', 'customer_unreachable', 'wrong_location', 'emergency', 'other'],
};

const LABEL = {
  price_not_agreed: 'We could not agree on the price',
  waiting_too_long: 'The worker is taking too long',
  wrong_job: 'The job is not what I asked for',
  changed_mind: 'I changed my mind',
  found_other: 'I found another worker',
  cannot_reach: 'I cannot reach the place',
  customer_unreachable: 'The customer does not answer',
  wrong_location: 'The place is wrong or too far',
  emergency: 'I have an emergency',
  other: 'Other reason',
};

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// body = { code, reason }  ->  { code, text } or null (no reason given)
// A text sent without a code (old apps) counts as "other".
function read(role, body = {}) {
  let code = clean(body.code, 30);
  const text = clean(body.reason, 200);
  if (!code && text) code = 'other';
  if (!code) return null;
  if (!REASONS[role]?.includes(code)) return { bad: true };
  if (code === 'other' && text.length < 5) return { bad: true };
  const label = LABEL[code];
  return { code, text: code === 'other' ? text : text ? `${label}: ${text}` : label };
}

module.exports = { REASONS, LABEL, read };
