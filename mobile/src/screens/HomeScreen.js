import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchIcon } from '../components/Icons';
import { useSettings } from '../context/SettingsContext';

// First services (V1): dobi, fundi bomba, fundi viatu
const SERVICES = [
  { key: 'dobi', emoji: '🧺', name: 'svcDobi', sub: 'svcDobiSub' },
  { key: 'bomba', emoji: '🔧', name: 'svcPlumber', sub: 'svcPlumberSub' },
  { key: 'viatu', emoji: '👞', name: 'svcShoe', sub: 'svcShoeSub' },
];

export default function HomeScreen() {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingBottom: 24,
        paddingLeft: insets.left + 20,
        paddingRight: insets.right + 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.greeting, { color: colors.text }]}>{t('greeting')}</Text>

      <View style={[styles.search, { backgroundColor: colors.surface }]}>
        <SearchIcon size={22} color={colors.text} />
        <Text style={[styles.searchText, { color: colors.textMuted }]}>{t('searchPlaceholder')}</Text>
      </View>

      <Text style={[styles.section, { color: colors.text }]}>{t('servicesTitle')}</Text>
      <View style={styles.cards}>
        {SERVICES.map((s) => (
          <View key={s.key} style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={styles.emoji}>{s.emoji}</Text>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{t(s.name)}</Text>
            <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>{t(s.sub)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 28, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, borderRadius: 14, paddingHorizontal: 16, marginTop: 20 },
  searchText: { fontSize: 17, fontWeight: '600', flex: 1 },
  section: { fontSize: 18, fontWeight: '700', marginTop: 28, marginBottom: 12 },
  cards: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center' },
  emoji: { fontSize: 34, marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
});
