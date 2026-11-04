// A service always has the same colour (fixed slots, never cycled). The colours are CSS variables in index.css.
const SLOT = { google_maps: 1, africastalking: 2, selcom: 3, whatsapp: 4, osm: 6, osrm: 7, expo_push: 8 }
export const seriesColor = (service) => `var(--series-${SLOT[service] || 8})`
