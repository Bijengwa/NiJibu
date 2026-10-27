import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setMockStatus } from '../api/provider';
import Button from '../components/Button';
import { CloseIcon, ClockIcon, ShieldCheckIcon } from '../components/Icons';
import SettingsBar from '../components/SettingsBar';
import { useAuth } from '../context/AuthContext';
import { useProvider } from '../context/ProviderContext';
import { useSettings } from '../context/SettingsContext';
import { USE_MOCK_PROVIDER } from '../config';

const POLL_MS = 30000;

// Shows if the fundi is pending, verified or rejected.
//   onRetry: go back to the NIDA step (after a rejection)
//   onPayout: open the payout step
export default function StatusScreen({ onRetry, onPayout }) {
  const { colors, t } = useSettings();
  const { logout } = useAuth();
  const { provider, refresh } = useProvider();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const status = provider.status;

  // While pending, check again every 30 seconds
  useEffect(() => {
    if (status !== 'pending') return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [status, refresh]);

  const view = {
    pending: { Icon: ClockIcon, color: colors.primary, title: 'statusPendingTitle', body: 'statusPendingBody' },
    verified: { Icon: ShieldCheckIcon, color: colors.success, title: 'statusVerifiedTitle', body: 'statusVerifiedBody' },
    rejected: { Icon: CloseIcon, color: colors.error, title: 'statusRejectedTitle', body: 'statusRejectedBody' },
  }[status] ?? { Icon: ClockIcon, color: colors.primary, title: 'statusPendingTitle', body: 'statusPendingBody' };

  const reload = async () => {
    setBusy(true);
    await refresh();
    setBusy(false);
  };

  const setStatus = async (s) => {
    await setMockStatus(s);
    await refresh();
  };

  // The admin writes the reason. In test mode it is a key we translate.
  const reason = provider.rejection_reason === 'mockRejected' ? t('mockRejectedReason') : provider.rejection_reason;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 24,
        paddingLeft: insets.left + 24,
        paddingRight: insets.right + 24,
      }}
      showsVerticalScrollIndicator={false}
    >
      <SettingsBar />

      <View style={styles.center}>
        <View style={[styles.badge, { backgroundColor: colors.surface, borderColor: view.color }]}>
          <view.Icon size={44} color={view.color} />
        </View>
        <Text style={[styles.title, { color: view.color }]}>{t(view.title)}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t(view.body)}</Text>

        {status === 'rejected' && !!reason && (
          <View style={[styles.reason, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.reasonLabel, { color: colors.textMuted }]}>{t('reason')}</Text>
            <Text style={[styles.reasonText, { color: colors.text }]}>{reason}</Text>
          </View>
        )}

        {status === 'rejected' ? (
          <Button title={t('tryAgain')} onPress={onRetry} style={styles.full} />
        ) : (
          <Button title={t('refresh')} variant="secondary" onPress={reload} loading={busy} style={styles.full} />
        )}
        {!provider.payout_set && <Button title={t('addPayout')} variant="secondary" onPress={onPayout} style={styles.full} />}
        <Button title={t('logout')} variant="link" onPress={logout} />
      </View>

      {USE_MOCK_PROVIDER && (
        <View style={[styles.test, { borderColor: colors.border }]}>
          <Text style={[styles.testTitle, { color: colors.textMuted }]}>{t('testMode')}</Text>
          <Text style={[styles.testNote, { color: colors.textMuted }]}>{t('testModeNote')}</Text>
          <View style={styles.testRow}>
            {['pending', 'verified', 'rejected'].map((s) => (
              <Button key={s} title={s} variant="secondary" onPress={() => setStatus(s)} style={styles.testBtn} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 24 },
  badge: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: 22 },
  body: { fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 6 },
  full: { alignSelf: 'stretch' },
  reason: { alignSelf: 'stretch', borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 14 },
  reasonLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  reasonText: { fontSize: 16 },
  test: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  testTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  testNote: { fontSize: 12, marginTop: 4 },
  testRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  testBtn: { flex: 1, height: 40, marginTop: 0 },
});
