import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { emojiOf, labelOf } from '../data/services';
import { directionsUrl } from '../location/geo';
import { errorMessage } from '../utils/errors';
import Button from './Button';
import { PhoneIcon } from './Icons';

const pretty = (phone) => `+${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`;

// status -> [button text key, stage to call]
const NEXT = {
  accepted: ['stageOnTheWay', 'on-the-way'],
  on_the_way: ['stageArrived', 'arrived'],
  arrived: ['stageStart', 'start'],
  in_progress: ['stageComplete', 'complete'],
};
const STEPS = ['accepted', 'on_the_way', 'arrived', 'in_progress'];

// My current job: the customer, the place, and one button for the next stage.
export default function ActiveJobCard({ job, onMove }) {
  const { colors, t, lang } = useSettings();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const next = NEXT[job.status];
  const idx = STEPS.indexOf(job.status);
  const canCancel = job.status !== 'in_progress';

  const run = (name, stage) => async () => {
    if (busy) return;
    setBusy(name);
    setError('');
    try {
      await onMove(stage);
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    } finally {
      setBusy('');
    }
  };

  const confirmCancel = () =>
    Alert.alert(t('cancelJobTitle'), t('cancelJobBody'), [
      { text: t('keepJob'), style: 'cancel' },
      { text: t('cancelJobYes'), style: 'destructive', onPress: run('cancel', 'cancel') },
    ]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
      <View style={styles.steps}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.step, { backgroundColor: i <= idx ? colors.primary : colors.border }]} />
        ))}
      </View>
      <Text style={[styles.badge, { color: colors.success }]}>{t(`job_${job.status}`)}</Text>

      <View style={styles.head}>
        <Text style={styles.emoji}>{emojiOf(job.service.slug)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.service, { color: colors.text }]}>{labelOf(job.service, lang)}</Text>
          {!!job.customer && <Text style={[styles.muted, { color: colors.textMuted }]}>{t('customer')}: {job.customer.name}</Text>}
        </View>
      </View>

      {!!job.address && (
        <>
          <Text style={[styles.label, { color: colors.textMuted }]}>{t('whereLabel')}</Text>
          <Text style={[styles.value, { color: colors.text }]}>{job.address}</Text>
        </>
      )}
      {!!job.note && <Text style={[styles.note, { color: colors.text }]}>“{job.note}”</Text>}

      {!!job.customer?.phone && (
        <View style={styles.phoneRow}>
          <PhoneIcon size={18} color={colors.primary} />
          <Text style={[styles.phone, { color: colors.text }]}>{pretty(job.customer.phone)}</Text>
        </View>
      )}
      <Text style={[styles.hint, { color: colors.textMuted }]}>{t('priceNote')}</Text>

      <Button title={t('directions')} variant="secondary" onPress={() => Linking.openURL(directionsUrl(job))} style={styles.btn} />
      {!!job.customer?.phone && (
        <Button title={t('callCustomer')} variant="secondary" onPress={() => Linking.openURL(`tel:+${job.customer.phone}`)} style={styles.btn} />
      )}

      {next && <Button title={busy === 'next' ? t('pleaseWait') : t(next[0])} onPress={run('next', next[1])} loading={busy === 'next'} disabled={!!busy} style={styles.btn} />}
      {canCancel && <Button title={t('cancelJob')} variant="link" onPress={confirmCancel} loading={busy === 'cancel'} disabled={!!busy} />}

      {!!error && <Text style={[styles.error, { color: colors.error }]}>{errorMessage(t, error)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1.5, padding: 16, marginTop: 14 },
  steps: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  step: { flex: 1, height: 4, borderRadius: 2 },
  badge: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  emoji: { fontSize: 34 },
  service: { fontSize: 19, fontWeight: '700' },
  muted: { fontSize: 14, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 14 },
  value: { fontSize: 16, marginTop: 2 },
  note: { fontSize: 15, fontStyle: 'italic', marginTop: 10 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  phone: { fontSize: 18, fontWeight: '700' },
  hint: { fontSize: 13, marginTop: 8 },
  btn: { marginTop: 14, height: 48 },
  error: { fontSize: 13, marginTop: 10 },
});
