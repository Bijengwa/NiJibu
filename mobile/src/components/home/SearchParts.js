import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronLeftIcon, ClockIcon, CloseIcon, SearchIcon } from '../Icons';
import { SERVICES, getService } from '../../data/services';
import { useSettings } from '../../context/SettingsContext';

// The bar shown in the sheet. Tapping it opens the full search.
export function SearchBar({ onPress }) {
  const { colors, t } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.bar, { backgroundColor: colors.surface }]}
      accessibilityRole="search"
      accessibilityLabel={t('searchPlaceholder')}
    >
      <SearchIcon size={22} color={colors.text} />
      <Text style={[styles.barText, { color: colors.text }]} numberOfLines={1}>{t('searchPlaceholder')}</Text>
    </Pressable>
  );
}

// Real text field with a back arrow (search mode)
export function SearchInput({ value, onChange, onBack }) {
  const { colors, t } = useSettings();
  const ref = useRef(null);
  useEffect(() => {
    const id = setTimeout(() => ref.current?.focus(), 150); // after the sheet has opened
    return () => clearTimeout(id);
  }, []);

  return (
    <View style={styles.inputRow}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel={t('back')}>
        <ChevronLeftIcon size={26} color={colors.text} />
      </Pressable>
      <View style={[styles.input, { backgroundColor: colors.surface }]}>
        <SearchIcon size={20} color={colors.textMuted} />
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChange}
          placeholder={t('searchInputPlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={[styles.inputText, { color: colors.text }]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={40}
        />
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('clear')}>
            <CloseIcon size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// Big tiles: the services we have
export function ServiceCards({ onPick }) {
  const { colors, t } = useSettings();
  return (
    <View style={styles.cards}>
      {SERVICES.map((s) => (
        <Pressable
          key={s.key}
          onPress={() => onPick(s)}
          style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t(s.name)}
        >
          <Text style={styles.emoji}>{s.emoji}</Text>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{t(s.name)}</Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>{t(s.sub)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ServiceRow({ icon, service, onPress }) {
  const { colors, t } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.surface }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{t(service.name)}</Text>
        <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{t(service.sub)}</Text>
      </View>
    </Pressable>
  );
}

export function SectionTitle({ children, action, onAction }) {
  const { colors } = useSettings();
  return (
    <View style={styles.sectionHead}>
      <Text style={[styles.section, { color: colors.text }]}>{children}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text style={[styles.action, { color: colors.primary }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Recent searches (service keys)
export function RecentList({ keys, onPick, onClear }) {
  const { colors, t } = useSettings();
  const services = keys.map(getService).filter(Boolean);
  if (!services.length) return null;
  return (
    <View>
      <SectionTitle action={t('clear')} onAction={onClear}>{t('recentSearches')}</SectionTitle>
      {services.map((s) => (
        <ServiceRow key={s.key} service={s} icon={<ClockIcon size={20} color={colors.textMuted} />} onPress={() => onPick(s)} />
      ))}
    </View>
  );
}

// Suggestions while typing (or all services when the box is empty)
export function ServiceList({ title, services, onPick }) {
  return (
    <View>
      {title ? <SectionTitle>{title}</SectionTitle> : null}
      {services.map((s) => (
        <ServiceRow key={s.key} service={s} icon={<Text style={{ fontSize: 22 }}>{s.emoji}</Text>} onPress={() => onPick(s)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, borderRadius: 14, paddingHorizontal: 16 },
  barText: { flex: 1, fontSize: 17, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 14, paddingHorizontal: 14 },
  inputText: { flex: 1, fontSize: 17, height: '100%' },
  cards: { flexDirection: 'row', gap: 10, marginTop: 16 },
  card: { flex: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
  emoji: { fontSize: 32, marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22, marginBottom: 6 },
  section: { fontSize: 17, fontWeight: '700' },
  action: { fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9 },
  rowIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 17, fontWeight: '500' },
  rowSub: { fontSize: 14, marginTop: 2 },
});
