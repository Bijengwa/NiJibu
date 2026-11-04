const db = require('../db');
const { sendPush } = require('../lib/push');
const messaging = require('./messaging');

// In-app notification. The app shows translated text by `type`; title/body are the English fallback.
// `params` (optional) fills the SMS / WhatsApp text, e.g. { amount: 25000 }.
async function notify(userId, type, title, body, params = {}) {
  await db('notifications').insert({ user_id: userId, type, title, body });
  require('../lib/adminEvents').notify(); // admin portals refresh
  sendPush(userId, { title, body, data: { type } }); // phone alert, not awaited
  messaging.sendForNotification(userId, type, params); // SMS / WhatsApp for the important events, not awaited
}

module.exports = { notify };
