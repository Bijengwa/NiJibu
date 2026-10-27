import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeftIcon, CloseIcon, StarIcon } from '../Icons';
import { useSettings } from '../../context/SettingsContext';
import { getService } from '../../data/services';

const km = (v) => (v < 10 ? v.toFixed(1) : Math.round(v));

function Initial({ name, size = 48 }) {
  const { colors } = useSettings();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontSize: size * 0.42, fontWeight: '800' }}>{name.charAt(0)}</Text>
    </View>
  );
}

// Title of the results: "Fundi Bomba · 8 nearby"   [x] clears the search
export function ResultsHeader({ service, count, loading, onClose }) {
  const { colors, t } = useSettings();
  return (
    <View style={styles.headRow}>
      <Text style={styles.headEmoji}>{service.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.headTitle, { color: colors.text }]} numberOfLines={1}>{t(service.name)}</Text>
        <Text style={[styles.headSub, { color: colors.textMuted }]}>
          {loading ? t('searchingNearby') : `${count} ${t('nearby')}`}
        </Text>
      </View>
      <Pressable onPress={onClose} hitSlop={10} style={[styles.close, { backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel={t('clear')}>
        <CloseIcon size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

export function ProviderList({ providers, loading, error, onPick }) {
  const { colors, t } = useSettings();

  if (loading) return <Text style={[styles.info, { color: colors.textMuted }]}>{t('searchingNearby')}</Text>;
  if (error) return <Text style={[styles.info, { color: colors.error }]}>{t(error)}</Text>;
  if (!providers.length) return <Text style={[styles.info, { color: colors.textMuted }]}>{t('noProviders')}</Text>;

  return (
    <View>
      {providers.map((p, i) => (
        <Pressable
          key={p.id}
          onPress={() => onPick(p)}
          style={({ pressed }) => [
            styles.row,
            { borderBottomColor: colors.border, borderBottomWidth: i === providers.length - 1 ? 0 : StyleSheet.hairlineWidth, opacity: pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
        >
          <Initial name={p.name} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
            <View style={styles.meta}>
              <StarIcon size={14} color="#E0A100" />
              <Text style={[styles.metaText, { color: colors.textMuted }]}>{p.rating.toFixed(1)} · {p.jobs} {t('jobsDone')}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.dist, { color: colors.text }]}>{km(p.distanceKm)} km</Text>
            <Text style={[styles.metaText, { color: colors.textMuted }]}>{p.etaMin} {t('minUnit')}</Text>
          </View>
        </Pressable>
      ))}
      {providers[0]?.mock ? <Text style={[styles.demo, { color: colors.textMuted }]}>{t('demoNote')}</Text> : null}
    </View>
  );
}

export function ProviderDetail({ provider, onBack }) {
  const { colors, t } = useSettings();
  const service = getService(provider.service);

  const request = () => Alert.alert(t('requestSoonTitle'), t('requestSoonBody'));

  const Stat = ({ value, label }) => (
    <View style={[styles.stat, { backgroundColor: colors.surface }]}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );

  return (
    <View>
      <Pressable onPress={onBack} hitSlop={10} style={styles.backRow} accessibilityRole="button" accessibilityLabel={t('back')}>
        <ChevronLeftIcon size={24} color={colors.text} />
        <Text style={[styles.backText, { color: colors.text }]}>{t('back')}</Text>
      </Pressable>

      <View style={styles.detailTop}>
        <Initial name={provider.name} size={64} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.detailName, { color: colors.text }]} numberOfLines={2}>{provider.name}</Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{service ? `${service.emoji} ${t(service.name)}` : ''}</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat value={`★ ${provider.rating.toFixed(1)}`} label={t('rating')} />
        <Stat value={String(provider.jobs)} label={t('jobsDone')} />
        <Stat value={`${km(provider.distanceKm)} km`} label={`${provider.etaMin} ${t('minUnit')}`} />
      </View>

      <Text style={[styles.note, { color: colors.textMuted }]}>{t('priceNote')}</Text>

      <Pressable onPress={request} style={[styles.button, { backgroundColor: colors.primary }]} accessibilityRole="button">
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{t('requestFundi')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headEmoji: { fontSize: 30 },
  headTitle: { fontSize: 20, fontWeight: '800' },
  headSub: { fontSize: 14, marginTop: 1 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  info: { fontSize: 15, textAlign: 'center', marginTop: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  name: { fontSize: 17, fontWeight: '600' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  metaText: { fontSize: 13 },
  dist: { fontSize: 16, fontWeight: '700' },
  demo: { fontSize: 12, textAlign: 'center', marginTop: 14 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: 12 },
  backText: { fontSize: 16, fontWeight: '600' },
  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  detailName: { fontSize: 22, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: 10, marginTop: 18 },
  stat: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  note: { fontSize: 14, lineHeight: 20, marginTop: 16 },
  button: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonText: { fontSize: 18, fontWeight: '700' },
});
