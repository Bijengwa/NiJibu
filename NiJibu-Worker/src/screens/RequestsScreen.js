import ReceiptCards from '../components/ReceiptCards';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { BellIcon } from '../components/Icons';
import JobMap from '../components/JobMap';
import ActiveJobCard from '../components/ActiveJobCard';
import OfferCard from '../components/OfferCard';
import { useJobs } from '../context/JobsContext';
import { useSettings } from '../context/SettingsContext';
import { mapsUrl } from '../location/geo';
import { errorMessage } from '../utils/errors';

// Home of a verified fundi: go online, see requests from customers, accept or decline.
export default function RequestsScreen() {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  const { online, position, setOnline, offers, active, accept, decline, move } = useJobs();
  const [switching, setSwitching] = useState(false);
  const [wanted, setWanted] = useState(false);
  const shown = switching ? wanted : online; // the switch moves at once; it goes back if it fails
  const [error, setError] = useState('');

  const toggle = async (value) => {
    if (switching) return;
    setWanted(value);
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

  // Clock for the offer countdowns (only ticks while there are offers)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!offers.length) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [offers.length]);
  const fresh = active ? [] : offers.filter((o) => new Date(o.expires_at).getTime() > now);

  const [doneMsg, setDoneMsg] = useState(false);
  const finish = async (stage, body) => {
    const r = await move(stage, body);
    if (r?.status === 'completed') {
      setDoneMsg(true);
      setTimeout(() => setDoneMsg(false), 8000);
    }
  };

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
          value={shown}
          onValueChange={toggle}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#FFFFFF"
          accessibilityLabel={online ? t('online') : t('offline')}
        />
      </View>
      {online && position && (
        <View>
          {!active && <JobMap height={200} />}
          <Text style={[styles.shared, { color: colors.textMuted }]}>
            {t('locationShared')}{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => Linking.openURL(mapsUrl(position))}>
              {t('openInMaps')}
            </Text>
          </Text>
        </View>
      )}
      {!!error && <Text style={[styles.error, { color: colors.error }]}>{errorMessage(t, error)}</Text>}

      {doneMsg && (
        <View style={[styles.doneBox, { backgroundColor: colors.surface, borderColor: colors.success }]}>
          <Text style={[styles.doneText, { color: colors.success }]}>{t('jobFinished')}</Text>
        </View>
      )}
      <ReceiptCards />
      {active && <JobMap height={230} />}
      {active && <ActiveJobCard job={active} onMove={finish} />}
      {fresh.map((o) => (
        <OfferCard key={o.offer_id} offer={o} now={now} onAccept={accept} onDecline={decline} />
      ))}

      {!active && !fresh.length && (
        <View style={styles.empty}>
          <EmptyState
            icon={(c) => <BellIcon size={36} color={c} />}
            title={online ? t('noRequestsTitle') : t('offlineTitle')}
            body={online ? t('noRequestsBody') : t('offlineBody')}
          />
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
  doneBox: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginTop: 14 },
  doneText: { fontSize: 15, fontWeight: '700' },
});
