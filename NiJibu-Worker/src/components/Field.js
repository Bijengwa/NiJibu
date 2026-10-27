import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';

// Labeled input with optional left icon / prefix text / right slot and an error line.
export default function Field({ label, icon, prefix, right, error, inputRef, ...inputProps }) {
  const { colors } = useSettings();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View
        style={[
          styles.row,
          { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border },
        ]}
      >
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        {prefix ? <Text style={[styles.prefix, { color: colors.text }]}>{prefix}</Text> : null}
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: colors.text }]}
          placeholderTextColor={colors.textMuted}
          {...inputProps}
        />
        {right}
      </View>
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 54,
    borderWidth: 1,
  },
  icon: { marginRight: 10 },
  prefix: { fontSize: 17, marginRight: 8 },
  input: { flex: 1, fontSize: 17, height: '100%' },
  error: { fontSize: 13, marginTop: 6 },
});
