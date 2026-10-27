import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { CheckIcon, ChevronRightIcon } from './Icons';

// List row: icon + label, then a value, a custom `right` element, a chevron or a check.
export default function Row({ icon, label, value, right, onPress, chevron, selected, danger, last }) {
  const { colors } = useSettings();
  const color = danger ? colors.error : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
        pressed && onPress && { opacity: 0.6 },
      ]}
    >
      {icon ? <View style={styles.icon}>{icon(color)}</View> : null}
      <Text style={[styles.label, { color }]}>{label}</Text>
      {value ? <Text style={[styles.value, { color: colors.textMuted }]} numberOfLines={1}>{value}</Text> : null}
      {right}
      {selected ? <CheckIcon size={20} color={colors.primary} /> : null}
      {chevron ? <ChevronRightIcon size={20} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 16 },
  icon: { width: 32 },
  label: { flex: 1, fontSize: 17 },
  value: { fontSize: 15, marginLeft: 12, flexShrink: 1, maxWidth: '55%' },
});
