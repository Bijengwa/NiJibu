import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useSettings } from '../context/SettingsContext';

// Same look as the buttons in the customer app: tall, fully rounded.
// variant: 'primary' (filled) | 'secondary' (soft) | 'link' (text only)
export default function Button({ title, onPress, variant = 'primary', loading, disabled, style }) {
  const { colors } = useSettings();
  const off = disabled || loading;

  const bg = variant === 'primary' ? colors.primary : variant === 'secondary' ? colors.surface : 'transparent';
  const fg = variant === 'primary' ? colors.onPrimary : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        variant === 'link' ? styles.link : styles.button,
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.7 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[variant === 'link' ? styles.linkText : styles.text, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  text: { fontSize: 18, fontWeight: '700' },
  link: { alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingVertical: 8 },
  linkText: { fontSize: 15, fontWeight: '700' },
});
