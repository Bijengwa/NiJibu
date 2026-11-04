// SMS (Africa's Talking) and WhatsApp (Meta WhatsApp Cloud API) to customers and fundis.
//
// MESSAGING_MODE:
//   off      nothing is sent (default when NODE_ENV=test)
//   console  prints the message in the backend terminal, sends nothing (default in development)
//   live     sends for real (default in production)
//
// Rules:
//  - the OTP code and the message text are never saved in the database (message_log keeps only the template name)
//  - WhatsApp is used only when the user agreed (users.whatsapp_opt_in) or the OTP is set to WhatsApp; SMS is the fallback
//  - messages about a job are best effort: they never throw and never block the request
const db = require('../db');
const { HttpError } = require('../lib/httpError');
const usage = require('../lib/usage');

const tzs = (v) => Number(v || 0).toLocaleString('en-US');

const mode = () => process.env.MESSAGING_MODE || (process.env.NODE_ENV === 'test' ? 'off' : process.env.NODE_ENV === 'production' ? 'live' : 'console');

// Text per template. SMS texts are short on purpose (one SMS = 160 characters, no emojis).
// `wa` = the name of the template you create and get approved in Meta WhatsApp Manager (same order of {{1}}, {{2}} as `vars`).
const TEMPLATES = {
  otp: {
    wa: 'nijibu_otp', auth: true, vars: ['code'],
    sw: (p) => `Namba yako ya NiJibu ni ${p.code}. Inatumika dakika 10. Usimpe mtu yeyote.`,
    en: (p) => `Your NiJibu code is ${p.code}. Valid for 10 minutes. Do not share it.`,
  },
  request_accepted: {
    wa: 'nijibu_request_accepted', vars: [],
    sw: () => 'NiJibu: Fundi amekubali ombi lako. Fungua app kumfuatilia.',
    en: () => 'NiJibu: A fundi accepted your request. Open the app to follow him.',
  },
  provider_arrived: {
    wa: 'nijibu_provider_arrived', vars: [],
    sw: () => 'NiJibu: Fundi amefika mahali ulipo.',
    en: () => 'NiJibu: Your fundi has arrived.',
  },
  job_completed: {
    wa: 'nijibu_job_completed', vars: [],
    sw: () => 'NiJibu: Fundi amemaliza kazi. Fungua app, thibitisha kazi na ulipe.',
    en: () => 'NiJibu: The fundi finished the work. Open the app, confirm and pay.',
  },
  payment_done: {
    wa: 'nijibu_payment_done', vars: ['amount'],
    sw: (p) => `NiJibu: Tumepokea malipo yako ya TZS ${p.amount}. Asante.`,
    en: (p) => `NiJibu: We received your payment of TZS ${p.amount}. Thank you.`,
  },
  job_renamed: {
    wa: 'nijibu_job_renamed', vars: ['old', 'new'],
    sw: (p) => `NiJibu: Kazi yako "${p.old_sw}" sasa inaitwa "${p.new_sw}". Hakuna unachohitaji kufanya.`,
    en: (p) => `NiJibu: Your job "${p.old_en}" is now called "${p.new_en}". You do not need to do anything.`,
  },
  // The worker was paid. `code` = the job code (NJ-000012), so he knows which job the money is for.
  payment_received: {
    wa: 'nijibu_payment_received', vars: ['amount', 'code'],
    sw: (p) => `NiJibu: Tumekulipa TZS ${tzs(p.amount)}${p.code ? ` kwa kazi ${p.code}` : ''}. Angalia namba yako ya malipo.`,
    en: (p) => `NiJibu: We paid you TZS ${tzs(p.amount)}${p.code ? ` for job ${p.code}` : ''}. Check your payout number.`,
  },
};
// In-app notification type -> message template (only the events worth a paid SMS)
const FOR_NOTIFICATION = {
  request_accepted: 'request_accepted',
  provider_arrived: 'provider_arrived',
  job_completed: 'job_completed',
  payment_done: 'payment_done',
  payment_received: 'payment_received',
  job_renamed: 'job_renamed',
};

const log = (row) => db('message_log').insert(row).catch((e) => console.warn('[messaging] log failed:', e.message));
const fail = (code, message) => Object.assign(new Error(message || code), { code });

// Messages that are always sent, even if the person turned notifications off (security and money)
const ALWAYS = new Set(['payment_received']);

