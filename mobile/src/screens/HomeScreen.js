import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '../components/BottomSheet';
import { LocateIcon } from '../components/Icons';
import NearbyMap from '../components/NearbyMap';
import { RequestForm, ResultsHeader, TripPanel } from '../components/home/RequestParts';
import {
  RecentList,
  SearchBar,
  SearchInput,
  SectionTitle,
  ServiceCards,
  ServiceList,
} from '../components/home/SearchParts';
import { availability } from '../api/services';
import { useAuth } from '../context/AuthContext';
import { searchPlaces, reversePlace } from '../api/places';
import { useRequest } from '../context/RequestContext';
import { useServices } from '../context/ServicesContext';
import { useSettings } from '../context/SettingsContext';
import { matchServices } from '../data/services';
import useRecentSearches from '../hooks/useRecentSearches';
import useUserLocation, { DEFAULT_LOCATION } from '../hooks/useUserLocation';

const COLLAPSED_HEIGHT = 112; // handle + search bar

// Home = map in the background + a bottom sheet (collapsed / half / expanded).
// Sheet modes: browse (cards + recents) -> search (typing) -> results (fundis near + request form)
// When a request is open the sheet shows the trip (searching, on the way, arrived...) and the map follows the fundi.
export default function HomeScreen({ active = true }) {
  const { colors, t, isDark } = useSettings();
  const { token } = useAuth();
  const { services } = useServices();
  const { request, create, cancel, dismiss } = useRequest();
  const insets = useSafeAreaInsets();
  const loc = useUserLocation();
  const recents = useRecentSearches();

  const [height, setHeight] = useState(0);
  const [snap, setSnap] = useState('half');
  const [mode, setMode] = useState('browse'); // browse | search | results
  const [query, setQuery] = useState('');
  const [service, setService] = useState(null);
  const [avail, setAvail] = useState(null); // { providers_nearby, nearest_km, nearest_eta_min, pins }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [place, setPlace] = useState(null); // the place chosen for the request { label, lat, lng }; null = use the GPS
  const [picking, setPicking] = useState(false); // waiting for a tap on the map
  const mapRef = useRef(null);
  const requestId = useRef(0);

  const center = loc.coords || DEFAULT_LOCATION;
  const visible = useMemo(
    () => ({ collapsed: COLLAPSED_HEIGHT, half: Math.round(height * 0.6) }),
    [height]
  );
  // Part of the map hidden by the sheet (the map keeps the important things above it)
  const mapPadding = snap === 'collapsed' ? visible.collapsed : visible.half;

  // The open request decides what the map and the sheet show
  const tripService = request ? services.find((s) => s.id === request.service.id) || null : null;
  const mapProviders = useMemo(
    () => (request || !service || !avail ? [] : avail.pins.map((p) => ({ ...p, emoji: service.emoji }))),
    [request, service, avail]
  );
  const target = request ? { lat: request.lat, lng: request.lng } : null;
  const p = request?.provider;
  const live =
    request && p && p.lat != null && ['accepted', 'on_the_way'].includes(request.status)
      ? { lat: p.lat, lng: p.lng, emoji: tripService?.emoji ?? '🔧' }
      : null;

  // A new stage of the trip: show the sheet at half height so the map stays visible
  const stage = request?.status;
  useEffect(() => {
    if (stage) {
      Keyboard.dismiss();
      setSnap('half');
    }
  }, [stage]);

  // ----- actions -----
  const openSearch = () => {
    setMode('search');
    setSnap('expanded');
  };

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setQuery('');
    setMode(service ? 'results' : 'browse');
    setSnap('half');
  }, [service]);

  const pickService = useCallback(
    async (svc) => {
      Keyboard.dismiss();
      recents.add(svc.key);
      setService(svc);
      setQuery('');
      setAvail(null);
      setError('');
      setSubmitError('');
      setLoading(true);
      setMode('results');
      setSnap('half');

      const id = ++requestId.current;
      try {
        const r = await availability(token, svc.id, center);
        if (id === requestId.current) setAvail(r);
      } catch (e) {
        if (id === requestId.current) setError(e.code || 'NETWORK');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [center.lat, center.lng, recents, token]
  );

  const clearResults = useCallback(() => {
    requestId.current++;
    setService(null);
    setAvail(null);
    setLoading(false);
    setError('');
    setSubmitError('');
    setPlace(null);
    setPicking(false);
    setMode('browse');
    setSnap('half');
  }, []);

  // "Request fundi": use a fresh position, then ask the server
  const submitRequest = useCallback(
    async ({ address, note }) => {
      setSubmitError('');
      const c = place || (await loc.locate()) || loc.coords;
      if (!c) {
        setSubmitError('LOCATION_DENIED');
        return;
      }
      try {
        await create({ service_id: service.id, lat: c.lat, lng: c.lng, address, note });
        clearResults(); // the trip panel takes over
      } catch (e) {
        if (e.code === 'ALREADY_OPEN') clearResults();
        else setSubmitError(e.code || 'UNKNOWN');
      }
    },
    [loc, service, create, clearResults, place]
  );

  // "Where are you?": the box, the search list, the GPS button and the map tap all end in setPlace
  const findPlaces = useCallback(async (q) => (await searchPlaces(token, q, center)).items, [token, center.lat, center.lng]);
  const useGpsPlace = useCallback(async () => {
    setPicking(false);
    setPlace(null);
    const c = (await loc.locate()) || loc.coords;
    if (!c) return;
    mapRef.current?.recenter(c);
    try {
      const { place: p } = await reversePlace(token, c);
      if (p) setPlace({ label: p.label, lat: c.lat, lng: c.lng });
    } catch {
      // no name found: the GPS point is still used
    }
  }, [loc, token]);
  const startPicking = useCallback(() => {
    setPicking(true);
    setSnap('collapsed'); // show the map
  }, []);
  const onMapPress = useCallback(
    async (lat, lng) => {
      if (!picking) return;
      setPicking(false);
      setSnap('half');
      setPlace({ label: '', lat, lng });
      try {
        const { place: p } = await reversePlace(token, { lat, lng });
        setPlace({ label: p?.label || '', lat, lng });
      } catch {
        // keep the tapped point without a name
      }
    },
    [picking, token]
  );

  // After "no fundi" or a cancel: close the trip and go back to the same service
  const retry = useCallback(() => {
    const svc = request ? services.find((s) => s.id === request.service.id) : null;
    dismiss();
    if (svc) pickService(svc);
  }, [request, services, dismiss, pickService]);

  const recenter = async () => {
    const c = (await loc.locate()) || loc.coords || DEFAULT_LOCATION;
    mapRef.current?.recenter(c);
  };

  // Android back button: step back inside Home first
  const latest = useRef({});
  latest.current = { mode, snap, closeSearch, clearResults, hasTrip: !!request };
  useEffect(() => {
    if (!active) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = latest.current;
      if (s.hasTrip) return false;
      if (s.mode === 'search') s.closeSearch();
      else if (s.mode === 'results') s.clearResults();
      else if (s.snap === 'expanded') setSnap('half');
      else return false;
      return true;
    });
    return () => sub.remove();
  }, [active]);

  // ----- sheet content -----
  const matches = matchServices(services, query);
  const searching = query.trim().length > 0;

  const header = (() => {
    if (request) return null;
    if (mode === 'search') return <SearchInput value={query} onChange={setQuery} onBack={closeSearch} />;
    if (mode === 'results' && service)
      return (
        <ResultsHeader
          service={service}
          count={avail?.providers_nearby ?? 0}
          nearestEta={avail?.nearest_eta_min}
          loading={loading}
          onClose={clearResults}
        />
      );
    return <SearchBar onPress={openSearch} />;
  })();

  const body = (() => {
    if (request) {
      return <TripPanel request={request} service={tripService} onCancel={cancel} onDismiss={dismiss} onRetry={retry} />;
    }
    if (mode === 'search') {
      if (!searching) {
        return (
          <>
            <RecentList keys={recents.items} onPick={pickService} onClear={recents.clear} />
            <ServiceList title={t('servicesAvailable')} services={services} onPick={pickService} />
          </>
        );
      }
      if (matches.length) return <ServiceList title={t('servicesTitle')} services={matches} onPick={pickService} />;
      return (
        <>
          <Text style={[styles.empty, { color: colors.textMuted }]}>{t('noServiceMatch')}</Text>
          <ServiceList title={t('servicesAvailable')} services={services} onPick={pickService} />
        </>
      );
    }
    if (mode === 'results' && service) {
      return (
        <RequestForm
          loading={loading}
          error={error}
          nearest={avail?.nearest_km ?? null}
          hasLocation={!!place || (loc.status === 'granted' && !!loc.coords)}
          onFocus={() => setSnap('expanded')}
          onSubmit={submitRequest}
          onRetryLocation={() => (loc.status === 'denied' ? Linking.openSettings() : loc.locate())}
          submitError={submitError}
          place={place}
          picking={picking}
          onSearch={findPlaces}
          onPlace={setPlace}
          onUseGps={useGpsPlace}
          onPickOnMap={startPicking}
        />
      );
    }
    return (
      <>
        <ServiceCards onPick={pickService} />
        <RecentList keys={recents.items} onPick={pickService} onClear={recents.clear} />
      </>
    );
  })();

  const locationBanner = loc.status === 'denied' || loc.status === 'error';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={[styles.flex, { backgroundColor: colors.background, overflow: 'hidden' }]} onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h > 0) setHeight(h); }}>
        <NearbyMap
          ref={mapRef}
          center={center}
          user={loc.coords}
          providers={mapProviders}
          selectedId={null}
          isDark={isDark}
          bottomPadding={mapPadding}
          target={target}
          live={live}
          pick={mode === 'results' && !request ? place : null}
          onMapPress={onMapPress}
        />

        {locationBanner && (
          <View style={[styles.banner, { top: insets.top + 10, backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.bannerText, { color: colors.text }]} numberOfLines={2}>{t('locationOff')}</Text>
            <Pressable onPress={() => (loc.status === 'denied' ? Linking.openSettings() : loc.locate())} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.bannerAction, { color: colors.primary }]}>{t('turnOn')}</Text>
            </Pressable>
          </View>
        )}

        {height > 0 && (
          <BottomSheet
            height={height}
            visible={visible}
            snap={snap}
            onSnap={setSnap}
            floating={
              <Pressable
                onPress={recenter}
                style={[styles.locate, { backgroundColor: colors.background }]}
                accessibilityRole="button"
                accessibilityLabel={t('myLocation')}
              >
                {loc.status === 'loading' ? <ActivityIndicator size="small" color={colors.primary} /> : <LocateIcon size={22} color={colors.text} />}
              </Pressable>
            }
          >
            {({ scrollProps }) => (
              <View style={styles.flex}>
                <View style={[styles.header, { paddingTop: snap === 'expanded' ? insets.top : 0, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }]}>
                  {header}
                </View>
                <ScrollView
                  {...scrollProps}
                  contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingLeft: insets.left + 20,
                    paddingRight: insets.right + 20,
                    paddingBottom: 32,
                    paddingTop: header ? 0 : 4,
                  }}
                >
                  {body}
                </ScrollView>
              </View>
            )}
          </BottomSheet>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingBottom: 4 },
  empty: { fontSize: 15, textAlign: 'center', marginTop: 24 },
  locate: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  banner: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, elevation: 4 },
  bannerText: { flex: 1, fontSize: 14 },
  bannerAction: { fontSize: 14, fontWeight: '800' },
});
