import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirmRequest, payRequest } from '../api/requests';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import { NETWORKS } from '../data/networks';
import { errorMessage } from '../utils/errors';
import Field from './Field';
import { CheckIcon, PhoneIcon, WalletIcon } from './Icons';

export const money = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;

// The customer pays the price the fundi entered, with mobile money.
//   request: { id, agreed_price }   onPaid(request): called after a successful payment
export default function PayModal({ visible, request, onClose, onPaid }) {
  const { colors, t } = useSettings();
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [network, setNetwork] = useState('mpesa');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [confirmed, setConfirmed] = useState(false); // the customer said the work is done

  // Start with the number of the account (without 255)
  useEffect(() => {
    if (visible) {
      setPhone(String(user?.phone || '').replace(/^255/, ''));
      setError('');
      setDone(false);
      setBusy(false);
      setConfirmed(!!request?.customer_confirmed_at);
    }
  }, [visible, user?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 1: "yes, the work is done"
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await confirmRequest(token, request.id);
      setConfirmed(true);
      onPaid?.();
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (busy) return;
    const digits = phone.replace(/\D/g, '').replace(/^0/, '');
    if (!/^[67]\d{8}$/.test(digits)) return setError('PHONE_INVALID');
    setBusy(true);
    setError('');
    try {
      const r = await payRequest(token, request.id, { network, phone: digits });
      setDone(true);
      onPaid?.(r.request);
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    } finally {
      setBusy(false);
    }
  };

  if (!request) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 }]} behavior="padding">
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} accessibilityLabel={t('close')} />
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: 'center' }} showsVerticalScrollIndicator={false}>
            <View style={[styles.badge, { backgroundColor: colors.surface, borderColor: done ? colors.success : colors.primary }]}>
              {done ? <CheckIcon size={30} color={colors.success} strokeWidth={2.6} /> : <WalletIcon size={28} color={colors.primary} />}
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{done ? t('payDoneTitle') : confirmed ? t('payTitle') : t('confirmTitle')}</Text>
            <Text style={[styles.amount, { color: done ? colors.success : colors.primary }]}>{money(request.agreed_price ?? request.price)}</Text>

            {done ? (
              <>
                <Text style={[styles.body, { color: colors.textMuted }]}>{t('payDoneBody')}</Text>
                <Pressable onPress={onClose} style={[styles.main, { backgroundColor: colors.primary }]} accessibilityRole="button">
                  <Text style={[styles.mainText, { color: colors.onPrimary }]}>{t('done')}</Text>
                </Pressable>
              </>
            ) : !confirmed ? (
              <>
                <Text style={[styles.body, { color: colors.textMuted }]}>{t('confirmBody')}</Text>
                {error ? <Text style={{ color: colors.error, marginTop: 10, textAlign: 'center' }}>{errorMessage(t, error)}</Text> : null}
                <View style={styles.actions}>
                  <Pressable onPress={onClose} disabled={busy} style={[styles.btn, { backgroundColor: colors.surface }]} accessibilityRole="button">
                    <Text style={[styles.mainText, { color: colors.text }]}>{t('close')}</Text>
                  </Pressable>
                  <Pressable onPress={confirm} disabled={busy} style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} accessibilityRole="button">
                    <Text style={[styles.mainText, { color: colors.onPrimary }]}>{busy ? t('pleaseWait') : t('confirmYes')}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.body, { color: colors.textMuted }]}>{t('payBody')}</Text>

                <Text style={[styles.label, { color: colors.text }]}>{t('payNetwork')}</Text>
                <View style={styles.networks}>
                  {NETWORKS.map((n) => {
                    const on = network === n.value;
                    return (
                      <Pressable
                        key={n.value}
                        onPress={() => setNetwork(n.value)}
                        style={[styles.chip, { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={{ color: on ? colors.onPrimary : colors.text, fontWeight: '700', fontSize: 14 }}>{n.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ alignSelf: 'stretch' }}>
                  <Field
                    label={t('payPhone')}
                    icon={<PhoneIcon size={20} color={colors.textMuted} />}
                    prefix="+255"
                    value={phone}
                    onChangeText={(v) => {
                      setPhone(v.replace(/\D/g, '').slice(0, 10));
                      setError('');
                    }}
                    keyboardType="number-pad"
                    maxLength={10}
                    placeholder="712 345 678"
                    onSubmitEditing={pay}
                    error={error ? errorMessage(t, error) : ''}
                  />
                </View>
                <Text style={[styles.hint, { color: colors.textMuted }]}>{t('payHint')}</Text>

                <View style={styles.actions}>
                  <Pressable onPress={onClose} disabled={busy} style={[styles.btn, { backgroundColor: colors.surface }]} accessibilityRole="button">
                    <Text style={[styles.mainText, { color: colors.text }]}>{t('cancel')}</Text>
                  </Pressable>
                  <Pressable onPress={pay} disabled={busy} style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} accessibilityRole="button">
                    <Text style={[styles.mainText, { color: colors.onPrimary }]}>{busy ? t('payWait') : `${t('payNow')}`}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', },
  card: { width: '100%', maxWidth: 400, maxHeight: '90%', borderRadius: 22, borderWidth: 1, padding: 22 },
  badge: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 16 },
  amount: { fontSize: 28, fontWeight: '800', marginTop: 6 },
  body: { fontSize: 15, textAlign: 'center', marginTop: 8 },
  label: { alignSelf: 'flex-start', fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  networks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch' },
  chip: { paddingHorizontal: 14, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { alignSelf: 'stretch', fontSize: 12, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 18, alignSelf: 'stretch' },
  btn: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  main: { alignSelf: 'stretch', minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  mainText: { fontSize: 16, fontWeight: '700' },
});
