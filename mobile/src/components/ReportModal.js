import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';

// Report a problem about one request. Two modes:
//   no `existing`  -> choose a reason, write what happened, send
//   `existing`     -> read only: what was sent, its status and the admin's reply
// `reasons` is the fixed list of reason keys, `onSend(reason, message)` throws an error with `code` on failure.
export default function ReportModal({ visible, reasons, existing, requestCode, onClose, onSend }) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setReason('');
      setMessage('');
      setBusy(false);
      setError('');
    }
  }, [visible]);

  async function send() {
    if (!reason) return setError(t('reportPickReason'));
    if (message.trim().length < 5) return setError(t('reportShort'));
    setBusy(true);
    setError('');
    try {
      await onSend(reason, message.trim());
    } catch (e) {
      setError(t(e.code) === e.code ? t('reportFailed') : t(e.code));
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel={t('cancel')} />
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
          <Text style={[styles.title, { color: colors.text }]}>{existing ? t('reportSentTitle') : t('reportTitle')}</Text>
          {requestCode ? <Text style={[styles.sub, { color: colors.textMuted }]}>{requestCode}</Text> : null}

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
            {existing ? (
              <>
                <Text style={[styles.label, { color: colors.textMuted }]}>{t('reportReason')}</Text>
                <Text style={[styles.body, { color: colors.text }]}>{t(`cr_${existing.reason}`)}</Text>
                <Text style={[styles.label, { color: colors.textMuted }]}>{t('reportMessage')}</Text>
                <Text style={[styles.body, { color: colors.text }]}>{existing.message}</Text>
                <Text style={[styles.label, { color: colors.textMuted }]}>{t('reportStatus')}</Text>
                <Text style={[styles.body, { color: colors.primary, fontWeight: '800' }]}>{t(`cs_${existing.status}`)}</Text>
                {existing.reply ? (
                  <>
                    <Text style={[styles.label, { color: colors.textMuted }]}>{t('reportReply')}</Text>
                    <Text style={[styles.body, { color: colors.text }]}>{existing.reply}</Text>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Text style={[styles.label, { color: colors.textMuted }]}>{t('reportReason')}</Text>
                <View style={styles.chips}>
                  {reasons.map((r) => {
                    const on = reason === r;
                    return (
                      <Pressable
                        key={r}
                        onPress={() => setReason(r)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[styles.chip, { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                      >
                        <Text style={{ color: on ? colors.onPrimary : colors.text, fontWeight: '600' }}>{t(`cr_${r}`)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.label, { color: colors.textMuted }]}>{t('reportMessage')}</Text>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  maxLength={500}
                  placeholder={t('reportPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
                />
                <Text style={[styles.hint, { color: colors.textMuted }]}>{t('reportHint')}</Text>
                {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
              </>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.btn, { backgroundColor: colors.surface }]} accessibilityRole="button">
              <Text style={[styles.btnText, { color: colors.text }]}>{existing ? t('close') : t('cancel')}</Text>
            </Pressable>
            {existing ? null : (
              <Pressable onPress={send} disabled={busy} style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]} accessibilityRole="button">
                {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.btnText, { color: colors.onPrimary }]}>{t('reportSend')}</Text>}
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  body: { fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  input: { minHeight: 96, borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 16, textAlignVertical: 'top' },
  hint: { fontSize: 12, marginTop: 6 },
  error: { fontSize: 14, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  btn: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
});
