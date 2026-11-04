import { DEFAULT_ICON_PATHS, SERVICE_ICON_PATHS } from '../data/serviceIcons';
import { LEAFLET_CSS, LEAFLET_JS } from './leafletAssets';

// The map page that runs inside the WebView (Leaflet + OpenStreetMap-based tiles).
// React Native talks to it through window.api.*; it answers with postMessage events:
//   { type: 'ready' }  { type: 'markerPress', id }  { type: 'mapPress' }
//
// NOTE: Carto tiles are fine for development. For production use a tile provider with an
// API key/plan (MapTiler, Stadia, Mapbox) and update the URLs + CSP below.
const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

export function buildMapHtml({ center, isDark }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://*.basemaps.cartocdn.com data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
<style>${LEAFLET_CSS}</style>
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; }
  body { background: ${isDark ? '#16191d' : '#e9e5dc'}; -webkit-tap-highlight-color: transparent; }
  .leaflet-container { font-family: -apple-system, Roboto, sans-serif; background: ${isDark ? '#16191d' : '#e9e5dc'}; }
  .leaflet-control-attribution { font-size: 9px; background: rgba(255,255,255,.7) !important; }
  .me { position: relative; width: 22px; height: 22px; }
  .me i { position: absolute; left: 3px; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: #1a73e8; border: 3px solid #fff; box-shadow: 0 1px 6px rgba(0,0,0,.4); }
  .me b { position: absolute; left: 0; top: 0; width: 22px; height: 22px; border-radius: 50%; background: rgba(26,115,232,.28); animation: pulse 2s ease-out infinite; }
  @keyframes pulse { 0% { transform: scale(.7); opacity: 1; } 100% { transform: scale(2.6); opacity: 0; } }
  .pin { width: 40px; height: 40px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: #6F4226; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; }
  .pin span { transform: rotate(45deg); display: flex; align-items: center; justify-content: center; }
  .pin.sel { background: #1a73e8; width: 48px; height: 48px; }
  .pin.live { background: #1a73e8; width: 46px; height: 46px; }
  .target { width: 26px; height: 26px; border-radius: 50%; background: #C0392B; border: 4px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.45); }
</style>
</head>
<body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
(function () {
  var TILES = ${JSON.stringify(TILES)};
  var CENTER = ${JSON.stringify(center)};
  var map = L.map('map', { zoomControl: false, zoomSnap: 0.5, tap: true }).setView([CENTER.lat, CENTER.lng], 15);
  map.attributionControl.setPrefix(false);

  var tileLayer = null;

  // Job icons are SVG (no emojis). Built with createElementNS, so nothing is parsed as HTML.
  var ICONS = ${JSON.stringify(SERVICE_ICON_PATHS)};
  var ICON_DEFAULT = ${JSON.stringify(DEFAULT_ICON_PATHS)};
  function iconEl(slug, size) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', '#fff'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    (ICONS[slug] || ICON_DEFAULT).forEach(function (d) {
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }
  var meMarker = null;
  var pins = L.layerGroup().addTo(map);
  var pinEls = {};
  var selectedId = null;
  var targetMarker = null;
  var pickMarker = null;
  var liveMarker = null;
  var tracked = false;

  function send(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  // Put latlng in the middle of the part of the map that is NOT hidden by the bottom sheet
  function viewFor(latlng, zoom, padBottom) {
    var p = map.project(latlng, zoom).add([0, (padBottom || 0) / 2]);
    return { center: map.unproject(p, zoom), zoom: zoom };
  }

  var api = {
    setTheme: function (dark) {
      if (tileLayer) map.removeLayer(tileLayer);
      tileLayer = L.tileLayer(dark ? TILES.dark : TILES.light, {
        subdomains: 'abcd', maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }).addTo(map);
      document.body.style.background = dark ? '#16191d' : '#e9e5dc';
    },

    setUser: function (lat, lng) {
      if (!meMarker) {
        var icon = L.divIcon({ className: '', html: '<div class="me"><b></b><i></i></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
        meMarker = L.marker([lat, lng], { icon: icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      } else {
        meMarker.setLatLng([lat, lng]);
      }
    },

    setProviders: function (list) {
      pins.clearLayers();
      pinEls = {};
      selectedId = null;
      list.forEach(function (p) {
        var el = document.createElement('div');
        el.className = 'pin';
        var span = document.createElement('span');
        span.appendChild(iconEl(p.slug, 22));
        el.appendChild(span);
        var icon = L.divIcon({ className: '', html: el, iconSize: [40, 40], iconAnchor: [20, 44] });
        var m = L.marker([p.lat, p.lng], { icon: icon, keyboard: false }).addTo(pins);
        m.on('click', function () { send({ type: 'markerPress', id: p.id }); });
        pinEls[p.id] = { el: el, ll: [p.lat, p.lng] };
      });
    },

    select: function (id, padBottom) {
      if (selectedId && pinEls[selectedId]) pinEls[selectedId].el.classList.remove('sel');
      selectedId = id;
      if (id && pinEls[id]) {
        pinEls[id].el.classList.add('sel');
        var v = viewFor(pinEls[id].ll, Math.max(map.getZoom(), 16), padBottom);
        map.flyTo(v.center, v.zoom, { duration: 0.5 });
      }
    },

    // Show the user and all given points, keeping them above the bottom sheet
    fit: function (points, padBottom) {
      if (!points || !points.length) return;
      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [40, 70], paddingBottomRight: [40, (padBottom || 0) + 30],
        maxZoom: 17, animate: true
      });
    },

    // The place where the customer waits
    setTarget: function (lat, lng) {
      if (!targetMarker) {
        var icon = L.divIcon({ className: '', html: '<div class="target"></div>', iconSize: [26, 26], iconAnchor: [13, 13] });
        targetMarker = L.marker([lat, lng], { icon: icon, interactive: false, keyboard: false, zIndexOffset: 500 }).addTo(map);
      } else {
        targetMarker.setLatLng([lat, lng]);
      }
    },
    clearTarget: function () {
      if (targetMarker) { map.removeLayer(targetMarker); targetMarker = null; }
    },

    // The fundi who is coming: moves smoothly when called again
    setLive: function (lat, lng, slug) {
      if (!liveMarker) {
        var el = document.createElement('div');
        el.className = 'pin live';
        var span = document.createElement('span');
        span.appendChild(iconEl(slug, 24));
        el.appendChild(span);
        var icon = L.divIcon({ className: '', html: el, iconSize: [46, 46], iconAnchor: [23, 50] });
        liveMarker = L.marker([lat, lng], { icon: icon, interactive: false, keyboard: false, zIndexOffset: 900 }).addTo(map);
      } else {
        liveMarker.setLatLng([lat, lng]);
      }
    },
    clearLive: function () {
      if (liveMarker) { map.removeLayer(liveMarker); liveMarker = null; }
      tracked = false;
    },

    // Keep all points in view above the sheet. Moves the camera only when a point is about to leave the screen.
    track: function (points, padBottom, force) {
      if (!points || !points.length) return;
      var inner = map.getBounds().pad(-0.12);
      var allIn = points.every(function (p) { return inner.contains(p); });
      if (force || !tracked || !allIn) {
        tracked = true;
        map.fitBounds(L.latLngBounds(points), {
          paddingTopLeft: [50, 80], paddingBottomRight: [50, (padBottom || 0) + 40],
          maxZoom: 17, animate: true
        });
      }
    },

    // The place the customer chose by tapping the map or from the search list
    setPick: function (lat, lng) {
      if (!pickMarker) {
        var icon = L.divIcon({ className: '', html: '<div class="target"></div>', iconSize: [26, 26], iconAnchor: [13, 13] });
        pickMarker = L.marker([lat, lng], { icon: icon, interactive: false, keyboard: false, zIndexOffset: 600 }).addTo(map);
      } else {
        pickMarker.setLatLng([lat, lng]);
      }
    },
    clearPick: function () {
      if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }
    },

    recenter: function (lat, lng, padBottom) {
      var v = viewFor([lat, lng], 16, padBottom);
      map.flyTo(v.center, v.zoom, { duration: 0.6 });
    }
  };
  window.api = api;

  map.on('click', function (e) { send({ type: 'mapPress', lat: e.latlng.lat, lng: e.latlng.lng }); });
  api.setTheme(${isDark ? 'true' : 'false'});
  send({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
