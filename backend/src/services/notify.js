const db = require('../db');

// In-app notification. The app shows translated text by `type`; title/body are the English fallback.
async function notify(userId, type, title, body) {
  await db('notifications').insert({ user_id: userId, type, title, body });
}

module.exports = { notify };
