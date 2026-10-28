import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useJobs } from '../context/JobsContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../utils/errors';
import Field from './Field';
import { CheckIcon, WalletIcon } from './Icons';
import { money } from './PriceModal';

const NET = { mpesa: 'M-Pesa', mixx: 'Mixx', airtel: 'Airtel Money', halopesa: 'HaloPesa' };

// "Did you receive TZS X?" for every payout NiJibu sent that the fundi has not answered yet.
export default function ReceiptCards() {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  const { jobs, confirmReceived, complain } = useJobs();
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState('');
  const [problemFor, setProblemFor] = useState(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');

  const waiting = jobs.filter((j) => j.payout_status === 'sent' && !j.received_at && j.complaint_status !== 'open');
  if (!waiting.length && !problemFor) return null;

  const yes = async (id) => {
    setBusy(id);
    setError('');
    try {
      await confirmReceived(id);
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    } finally {
      setBusy(0);
    }
  };

  const send = async () => {
    if (note.trim().length < 5) return setNoteError(t('complaintShort'));
    setBusy(problemFor);
    setNoteError('');
    try {
      await complain(problemFor, note.trim());
      setProblemFor(null);
      setNote('');
    } catch (e) {
      setNoteError(errorMessage(t, e.code || 'UNKNOWN'));
    } finally {
      setBusy(0);
    }
  };

  return (
    <View>
      {waiting.map((j) => (
        <View key={j.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.success }]}>
          <View style={styles.head}>
            <WalletIcon size={22} color={colors.success} />
            <Text style={[styles.title, { color: colors.text }]}>{t('recvTitle').replace('{a}', money(j.payout))}</Text>
          </View>
          <Text style={[styles.body, { color: colors.textMuted }]}>{t('recvBody').replace(/\{a\}/g, money(j.payout)).replace('{n}', NET[j.payout_network] || '')}</Text>
          <View style={styles.actions}>
            <Pressable onPress={() => { setProblemFor(j.id); setNote(''); setNoteError(''); }} disabled={!!busy} style={[styles.btn, { backgroundColor: colors.background }]} accessibilityRole="button">
              <Text style={[styles.btnText, { color: colors.error }]}>{t('recvNo')}</Text>
            </Pressable>
            <Pressable onPress={() => yes(j.id)} disabled={!!busy} style={[styles.btn, { backgroundColor: colors.success, opacity: busy === j.id ? 0.6 : 1 }]} accessibilityRole="button">
              <CheckIcon size={18} color="#fff" strokeWidth={2.6} />
              <Text style={[styles.btnText, { color: '#fff' }]}>{t('recvYes')}</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {!!error && <Text style={{ color: colors.error, marginTop: 8 }}>{errorMessage(t, error)}</Text>}

      <Modal visible={!!problemFor} transparent animationType="fade" onRequestClose={() => setProblemFor(null)} statusBarTranslucent>
        <KeyboardAvoidingView style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 }]} behavior="padding">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setProblemFor(null)} accessibilityLabel={t('cancel')} />
          <View style={[styles.modal, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.mTitle, { color: colors.text }]}>{t('complaintTitle')}</Text>
            <Text style={[styles.body, { color: colors.textMuted, textAlign: 'center' }]}>{t('complaintBody')}</Text>
            <View style={{ alignSelf: 'stretch' }}>
              <Field
                label={t('complaintLabel')}
                value={note}
                onChangeText={(v) => { setNote(v); setNoteError(''); }}
                multiline
                maxLength={300}
                style={{ height: 100, textAlignVertical: 'top', paddingTop: 12 }}
                error={noteError}
              />
            </View>
            <View style={[styles.actions, { alignSelf: 'stretch' }]}>
              <Pressable onPress={() => setProblemFor(null)} style={[styles.btn, { backgroundColor: colors.surface }]} accessibilityRole="button">
                <Text style={[styles.btnText, { color: colors.text }]}>{t('cancel')}</Text>
              </Pressable>
              <Pressable onPress={send} disabled={!!busy} style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} accessibilityRole="button">
                <Text style={[styles.btnText, { color: colors.onPrimary }]}>{t('complaintSend')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1.5, padding: 14, marginTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '800', flex: 1 },
  body: { fontSize: 14, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 8 },
  btnText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  modal: { width: '100%', maxWidth: 380, borderRadius: 22, borderWidth: 1, padding: 22, alignItems: 'center' },
  mTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
});
