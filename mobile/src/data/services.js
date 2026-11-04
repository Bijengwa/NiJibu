// Everything about the services (ids, names, and the other words people type for them) comes from the
// server: nothing is hard-coded here. The admin changes the words in the admin web app.

// Searches saved by an older version of the app used these keys
const LEGACY = { bomba: 'fundi-bomba', viatu: 'fundi-viatu' };

// Server rows -> what the screens use. `label` follows the app language, `sub` is the other language.
export function buildServices(rows, lang) {
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    key: r.slug,
    label: lang === 'sw' ? r.name_sw : r.name_en,
    sub: lang === 'sw' ? r.name_en : r.name_sw,
    keywords: [r.name_sw, r.name_en, ...(r.aliases ?? [])], // aliases: the other words for this job, from the database
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
