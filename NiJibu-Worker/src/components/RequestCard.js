import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { getService } from '../data/services';
import { directionsUrl } from '../location/geo';
import { errorMessage } from '../utils/errors';
import { timeAgo } from '../utils/validation';
import Button from './Button';
import { LockIcon, PhoneIcon } from './Icons';

const pretty = (phone) => `+${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`;

// One customer request. status 'new': Accept / Decline. status 'accepted': phone + "done".
export default function RequestCard({ request, onAccept, onDecline, onComplete }) {
  const { colors, t } = useSettings();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const svc = getService(request.service);
  const accepted = request.status === 'accepted';

  const run = (name, fn) => async () => {
    if (busy) return;
    setBusy(name);
    setError('');
    try {
      await fn(request.id);
    } catch (e) {
      setError(e.code || 'UNKNOWN');
      setBusy('');
    }
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: accepted ? colors.primary : colors.border },
      ]}
    >
      <Text style={[styles.badge, { color: accepted ? colors.success : colors.primary }]}>
        {accepted ? t('activeJob') : t('newRequest')} · {timeAgo(t, request.created_at)}
      </Text>

      <View style={styles.head}>
        <Text style={styles.emoji}>{svc?.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.service, { color: colors.text }]}>{svc ? t(svc.name) : request.service}</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            {t('customer')}: {request.customer_name}
          </Text>
        </View>
        <Text style={[styles.km, { color: colors.primary }]}>{request.distance_km} km</Text>
      </View>

      <Text style={[styles.label, { color: colors.textMuted }]}>{t('whereLabel')}</Text>
      <Text style={[styles.value, { color: colors.text }]}>
        {request.area}, {request.landmark}
      </Text>

      {!!request.note && <Text style={[styles.note, { color: colors.text }]}>“{request.note}”</Text>}

      {accepted ? (
        <>
          <View style={styles.phoneRow}>
            <PhoneIcon size={18} color={colors.primary} />
            <Text style={[styles.phone, { color: colors.text }]}>{pretty(request.customer_phone)}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>{t('priceNote')}</Text>
          {request.lat != null && (
            <Button title={t('directions')} variant="secondary" onPress={() => Linking.openURL(directionsUrl(request))} style={styles.btn} />
          )}
          <Button
            title={t('callCustomer')}
            variant="secondary"
            onPress={() => Linking.openURL(`tel:+${request.customer_phone}`)}
            style={styles.btn}
          />
          <Button
            title={busy === 'done' ? t('pleaseWait') : t('markDone')}
            onPress={run('done', onComplete)}
            loading={busy === 'done'}
            style={styles.btn}
          />
        </>
      ) : (
        <>
          <View style={styles.phoneRow}>
            <LockIcon size={16} color={colors.textMuted} />
            <Text style={[styles.hint, { color: colors.textMuted, marginTop: 0 }]}>{t('phoneAfterAccept')}</Text>
          </View>
          <View style={styles.actions}>
            <Button
              title={t('decline')}
              variant="secondary"
              onPress={run('decline', onDecline)}
              loading={busy === 'decline'}
              disabled={!!busy}
              style={[styles.btn, styles.half]}
            />
            <Button
              title={t('accept')}
              onPress={run('accept', onAccept)}
              loading={busy === 'accept'}
              disabled={!!busy}
              style={[styles.btn, styles.half]}
            />
          </View>
        </>
      )}

      {!!error && <Text style={[styles.error, { color: colors.error }]}>{errorMessage(t, error)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1.5, padding: 16, marginTop: 14 },
  badge: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  emoji: { fontSize: 34 },
  service: { fontSize: 19, fontWeight: '700' },
  muted: { fontSize: 14, marginTop: 2 },
  km: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600', marginTop: 14 },
  value: { fontSize: 16, marginTop: 2 },
  note: { fontSize: 15, fontStyle: 'italic', marginTop: 10 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  phone: { fontSize: 18, fontWeight: '700' },
  hint: { fontSize: 13, marginTop: 8, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { marginTop: 14, height: 48 },
  half: { flex: 1 },
  error: { fontSize: 13, marginTop: 10 },
});
