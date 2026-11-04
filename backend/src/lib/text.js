// One spelling for a typed job name: "  Fundi  AC " and "fundi ac" are the same search.
const normalizeQuery = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

module.exports = { normalizeQuery };
