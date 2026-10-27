import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { USE_MOCK_PROVIDER } from '../config';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { BellIcon } from '../components/Icons';
import MapPreview from '../components/MapPreview';
import RequestCard from '../components/RequestCard';
import { useJobs } from '../context/JobsContext';
import { useSettings } from '../context/SettingsContext';
import { mapsUrl } from '../location/geo';
import { errorMessage } from '../utils/errors';

// Home of a verified fundi: go online, see requests from customers, accept or decline.
export default function RequestsScreen() {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  const { online, position, setOnline, requests, accept, decline, complete, simulate } = useJobs();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  const toggle = async (value) => {
    if (switching) return;
    setSwitching(true);
    setError('');
    try {
      await setOnline(value);
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    } finally {
      setSwitching(false);
    }
  };

  const active = requests.filter((r) => r.status === 'accepted');
  const fresh = requests.filter((r) => r.status === 'new');

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 20,
        paddingBottom: 24,
        paddingLeft: insets.left + 20,
        paddingRight: insets.right + 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.text }]}>{t('tabRequests')}</Text>

      <View style={[styles.switchCard, { backgroundColor: colors.surface, borderColor: online ? colors.success : colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.switchTitle, { color: online ? colors.success : colors.text }]}>
            {online ? t('online') : t('offline')}
          </Text>
          <Text style={[styles.switchBody, { color: colors.textMuted }]}>
            {online ? t('onlineBody') : t('offlineBody')}
          </Text>
        </View>
        <Switch
          value={online}
          onValueChange={toggle}
          disabled={switching}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#FFFFFF"
          accessibilityLabel={online ? t('online') : t('offline')}
        />
      </View>
      {online && position && (
        <View>
          <MapPreview coords={position} height={140} />
          <Text style={[styles.shared, { color: colors.textMuted }]}>
            {t('locationShared')}{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => Linking.openURL(mapsUrl(position))}>
              {t('openInMaps')}
            </Text>
          </Text>
        </View>
      )}
      {!!error && <Text style={[styles.error, { color: colors.error }]}>{errorMessage(t, error)}</Text>}

      {active.map((r) => (
        <RequestCard key={r.id} request={r} onComplete={complete} />
      ))}
      {fresh.map((r) => (
        <RequestCard key={r.id} request={r} onAccept={accept} onDecline={decline} />
      ))}

      {!active.length && !fresh.length && (
        <View style={styles.empty}>
          <EmptyState
            icon={(c) => <BellIcon size={36} color={c} />}
            title={online ? t('noRequestsTitle') : t('offlineTitle')}
            body={online ? t('noRequestsBody') : t('offlineBody')}
          />
        </View>
      )}

      {USE_MOCK_PROVIDER && (
        <View style={[styles.test, { borderColor: colors.border }]}>
          <Text style={[styles.testNote, { color: colors.textMuted }]}>{t('demoRequests')}</Text>
          {online && <Button title={t('simulateRequest')} variant="secondary" onPress={simulate} style={styles.testBtn} />}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '800' },
  switchCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 16, marginTop: 18 },
  switchTitle: { fontSize: 20, fontWeight: '800' },
  switchBody: { fontSize: 14, marginTop: 2 },
  shared: { fontSize: 12, marginTop: 8 },
  error: { fontSize: 14, marginTop: 10 },
  empty: { flex: 1, minHeight: 280 },
  test: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 24 },
  testNote: { fontSize: 12 },
  testBtn: { height: 42, marginTop: 8 },
});
