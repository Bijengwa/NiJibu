import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';

export default function EmptyState({ icon, title, body }) {
  const { colors } = useSettings();
  return (
    <View style={styles.wrap}>
      <View style={[styles.circle, { backgroundColor: colors.surface }]}>{icon(colors.textMuted)}</View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  circle: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', marginTop: 20 },
  body: { fontSize: 15, textAlign: 'center', marginTop: 8 },
});
