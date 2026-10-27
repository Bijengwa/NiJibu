// Services available in V1. `keywords` are what people may type (Swahili + English).
export const SERVICES = [
  {
    key: 'dobi',
    emoji: '🧺',
    name: 'svcDobi',
    sub: 'svcDobiSub',
    keywords: ['dobi', 'laundry', 'kufua', 'nguo', 'washing', 'pasi', 'iron', 'kufulia'],
  },
  {
    key: 'bomba',
    emoji: '🔧',
    name: 'svcPlumber',
    sub: 'svcPlumberSub',
    keywords: ['bomba', 'fundi bomba', 'plumber', 'plumbing', 'maji', 'water', 'pipe', 'mabomba', 'tap', 'bomba la maji', 'leak', 'choo'],
  },
  {
    key: 'viatu',
    emoji: '👞',
    name: 'svcShoe',
    sub: 'svcShoeSub',
    keywords: ['viatu', 'fundi viatu', 'shoe', 'shoes', 'cobbler', 'kushona viatu', 'sandals', 'sandali'],
  },
];

export const getService = (key) => SERVICES.find((s) => s.key === key);

const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

// Services that match what the user typed (partial words are fine: "bom" -> fundi bomba)
export function matchServices(query) {
  const q = norm(query);
  if (!q) return [];
  return SERVICES.filter((s) =>
    s.keywords.some((k) => {
      const kw = norm(k);
      return kw.startsWith(q) || kw.includes(q) || (q.length > 3 && q.includes(kw));
    })
  );
}
