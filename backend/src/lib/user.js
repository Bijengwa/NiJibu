// What the API may show about a user. Never includes password_hash or token_version.
const { VERSION } = require('./terms');
const avatarUrl = (u) => (u.avatar_path ? `/uploads/avatars/${u.avatar_path}` : null);

function publicUser(u) {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    email: u.email,
    role: u.role,
    created_at: u.created_at,
    avatar_url: avatarUrl(u),
    terms_ok: u.terms_version === VERSION, // false = the app asks the person to agree to the current terms
    settings: {
      language: u.language ?? null,
      theme_mode: u.theme_mode ?? null,
      notifications_enabled: u.notifications_enabled ?? true,
      whatsapp_opt_in: u.whatsapp_opt_in ?? false,
    },
  };
}

module.exports = { publicUser, avatarUrl };
