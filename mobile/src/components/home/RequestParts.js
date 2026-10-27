import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Avatar from '../Avatar';
import { CloseIcon, PhoneIcon } from '../Icons';
import { useSettings } from '../../context/SettingsContext';
import { errorMessage } from '../../utils/errors';

const km = (v) => (v < 10 ? v.toFixed(1) : Math.round(v));

// ---- After picking a service: how many fundis are near, and the request form ----

// Title of the results: "Fundi Bomba · 8 nearby"   [x] clears the search
export function ResultsHeader({ service, count, nearestEta, loading, onClose }) {
  const { colors, t } = useSettings();
  let sub = t('searchingNearby');
  if (!loading) sub = count > 0 ? `${count} ${t('nearby')} · ${nearestEta} ${t('minUnit')}` : t('noProviders');
  return (
    <View style={styles.headRow}>
      <Text style={styles.headEmoji}>{service.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.headTitle, { color: colors.text }]} numberOfLines={1}>{service.label}</Text>
        <Text style={[styles.headSub, { color: colors.textMuted }]}>{sub}</Text>
      </View>
      <Pressable onPress={onClose} hitSlop={10} style={[styles.close, { backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel={t('clear')}>
        <CloseIcon size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

// Where + what is wrong, then "Request fundi". The place is the phone's location.
export function RequestForm({ loading, error, nearest, hasLocation, onFocus, onSubmit, onRetryLocation, submitError }) {
  const { colors, t } = useSettings();
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !hasLocation) return;
    setBusy(true);
    try {
      await onSubmit({ address, note });
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { backgroundColor: colors.surface, color: colors.text }];

  return (
    <View>
      {loading ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} /> : null}
      {!loading && error ? <Text style={[styles.info, { color: colors.error }]}>{t(error)}</Text> : null}
      {!loading && !error && nearest != null ? (
        <Text style={[styles.info, { color: colors.textMuted }]}>{t('nearestIs')} {km(nearest)} km</Text>
      ) : null}

      <Text style={[styles.label, { color: colors.textMuted }]}>{t('whereLabel')}</Text>
      <TextInput
        value={address}
        onChangeText={setAddress}
        onFocus={onFocus}
        placeholder={t('addressPlaceholder')}
        placeholderTextColor={colors.textMuted}
        style={input}
        maxLength={200}
      />
      <Text style={[styles.label, { color: colors.textMuted }]}>{t('noteLabel')}</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        onFocus={onFocus}
        placeholder={t('notePlaceholder')}
        placeholderTextColor={colors.textMuted}
        style={[...input, styles.noteInput]}
        multiline
        maxLength={300}
      />

      <Text style={[styles.note, { color: colors.textMuted }]}>{t('priceNote')}</Text>

      {!hasLocation ? (
        <Pressable onPress={onRetryLocation} style={[styles.button, { backgroundColor: colors.primary }]} accessibilityRole="button">
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{t('turnOn')} · {t('myLocation')}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={submit}
          disabled={busy}
          style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{t('requestFundi')}</Text>}
        </Pressable>
      )}
      {submitError ? <Text style={[styles.info, { color: colors.error }]}>{errorMessage(t, submitError)}</Text> : null}
    </View>
  );
}

// ---- After requesting: everything about the open request ----

const STEPS = ['accepted', 'on_the_way', 'arrived', 'in_progress'];

function Steps({ status }) {
  const { colors } = useSettings();
  const idx = STEPS.indexOf(status);
  return (
    <View style={styles.steps}>
      {STEPS.map((s, i) => (
        <View key={s} style={[styles.step, { backgroundColor: i <= idx ? colors.primary : colors.border }]} />
      ))}
    </View>
  );
}

function ProviderCard({ provider, service }) {
  const { colors, t } = useSettings();
  return (
    <View style={[styles.providerCard, { backgroundColor: colors.surface }]}>
      <Avatar user={{ name: provider.name, avatar_url: provider.avatar_url }} size={52} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.providerName, { color: colors.text }]} numberOfLines={1}>{provider.name || t('yourFundi')}</Text>
        <Text style={[styles.providerSub, { color: colors.textMuted }]} numberOfLines={1}>{service ? `${service.emoji} ${service.label}` : ''}</Text>
      </View>
      {provider.phone ? (
        <Pressable
          onPress={() => Linking.openURL(`tel:+${provider.phone}`)}
          style={[styles.call, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={t('callFundi')}
        >
          <PhoneIcon size={20} color={colors.onPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

// status -> [title key, body key]
const TEXT = {
  searching: ['tripSearchingTitle', 'tripSearchingBody'],
  accepted: ['tripAcceptedTitle', 'tripAcceptedBody'],
  on_the_way: ['tripOnTheWayTitle', null],
  arrived: ['tripArrivedTitle', 'tripArrivedBody'],
  in_progress: ['tripInProgressTitle', 'tripInProgressBody'],
  completed: ['tripCompletedTitle', 'tripCompletedBody'],
  no_provider: ['tripNoProviderTitle', 'tripNoProviderBody'],
};

export function TripPanel({ request, service, onCancel, onDismiss, onRetry }) {
  const { colors, t } = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { status, provider } = request;

  let [titleKey, bodyKey] = TEXT[status] || ['tripSearchingTitle', null];
  if (status === 'cancelled') {
    [titleKey, bodyKey] = request.cancelled_by === 'provider' ? ['tripFundiCancelledTitle', 'tripFundiCancelledBody'] : ['tripCancelledTitle', 'tripCancelledBody'];
  }

  const canCancel = ['searching', 'accepted', 'on_the_way', 'arrived'].includes(status);
  const finished = ['completed', 'cancelled', 'no_provider'].includes(status);
  const showProvider = !!provider && ['accepted', 'on_the_way', 'arrived', 'in_progress', 'completed'].includes(status);
  const eta = status === 'on_the_way' && provider?.eta_min != null ? `${t('arrivesIn')} ${provider.eta_min} ${t('minUnit')}` : null;

  const confirmCancel = () => {
    Alert.alert(t('cancelRequestTitle'), t('cancelRequestBody'), [
      { text: t('keepRequest'), style: 'cancel' },
      {
        text: t('cancelRequestYes'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError('');
          try {
            await onCancel();
          } catch (e) {
            setError(e.code || 'UNKNOWN');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View>
      {!finished && status !== 'searching' ? <Steps status={status} /> : null}

      <View style={styles.tripHead}>
        {status === 'searching' ? <ActivityIndicator color={colors.primary} /> : null}
        <Text style={[styles.tripTitle, { color: status === 'cancelled' || status === 'no_provider' ? colors.error : colors.text }]}>{t(titleKey)}</Text>
      </View>
      {eta ? <Text style={[styles.eta, { color: colors.primary }]}>{eta}</Text> : null}
      {bodyKey ? <Text style={[styles.tripBody, { color: colors.textMuted }]}>{t(bodyKey)}</Text> : null}

      {showProvider ? <ProviderCard provider={provider} service={service} /> : null}

      {request.address ? (
        <Text style={[styles.addr, { color: colors.textMuted }]} numberOfLines={2}>📍 {request.address}</Text>
      ) : null}

      {error ? <Text style={[styles.info, { color: colors.error }]}>{errorMessage(t, error)}</Text> : null}

      {finished ? (
        <>
          {status === 'no_provider' || status === 'cancelled' ? (
            <Pressable onPress={onRetry} style={[styles.button, { backgroundColor: colors.primary }]} accessibilityRole="button">
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{t('requestAgain')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onDismiss}
            style={[styles.button, status === 'completed' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface, marginTop: 10 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: status === 'completed' ? colors.onPrimary : colors.text }]}>{status === 'completed' ? t('done') : t('close')}</Text>
          </Pressable>
        </>
      ) : null}

      {canCancel ? (
        <Pressable
          onPress={confirmCancel}
          disabled={busy}
          style={[styles.cancel, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={colors.error} /> : <Text style={[styles.cancelText, { color: colors.error }]}>{t('cancelRequest')}</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headEmoji: { fontSize: 30 },
  headTitle: { fontSize: 20, fontWeight: '800' },
  headSub: { fontSize: 14, marginTop: 1 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  info: { fontSize: 14, textAlign: 'center', marginTop: 14 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  noteInput: { minHeight: 76, textAlignVertical: 'top' },
  note: { fontSize: 14, lineHeight: 20, marginTop: 16 },
  button: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonText: { fontSize: 18, fontWeight: '700' },
  steps: { flexDirection: 'row', gap: 6, marginTop: 4, marginBottom: 14 },
  step: { flex: 1, height: 4, borderRadius: 2 },
  tripHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tripTitle: { flex: 1, fontSize: 22, fontWeight: '800' },
  eta: { fontSize: 18, fontWeight: '700', marginTop: 6 },
  tripBody: { fontSize: 15, lineHeight: 21, marginTop: 6 },
  providerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, padding: 12, marginTop: 16 },
  providerName: { fontSize: 18, fontWeight: '700' },
  providerSub: { fontSize: 14, marginTop: 2 },
  call: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  addr: { fontSize: 14, marginTop: 14 },
  cancel: { height: 50, borderRadius: 25, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  cancelText: { fontSize: 16, fontWeight: '700' },
});
