const db = require('../db');
const { sendPush } = require('../lib/push');

// In-app notification. The app shows translated text by `type`; title/body are the English fallback.
async function notify(userId, type, title, body) {
  await db('notifications').insert({ user_id: userId, type, title, body });
  sendPush(userId, { title, body, data: { type } }); // phone alert, not awaited
}

module.exports = { notify };