// ---- Africa's Talking SMS ----
// Africa's Talking answers with the real cost of the SMS ("TZS 25.0000"): it goes to the usage table
async function sendSms(phone, text, tag = null) {
  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  if (!username || !apiKey) throw fail('SMS_NOT_CONFIGURED', 'AT_USERNAME / AT_API_KEY missing');
  const base = process.env.AT_BASE_URL || (username === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com');
  const body = new URLSearchParams({ username, to: `+${phone}`, message: text });
  if (process.env.AT_SENDER_ID) body.set('from', process.env.AT_SENDER_ID);
  const t0 = Date.now();
  const parts = usage.smsParts(text);
  let res;
  try {
    res = await fetch(`${base}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    usage.record({ service: 'africastalking', operation: 'sms', ok: false, ms: Date.now() - t0, tag });
    throw e;
  }
  const json = await res.json().catch(() => null);
  const r = json?.SMSMessageData?.Recipients?.[0];
  // 100 Processed, 101 Sent, 102 Queued
  const ok = res.ok && r && [100, 101, 102].includes(r.statusCode);
  const cost = /^([A-Z]{3})\s+([\d.]+)$/.exec(String(r?.cost || '').trim());
  usage.record({
    service: 'africastalking', operation: 'sms', ok: Boolean(ok), units: parts, ms: Date.now() - t0, tag,
    reported_cost: ok && cost ? Number(cost[2]) : null, reported_currency: ok && cost ? cost[1] : null,
  });
  if (!ok) throw fail('SMS_FAILED', r?.status || json?.SMSMessageData?.Message || `HTTP ${res.status}`);
  return r.messageId || null;
}

// ---- Meta WhatsApp Cloud API (template messages) ----
async function sendWhatsApp(phone, tpl, lang, params) {
  const token = process.env.WA_ACCESS_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw fail('WHATSAPP_NOT_CONFIGURED', 'WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID missing');
  const values = tpl.vars.map((k) => String(params[k] ?? '-')); // WhatsApp refuses an empty value
  const components = [];
  if (values.length) components.push({ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) });
  // Authentication templates also need the code in the "copy code" button
  if (tpl.auth) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: values[0] }] });
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(`https://graph.facebook.com/${process.env.WA_API_VERSION || 'v21.0'}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: tpl.wa, language: { code: lang }, components } }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    usage.record({ service: 'whatsapp', operation: 'message', ok: false, ms: Date.now() - t0, tag: tpl.wa.replace(/^nijibu_/, '') });
    throw e;
  }
  const json = await res.json().catch(() => null);
  const id = json?.messages?.[0]?.id;
  usage.record({ service: 'whatsapp', operation: 'message', ok: Boolean(res.ok && id), ms: Date.now() - t0, tag: tpl.wa.replace(/^nijibu_/, '') });
  if (!res.ok || !id) throw fail('WHATSAPP_FAILED', json?.error?.message || `HTTP ${res.status}`);
  return id;
}

// Try WhatsApp first (when allowed), then SMS. Returns true when one of them worked.
async function deliver({ userId = null, phone, lang = 'sw', template, params = {}, whatsapp = false }) {
  const m = mode();
  if (m === 'off') return false;
  const tpl = TEMPLATES[template];
  if (!tpl) throw new Error(`Unknown message template: ${template}`);
  const l = lang === 'en' ? 'en' : 'sw';
  const text = tpl[l](params);

  const channels = whatsapp ? ['whatsapp', 'sms'] : ['sms'];
  for (const channel of channels) {
    try {
      let ref = null;
      if (m === 'console') {
        console.log(`\n[${channel.toUpperCase()}] +${phone}  ${template === 'otp' ? text : `${template}: ${text}`}\n`);
      } else {
        ref = channel === 'sms' ? await sendSms(phone, text, template) : await sendWhatsApp(phone, tpl, l, params);
      }
      await log({ user_id: userId, phone, channel, template, status: 'sent', provider_ref: ref });
      return true;
    } catch (e) {
      console.warn(`[messaging] ${channel} to +${phone} failed (${template}): ${e.message}`);
      await log({ user_id: userId, phone, channel, template, status: 'failed', error: String(e.code ? `${e.code}: ${e.message}` : e.message).slice(0, 200) });
    }
  }
  return false;
}

// The sign-up / login code. OTP_DELIVERY = console | sms | whatsapp (WhatsApp, then SMS if it fails).
// Throws OTP_SEND_FAILED so the app can say "could not send, try again".
async function sendOtp(user, code) {
  const how = process.env.OTP_DELIVERY || (process.env.NODE_ENV === 'production' ? 'sms' : 'console');
  if (how === 'console') {
    console.log(`\n[OTP] +${user.phone}  code: ${code}  (valid 10 min)\n`);
    return;
  }
  if (mode() === 'off') return;
  const ok = await deliver({ userId: user.id, phone: user.phone, lang: user.language || 'sw', template: 'otp', params: { code }, whatsapp: how === 'whatsapp' });
  if (!ok) throw new HttpError(502, 'OTP_SEND_FAILED', 'The code could not be sent. Try again.');
}

// A message about a job or payment. Best effort: never throws.
async function sendForNotification(userId, type, params = {}) {
  try {
    const template = FOR_NOTIFICATION[type];
    if (!template || mode() === 'off') return;
    const u = await db('users').where({ id: userId }).first('phone', 'language', 'whatsapp_opt_in', 'notifications_enabled');
    if (!u?.phone || (u.notifications_enabled === false && !ALWAYS.has(template))) return;
    await deliver({ userId, phone: u.phone, lang: u.language || 'sw', template, params, whatsapp: !!u.whatsapp_opt_in });
  } catch (e) {
    console.warn('[messaging] failed:', e.message);
  }
}

module.exports = { sendOtp, sendForNotification, deliver, mode, TEMPLATES, FOR_NOTIFICATION };
