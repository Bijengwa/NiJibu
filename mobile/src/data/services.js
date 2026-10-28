// The list of services comes from the server (ids and names). This file only adds what the
// server does not know: the words people may type (Swahili + English).
const META = {
  dobi: { keywords: ['dobi', 'laundry', 'kufua', 'nguo', 'washing', 'pasi', 'iron', 'kufulia'] },
  'fundi-bomba': { keywords: ['bomba', 'fundi bomba', 'plumber', 'plumbing', 'maji', 'water', 'pipe', 'mabomba', 'tap', 'leak', 'choo'] },
  'fundi-umeme': { keywords: ['umeme', 'fundi umeme', 'electrician', 'electric', 'taa', 'waya', 'wiring', 'socket', 'swichi', 'tanesco'] },
  'fundi-viatu': { keywords: ['viatu', 'fundi viatu', 'shoe', 'shoes', 'cobbler', 'kushona viatu', 'sandals', 'sandali'] },
  'fundi-seremala': { keywords: ['seremala', 'fundi seremala', 'carpenter', 'mbao', 'wood', 'furniture', 'samani', 'mlango', 'door', 'kitanda'] },
  'fundi-rangi': { keywords: ['rangi', 'fundi rangi', 'painter', 'paint', 'kupaka', 'ukuta', 'wall'] },
  'fundi-simu': { keywords: ['simu', 'fundi simu', 'phone', 'phone repair', 'screen', 'kioo', 'betri', 'battery'] },
  'fundi-friji': { keywords: ['friji', 'fridge', 'tv', 'televisheni', 'television', 'jokofu', 'freezer', 'microwave'] },
  usafi: { keywords: ['usafi', 'cleaning', 'clean', 'kusafisha', 'nyumba', 'house', 'mopping', 'kudeki'] },
  'fundi-magari': { keywords: ['gari', 'magari', 'fundi magari', 'mechanic', 'car', 'garage', 'engine', 'injini'] },
};

// Searches saved by an older version of the app used these keys
const LEGACY = { bomba: 'fundi-bomba', viatu: 'fundi-viatu' };

// Server rows -> what the screens use. `label` follows the app language, `sub` is the other language.
export function buildServices(rows, lang) {
  return rows.map((r) => ({
    id: r.id,
    key: r.slug,
    label: lang === 'sw' ? r.name_sw : r.name_en,
    sub: lang === 'sw' ? r.name_en : r.name_sw,
    keywords: [r.name_sw, r.name_en, ...(META[r.slug]?.keywords ?? [])],
  }));
}

export const legacyKey = (k) => LEGACY[k] ?? k;

const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

// Services that match what the user typed (partial words are fine: "bom" -> fundi bomba)
export function matchServices(services, query) {
  const q = norm(query);
  if (!q) return [];
  return services.filter((s) =>
    s.keywords.some((k) => {
      const kw = norm(k);
      return kw.startsWith(q) || kw.includes(q) || (q.length > 3 && q.includes(kw));
    })
  );
}
