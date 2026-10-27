import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { emojiOf, labelOf } from '../data/services';
import { errorMessage } from '../utils/errors';
import Button from './Button';
import { LockIcon } from './Icons';

// A new request near me. Shows only the distance and the area. The customer's name, phone and exact
// place come after I accept. It closes by itself when the time runs out.
export default function OfferCard({ offer, now, onAccept, onDecline }) {
  const { colors, t, lang } = useSettings();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const left = Math.max(0, Math.ceil((new Date(offer.expires_at).getTime() - now) / 1000));

  const run = (name, fn) => async () => {
    if (busy) return;
    setBusy(name);
    setError('');
    try {
      await fn(offer.offer_id);
    } catch (e) {
      setError(e.code || 'UNKNOWN');
      setBusy('');
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
      <View style={styles.top}>
        <Text style={[styles.badge, { color: colors.primary }]}>{t('newRequest')}</Text>
        <Text style={[styles.timer, { color: left <= 10 ? colors.error : colors.textMuted }]}>{left}s</Text>
      </View>

      <View style={styles.head}>
        <Text style={styles.emoji}>{emojiOf(offer.service.slug)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.service, { color: colors.text }]}>{labelOf(offer.service, lang)}</Text>
          {!!offer.address && <Text style={[styles.muted, { color: colors.textMuted }]} numberOfLines={2}>{offer.address}</Text>}
        </View>
        <Text style={[styles.km, { color: colors.primary }]}>{offer.distance_km} km</Text>
      </View>

      <View style={styles.lockRow}>
        <LockIcon size={16} color={colors.textMuted} />
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t('phoneAfterAccept')}</Text>
      </View>

      <View style={styles.actions}>
        <Button title={t('decline')} variant="secondary" onPress={run('decline', onDecline)} loading={busy === 'decline'} disabled={!!busy || left === 0} style={[styles.btn, styles.half]} />
        <Button title={t('accept')} onPress={run('accept', onAccept)} loading={busy === 'accept'} disabled={!!busy || left === 0} style={[styles.btn, styles.half]} />
      </View>

      {!!error && <Text style={[styles.error, { color: colors.error }]}>{errorMessage(t, error)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1.5, padding: 16, marginTop: 14 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  timer: { fontSize: 16, fontWeight: '800' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  emoji: { fontSize: 34 },
  service: { fontSize: 19, fontWeight: '700' },
  muted: { fontSize: 14, marginTop: 2 },
  km: { fontSize: 15, fontWeight: '700' },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  hint: { fontSize: 13, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { marginTop: 14, height: 48 },
  half: { flex: 1 },
  error: { fontSize: 13, marginTop: 10 },
});
