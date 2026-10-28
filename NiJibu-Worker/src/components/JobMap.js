import { StyleSheet, View } from 'react-native';
import { useJobs } from '../context/JobsContext';
import { useSettings } from '../context/SettingsContext';
import NearbyMap from './NearbyMap';

const NO_PINS = [];

// The same map as the customer app (Leaflet, same style).
//   Waiting for requests: my position (blue dot).
//   On a job: the customer's place (red) and me (pin with my job icon); the map keeps both in view while I drive.
export default function JobMap({ height = 220 }) {
  const { colors, isDark } = useSettings();
  const { position, active } = useJobs();
  const target = active ? { lat: active.lat, lng: active.lng } : null;
  const center = target || position;
  if (!center) return null;

  return (
    <View style={[styles.box, { height, borderColor: colors.border }]}>
      <NearbyMap
        center={center}
        user={active ? null : position}
        providers={NO_PINS}
        selectedId={null}
        isDark={isDark}
        bottomPadding={0}
        target={target}
        live={active && position ? { lat: position.lat, lng: position.lng, slug: active.service?.slug } : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginTop: 14 },
});
