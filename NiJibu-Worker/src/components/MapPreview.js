import { StyleSheet, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { embedUrl } from '../location/geo';
import MapFrame from './MapFrame';

// Small Google Map with a pin at the given position
export default function MapPreview({ coords, height = 180 }) {
  const { colors } = useSettings();
  return (
    <View style={[styles.box, { height, borderColor: colors.border }]}>
      <MapFrame uri={embedUrl(coords)} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginTop: 12 },
});
