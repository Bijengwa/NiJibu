import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildMapHtml } from '../map/mapHtml';

// Escape the two characters that are valid in JSON but not in JavaScript source
const LS = String.fromCharCode(0x2028); // line / paragraph separator: valid JSON, invalid JS source
const PS = String.fromCharCode(0x2029);
const js = (v) => JSON.stringify(v).split(LS).join('\\u2028').split(PS).join('\\u2029');

// Map (Leaflet inside a WebView). To use another map library later, keep these props and the ref methods.
//   center: first view {lat,lng}   user: {lat,lng}|null   providers: [{id,lat,lng,emoji}]
//   selectedId   isDark   bottomPadding: height hidden by the bottom sheet   onMarkerPress(id)
//   target: {lat,lng}|null  where the customer waits (a request is open)
//   pick: {lat,lng}|null  the place the customer chose for a new request   onMapPress(lat,lng): the map was tapped
//   live: {lat,lng,emoji}|null  the fundi who is coming; the camera follows so both stay visible
const NearbyMap = forwardRef(function NearbyMap(
  { center, user, providers, selectedId, isDark, bottomPadding, onMarkerPress, target = null, live = null, pick = null, onMapPress },
  ref
) {
  const web = useRef(null);
  const [ready, setReady] = useState(false);
  const pad = useRef(bottomPadding);
  pad.current = bottomPadding;

  // Built once. Later changes (theme, markers...) are sent as commands, so the map never reloads.
  const html = useMemo(() => buildMapHtml({ center, isDark }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const call = useCallback((fn, ...args) => {
    web.current?.injectJavaScript(`window.api.${fn}(${args.map(js).join(',')});true;`);
  }, []);

  useImperativeHandle(ref, () => ({
    recenter: (c) => call('recenter', c.lat, c.lng, pad.current),
  }), [call]);

  useEffect(() => { if (ready) call('setTheme', isDark); }, [ready, isDark, call]);
  useEffect(() => { if (ready && user) call('setUser', user.lat, user.lng); }, [ready, user, call]);

  // New results: draw pins, then zoom so the user and every fundi are visible above the sheet
  useEffect(() => {
    if (!ready) return;
    call('setProviders', providers.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, emoji: p.emoji })));
    if (providers.length) {
      const me = user || center;
      call('fit', [[me.lat, me.lng], ...providers.map((p) => [p.lat, p.lng])], pad.current);
    }
  }, [ready, providers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (ready) call('select', selectedId, pad.current); }, [ready, selectedId, call]);

  // An open request: show where the customer waits, and the fundi coming (moving)
  const tLat = target?.lat;
  const tLng = target?.lng;
  useEffect(() => {
    if (!ready) return;
    if (tLat != null) call('setTarget', tLat, tLng);
    else call('clearTarget');
  }, [ready, tLat, tLng, call]);

  const lLat = live?.lat;
  const lLng = live?.lng;
  const lEmoji = live?.emoji;
  useEffect(() => {
    if (!ready) return;
    if (lLat != null) {
      call('setLive', lLat, lLng, lEmoji);
      if (tLat != null) call('track', [[tLat, tLng], [lLat, lLng]], pad.current, false);
    } else {
      call('clearLive');
    }
  }, [ready, lLat, lLng, lEmoji, tLat, tLng, call]);

  // The place chosen for a new request
  const pLat = pick?.lat;
  const pLng = pick?.lng;
  useEffect(() => {
    if (!ready) return;
    if (pLat != null) {
      call('setPick', pLat, pLng);
      call('recenter', pLat, pLng, pad.current);
    } else {
      call('clearPick');
    }
  }, [ready, pLat, pLng, call]);

  // Waiting for a fundi: show the place, close up
  useEffect(() => {
    if (ready && tLat != null && lLat == null) call('recenter', tLat, tLng, pad.current);
  }, [ready, tLat, tLng, lLat, call]);

  // First position of the user: move the map there
  const firstFix = useRef(true);
  useEffect(() => {
    if (ready && user && firstFix.current) {
      firstFix.current = false;
      call('recenter', user.lat, user.lng, pad.current);
    }
  }, [ready, user, call]);

  const onMessage = useCallback(
    (e) => {
      let msg;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (msg?.type === 'ready') setReady(true);
      else if (msg?.type === 'markerPress' && typeof msg.id === 'string') onMarkerPress?.(msg.id);
      else if (msg?.type === 'mapPress' && Number.isFinite(msg.lat) && Number.isFinite(msg.lng)) onMapPress?.(msg.lat, msg.lng);
    },
    [onMarkerPress, onMapPress]
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={web}
        source={{ html, baseUrl: 'https://nijibu.local/' }}
        originWhitelist={['https://nijibu.local*', 'about:blank']}
        onShouldStartLoadWithRequest={(r) => r.url.startsWith('https://nijibu.local') || r.url === 'about:blank'}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        overScrollMode="never"
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={styles.web}
      />
    </View>
  );
});

const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: 'transparent' } });
export default NearbyMap;
