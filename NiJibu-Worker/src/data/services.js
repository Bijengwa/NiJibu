// The list of jobs comes from the server. This file only adds the emoji for each one.
const EMOJI = {
  dobi: '🧺', 'fundi-bomba': '🔧', 'fundi-umeme': '💡', 'fundi-viatu': '👞', 'fundi-seremala': '🪚',
  'fundi-rangi': '🎨', 'fundi-simu': '📱', 'fundi-friji': '🧊', usafi: '🧹', 'fundi-magari': '🚗',
};

export const emojiOf = (slug) => EMOJI[slug] ?? '🔧';

// Server row -> { key, emoji, label } in the app language
export const toService = (row, lang) => ({
  id: row.id,
  key: row.slug,
  emoji: emojiOf(row.slug),
  label: lang === 'sw' ? row.name_sw : row.name_en,
});

// A service object from an offer / request ({ id, name_sw, name_en }) -> label
export const labelOf = (svc, lang) => (svc ? (lang === 'sw' ? svc.name_sw : svc.name_en) : '');
