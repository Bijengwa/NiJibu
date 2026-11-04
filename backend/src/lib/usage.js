// Records every call to an outside service (see migrations/..._service_usage.js).
// record() never throws and never waits: tracking must not slow down or break the real work.
const db = require('../db');

const off = () => process.env.USAGE_TRACKING === 'off';

function record({ service, operation, units = 1, ok = true, cached = false, ms = null, amount_tzs = null, reported_cost = null, reported_currency = null, tag = null }) {
  if (off()) return;
  db('service_usage')
    .insert({
      service, operation, units: Math.max(0, Math.round(units)), ok, cached,
      ms: ms === null ? null : Math.round(ms),
      amount_tzs: amount_tzs === null ? null : Math.round(amount_tzs),
      reported_cost, reported_currency, tag,
    })
    .catch((e) => console.warn('[usage] not saved:', e.message));
}

// Run fn(), measure it and record it. ok = false when it throws (the error still goes to the caller).
// `after(result)` may return extra fields to record (units, amount_tzs, ok, ...).
async function track(service, operation, fn, after) {
  const t0 = Date.now();
  try {
    const result = await fn();
    record({ service, operation, ms: Date.now() - t0, ...(after ? after(result) : {}) });
    return result;
  } catch (e) {
    record({ service, operation, ok: false, ms: Date.now() - t0 });
    throw e;
  }
}

// SMS parts: 160 characters for one part, 153 for each part of a longer text. Any non-GSM character (for example "ë")
// makes it Unicode: 70 / 67. Our texts are plain, but the count is kept honest.
const GSM = /^[\n\r\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]*$/;
function smsParts(text) {
  const t = String(text || '');
  const unicode = !GSM.test(t);
  const [one, many] = unicode ? [70, 67] : [160, 153];
  return t.length <= one ? 1 : Math.ceil(t.length / many);
}

module.exports = { record, track, smsParts };
