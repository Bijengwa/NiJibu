const db = require('../db');

// Push notification through Expo's free push service. Best effort: it never throws and never blocks a request.
// The phone must have registered its token (PUT /api/me/push-token).
const URL = 'https://exp.host/--/api/v2/push/send';
const TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

async function sendPush(userId, { title, body, data = {} }) {
  if (process.env.PUSH_DISABLED === '1' || process.env.NODE_ENV === 'test') return;
  try {
    const user = await db('users').where({ id: userId }).first('push_token');
    if (!user?.push_token || !TOKEN_RE.test(user.push_token)) return;
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: user.push_token, title, body, data, sound: 'default', priority: 'high', channelId: 'default', ttl: 60 }),
    });
    const json = await res.json().catch(() => null);
    const err = json?.data?.details?.error || json?.data?.status === 'error' ? json.data : null;
    // The phone no longer accepts pushes (app removed): forget the token
    if (err?.details?.error === 'DeviceNotRegistered') await db('users').where({ id: userId }).update({ push_token: null });
    else if (err) console.warn('[push] not sent:', err.message || err);
  } catch (e) {
    console.warn('[push] failed:', e.message);
  }
}

module.exports = { sendPush, TOKEN_RE };
