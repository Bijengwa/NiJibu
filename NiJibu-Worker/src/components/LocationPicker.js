import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { getCoords, mapsUrl } from '../location/geo';
import { errorMessage } from '../utils/errors';
import Button from './Button';
import MapPreview from './MapPreview';

// "Where you work": uses the GPS of the phone and shows the place on Google Maps.
//   value: { lat, lng, accuracy } | null     onChange(coords)     error: text
export default function LocationPicker({ value, onChange, error }) {
  const { colors, t } = useSettings();
  const [loading, setLoading] = useState(false);
  const [fail, setFail] = useState('');

  const locate = async () => {
    if (loading) return;
    setLoading(true);
    setFail('');
    try {
      onChange(await getCoords());
    } catch (e) {
      setFail(e.code || 'LOCATION_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>{t('locationTitle')}</Text>
      <Text style={[styles.help, { color: colors.textMuted }]}>{t('locationHelp')}</Text>

      {value && <MapPreview coords={value} />}
      {value && (
        <View style={styles.row}>
          <Text style={[styles.coords, { color: colors.textMuted }]}>
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            {value.accuracy ? ` · ${t('accuracyM')} ${value.accuracy} m` : ''}
          </Text>
          <Text style={[styles.link, { color: colors.primary }]} onPress={() => Linking.openURL(mapsUrl(value))}>
            {t('openInMaps')}
          </Text>
        </View>
      )}

      <Button
        title={loading ? t('locationGetting') : value ? t('updateLocation') : t('useMyLocation')}
        variant="secondary"
        onPress={locate}
        loading={loading}
        style={{ marginTop: 12 }}
      />
      {!!(fail || error) && (
        <Text style={[styles.error, { color: colors.error }]}>{fail ? errorMessage(t, fail) : error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 6 },
  label: { fontSize: 15, fontWeight: '600', marginTop: 10 },
  help: { fontSize: 13, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 10 },
  coords: { fontSize: 12, flexShrink: 1 },
  link: { fontSize: 13, fontWeight: '700' },
  error: { fontSize: 13, marginTop: 8 },
});
