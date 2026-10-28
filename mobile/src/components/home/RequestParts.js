import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Avatar from '../Avatar';
import { CloseIcon, LocateIcon, MapIcon, MapPinIcon, PhoneIcon } from '../Icons';
import PayModal, { money } from '../PayModal';
import ServiceIcon from '../ServiceIcon';
import { useRequest } from '../../context/RequestContext';
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
      <ServiceIcon slug={service.key} size={30} color={colors.primary} />
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
//   place: the chosen place { label, lat, lng } or null (then the phone's GPS is used)
//   onSearch(q) -> places    onPlace(place|null)    onUseGps()    onPickOnMap()    picking: waiting for a tap on the map
export function RequestForm({ loading, error, nearest, hasLocation, onFocus, onSubmit, onRetryLocation, submitError, place, onSearch, onPlace, onUseGps, onPickOnMap, picking }) {
  const { colors, t } = useSettings();
  const [address, setAddress] = useState('');
  const [typed, setTyped] = useState(''); // what the user typed (the search runs on this)
  const [found, setFound] = useState(null); // null = no search yet, [] = nothing found
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // A place chosen on the map or by the GPS button fills the box
  useEffect(() => {
    if (place?.label) {
      setAddress(place.label);
      setTyped('');
      setFound(null);
    }
  }, [place]);

  // Search places 0.5 s after the user stops typing
  useEffect(() => {
    const q = typed.trim();
    if (q.length < 3) {
      setFound(null);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const items = await onSearch(q);
        if (alive) setFound(items);
      } catch {
        if (alive) setFound(null);
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [typed]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (p) => {
    setAddress(p.label);
    setTyped('');
    setFound(null);
    onPlace(p);
  };

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
        onChangeText={(v) => {
          setAddress(v);
          setTyped(v);
          if (place) onPlace(null); // typing again: the chosen point is not valid any more
        }}
        onFocus={onFocus}
        placeholder={t('addressPlaceholder')}
        placeholderTextColor={colors.textMuted}
        style={input}
        maxLength={200}
      />
      {found && found.length > 0 ? (
        <View style={[styles.suggest, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {found.map((p, i) => (
            <Pressable
              key={`${p.lat},${p.lng},${i}`}
              onPress={() => choose(p)}
              style={[styles.suggestRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
              accessibilityRole="button"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MapPinIcon size={16} color={colors.primary} />
                <Text style={[styles.suggestMain, { color: colors.text, flex: 1 }]} numberOfLines={1}>{p.label}</Text>
              </View>
              <Text style={[styles.suggestSub, { color: colors.textMuted }]} numberOfLines={1}>{p.full}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {found && found.length === 0 ? <Text style={[styles.suggestSub, { color: colors.textMuted, marginTop: 8 }]}>{t('noPlaces')}</Text> : null}
      <View style={styles.whereActions}>
        <Pressable onPress={onUseGps} hitSlop={8} accessibilityRole="button">
          <View style={styles.linkRow}>
            <LocateIcon size={16} color={colors.primary} />
            <Text style={[styles.whereLink, { color: colors.primary }]}>{t('useMyPlace')}</Text>
          </View>
        </Pressable>
        <Pressable onPress={onPickOnMap} hitSlop={8} accessibilityRole="button">
          <View style={styles.linkRow}>
            <MapIcon size={16} color={colors.primary} />
            <Text style={[styles.whereLink, { color: colors.primary }]}>{picking ? t('tapMapHint') : t('chooseOnMap')}</Text>
          </View>
        </Pressable>
      </View>
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
        <Text style={[styles.providerSub, { color: colors.textMuted }]} numberOfLines={1}>{service ? service.label : ''}</Text>
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
  const [paying, setPaying] = useState(false);
  const { reload } = useRequest();
  const { status, provider } = request;
  const needsPay = status === 'completed' && request.agreed_price && request.payment?.status !== 'paid';
  const paid = status === 'completed' && request.payment?.status === 'paid';

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
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 }}>
          <MapPinIcon size={16} color={colors.textMuted} />
          <Text style={[styles.addr, { color: colors.textMuted, flex: 1 }]} numberOfLines={2}>{request.address}</Text>
        </View>
      ) : null}

      {error ? <Text style={[styles.info, { color: colors.error }]}>{errorMessage(t, error)}</Text> : null}

      {['in_progress', 'completed'].includes(status) && request.agreed_price ? (
        <View style={[styles.priceBox, { backgroundColor: colors.surface, borderColor: paid ? colors.success : colors.primary }]}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>{paid ? t('payPaidLabel') : t('payToPay')}</Text>
          <Text style={{ color: paid ? colors.success : colors.text, fontSize: 26, fontWeight: '800', marginTop: 2 }}>{money(request.agreed_price)}</Text>
        </View>
      ) : null}
      {needsPay ? (
        <Pressable onPress={() => setPaying(true)} style={[styles.button, { backgroundColor: colors.primary }]} accessibilityRole="button">
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{request.customer_confirmed_at ? `${t('payNow')} ${money(request.agreed_price)}` : t('confirmPay')}</Text>
        </Pressable>
      ) : null}
      <PayModal visible={paying} request={request} onClose={() => setPaying(false)} onPaid={reload} />

      {finished ? (
        <>
          {status === 'no_provider' || status === 'cancelled' ? (
            <Pressable onPress={onRetry} style={[styles.button, { backgroundColor: colors.primary }]} accessibilityRole="button">
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{t('requestAgain')}</Text>
            </Pressable>
          ) : null}
          {needsPay ? null : (
            <Pressable
              onPress={onDismiss}
              style={[styles.button, status === 'completed' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface, marginTop: 10 }]}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, { color: status === 'completed' ? colors.onPrimary : colors.text }]}>{status === 'completed' ? t('done') : t('close')}</Text>
            </Pressable>
          )}
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
  suggest: { borderWidth: 1, borderRadius: 12, marginTop: 6, overflow: 'hidden' },
  suggestRow: { paddingHorizontal: 14, paddingVertical: 10 },
  suggestMain: { fontSize: 15, fontWeight: '600' },
  suggestSub: { fontSize: 12, marginTop: 2 },
  whereActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 12 },
  priceBox: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginTop: 14, alignItems: 'center' },
  whereLink: { fontSize: 14, fontWeight: '700' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
