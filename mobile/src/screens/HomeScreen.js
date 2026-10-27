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
import { ProviderDetail, ProviderList, ResultsHeader } from '../components/home/ProviderParts';
import {
  RecentList,
  SearchBar,
  SearchInput,
  SectionTitle,
  ServiceCards,
  ServiceList,
} from '../components/home/SearchParts';
import { useSettings } from '../context/SettingsContext';
import { searchProviders } from '../data/providers';
import { SERVICES, getService, matchServices } from '../data/services';
import useRecentSearches from '../hooks/useRecentSearches';
import useUserLocation, { DEFAULT_LOCATION } from '../hooks/useUserLocation';

const COLLAPSED_HEIGHT = 112; // handle + search bar

// Home = map in the background + a bottom sheet (collapsed / half / expanded).
// Sheet modes: browse (cards + recents) -> search (typing) -> results (fundis list) -> detail (one fundi)
export default function HomeScreen({ active = true }) {
  const { colors, t, isDark } = useSettings();
  const insets = useSafeAreaInsets();
  const loc = useUserLocation();
  const recents = useRecentSearches();

  const [height, setHeight] = useState(0);
  const [snap, setSnap] = useState('half');
  const [mode, setMode] = useState('browse'); // browse | search | results | detail
  const [query, setQuery] = useState('');
  const [service, setService] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const mapRef = useRef(null);
  const requestId = useRef(0);

  const center = loc.coords || DEFAULT_LOCATION;
  const visible = useMemo(
    () => ({ collapsed: COLLAPSED_HEIGHT, half: Math.round(height * 0.6) }),
    [height]
  );
  // Part of the map hidden by the sheet (the map keeps the important things above it)
  const mapPadding = snap === 'collapsed' ? visible.collapsed : visible.half;

  const mapProviders = useMemo(
    () => providers.map((p) => ({ ...p, emoji: getService(p.service)?.emoji ?? '🔧' })),
    [providers]
  );
  const selected = providers.find((p) => p.id === selectedId) || null;

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
      setSelectedId(null);
      setProviders([]);
      setError('');
      setLoading(true);
      setMode('results');
      setSnap('half');

      const id = ++requestId.current;
      try {
        const list = await searchProviders({ service: svc.key, lat: center.lat, lng: center.lng });
        if (id === requestId.current) setProviders(list);
      } catch {
        if (id === requestId.current) setError('NETWORK');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [center.lat, center.lng, recents]
  );

  const clearResults = useCallback(() => {
    requestId.current++;
    setService(null);
    setProviders([]);
    setSelectedId(null);
    setLoading(false);
    setError('');
    setMode('browse');
    setSnap('half');
  }, []);

  const pickProvider = useCallback((p) => {
    setSelectedId(p.id);
    setMode('detail');
    setSnap('half');
  }, []);

  const backFromDetail = useCallback(() => {
    setSelectedId(null);
    setMode('results');
  }, []);

  const onMarkerPress = useCallback(
    (id) => {
      const p = providers.find((x) => x.id === id);
      if (p) pickProvider(p);
    },
    [providers, pickProvider]
  );

  const recenter = async () => {
    const c = (await loc.locate()) || loc.coords || DEFAULT_LOCATION;
    mapRef.current?.recenter(c);
  };

  // Android back button: step back inside Home first
  const latest = useRef({});
  latest.current = { mode, snap, closeSearch, clearResults, backFromDetail };
  useEffect(() => {
    if (!active) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = latest.current;
      if (s.mode === 'detail') s.backFromDetail();
      else if (s.mode === 'search') s.closeSearch();
      else if (s.mode === 'results') s.clearResults();
      else if (s.snap === 'expanded') setSnap('half');
      else return false;
      return true;
    });
    return () => sub.remove();
  }, [active]);

  // ----- sheet content -----
  const matches = matchServices(query);
  const searching = query.trim().length > 0;

  const header = (() => {
    if (mode === 'search') return <SearchInput value={query} onChange={setQuery} onBack={closeSearch} />;
    if (mode === 'results' && service)
      return <ResultsHeader service={service} count={providers.length} loading={loading} onClose={clearResults} />;
    if (mode === 'detail') return null;
    return <SearchBar onPress={openSearch} />;
  })();

  const body = (() => {
    if (mode === 'search') {
      if (!searching) {
        return (
          <>
            <RecentList keys={recents.items} onPick={pickService} onClear={recents.clear} />
            <ServiceList title={t('servicesAvailable')} services={SERVICES} onPick={pickService} />
          </>
        );
      }
      if (matches.length) return <ServiceList title={t('servicesTitle')} services={matches} onPick={pickService} />;
      return (
        <>
          <Text style={[styles.empty, { color: colors.textMuted }]}>{t('noServiceMatch')}</Text>
          <ServiceList title={t('servicesAvailable')} services={SERVICES} onPick={pickService} />
        </>
      );
    }
    if (mode === 'results') return <ProviderList providers={providers} loading={loading} error={error} onPick={pickProvider} />;
    if (mode === 'detail' && selected) return <ProviderDetail provider={selected} onBack={backFromDetail} />;
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
          selectedId={selectedId}
          isDark={isDark}
          bottomPadding={mapPadding}
          onMarkerPress={onMarkerPress}
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
