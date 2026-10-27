import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import { CheckIcon, ChevronRightIcon } from './Icons';

// Dropdown. Looks like Field and opens a bottom sheet.
//   choices : [{ value, label }]
//   multiple: pick many (value = array of values), otherwise value = one value
export default function Select({
  label,
  placeholder,
  choices,
  value,
  onChange,
  multiple,
  error,
  hint,
  disabled,
}) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = multiple ? value : value ? [value] : [];
  const searchable = choices.length > 8;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? choices.filter((c) => c.label.toLowerCase().includes(q)) : choices;
  }, [choices, query]);

  const labelOf = (v) => choices.find((c) => c.value === v)?.label ?? v;
  const summary = multiple
    ? selected.length > 2
      ? `${selected.length} ${t('selectedSuffix')}`
      : selected.map(labelOf).join(', ')
    : value
      ? labelOf(value)
      : '';

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const pick = (v) => {
    if (multiple) {
      onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    } else {
      onChange(v);
      close();
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.box,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.error : colors.border,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Text style={[styles.value, { color: summary ? colors.text : colors.textMuted }]} numberOfLines={1}>
          {summary || placeholder || t('select')}
        </Text>
        <View style={styles.chevron}>
          <ChevronRightIcon size={20} color={colors.textMuted} />
        </View>
      </Pressable>
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
      {!error && hint ? <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text> : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('done')} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, paddingBottom: insets.bottom + 8 },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{label}</Text>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
              <Text style={[styles.done, { color: colors.primary }]}>{t('done')}</Text>
            </Pressable>
          </View>

          {searchable ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('search')}
              placeholderTextColor={colors.textMuted}
              style={[
                styles.search,
                { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            />
          ) : null}

          <FlatList
            data={shown}
            keyExtractor={(c) => c.value}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = selected.includes(item.value);
              return (
                <Pressable
                  onPress={() => pick(item.value)}
                  accessibilityRole={multiple ? 'checkbox' : 'button'}
                  accessibilityState={{ checked: on, selected: on }}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: colors.border },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text style={[styles.rowText, { color: colors.text, fontWeight: on ? '700' : '400' }]}>
                    {item.label}
                  </Text>
                  {on ? <CheckIcon size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 54,
    borderWidth: 1,
  },
  value: { flex: 1, fontSize: 17 },
  chevron: { transform: [{ rotate: '90deg' }], marginLeft: 8 },
  error: { fontSize: 13, marginTop: 6 },
  hint: { fontSize: 13, marginTop: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '75%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 40, height: 5, borderRadius: 3 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '700', flex: 1, marginRight: 12 },
  done: { fontSize: 16, fontWeight: '700' },
  search: { marginHorizontal: 20, marginBottom: 8, height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, fontSize: 17 },
});
