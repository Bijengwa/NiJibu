
// The list of jobs comes from the server. Icons are SVG (see serviceIcons.js and components/ServiceIcon.js).

// Server row -> { id, key, label } in the app language
export const toService = (row, lang) => ({
  id: row.id,
  key: row.slug,
  label: lang === 'sw' ? row.name_sw : row.name_en,
});

// A service object from an offer / request ({ id, name_sw, name_en }) -> label
export const labelOf = (svc, lang) => (svc ? (lang === 'sw' ? svc.name_sw : svc.name_en) : '');
