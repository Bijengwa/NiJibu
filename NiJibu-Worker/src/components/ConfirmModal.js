import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';

// Question box in the app colours (use it instead of Alert.alert).
//   Icon: component for the round badge   danger: red confirm button
export default function ConfirmModal({ visible, title, body, confirmLabel, cancelLabel, Icon, danger, onConfirm, onCancel }) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  const tone = danger ? colors.error : colors.primary;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={[styles.overlay, { paddingBottom: insets.bottom + 24, paddingTop: insets.top + 24 }]} onPress={onCancel} accessibilityLabel={cancelLabel || t('cancel')}>
        <Pressable style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => {}}>
          {Icon ? (
            <View style={[styles.badge, { backgroundColor: colors.surface, borderColor: tone }]}>
              <Icon size={28} color={tone} />
            </View>
          ) : null}
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {body ? <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.btn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]} accessibilityRole="button">
              <Text style={[styles.btnText, { color: colors.text }]}>{cancelLabel || t('cancel')}</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={({ pressed }) => [styles.btn, { backgroundColor: tone, opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button">
              <Text style={[styles.btnText, { color: danger ? '#FFFFFF' : colors.onPrimary }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: 22, borderWidth: 1, padding: 22, alignItems: 'center' },
  badge: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 16 },
  body: { fontSize: 15, textAlign: 'center', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 22, alignSelf: 'stretch' },
  btn: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  btnText: { fontSize: 16, fontWeight: '700' },
});
