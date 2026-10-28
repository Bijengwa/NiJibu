import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import Field from './Field';
import { WalletIcon } from './Icons';

const COMMISSION = 10; // % kept by NiJibu (the server decides; this is only for the preview)
export const MIN_PRICE = 1000;
export const MAX_PRICE = 5000000;

export const money = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;

// The fundi types the final price when the work is done. Shows what he will get after the NiJibu fee.
export default function PriceModal({ visible, onCancel, onConfirm, busy }) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const price = parseInt(text.replace(/\D/g, ''), 10) || 0;
  const fee = Math.round((price * COMMISSION) / 100);

  const submit = () => {
    if (price < MIN_PRICE || price > MAX_PRICE) return setError(t('priceInvalid'));
    setError('');
    onConfirm(price);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 }]} behavior="padding">
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel={t('cancel')} />
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.badge, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <WalletIcon size={28} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{t('priceTitle')}</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>{t('priceBody')}</Text>

          <View style={{ alignSelf: 'stretch' }}>
            <Field
              label={t('priceLabel')}
              prefix="TZS"
              value={text ? price.toLocaleString('en-US') : ''}
              onChangeText={(v) => {
                setText(v);
                setError('');
              }}
              keyboardType="number-pad"
              placeholder="20,000"
              maxLength={11}
              autoFocus
              onSubmitEditing={submit}
              error={error}
            />
          </View>

          {price >= MIN_PRICE && (
            <View style={[styles.split, { backgroundColor: colors.surface }]}>
              <View style={styles.line}>
                <Text style={{ color: colors.textMuted }}>{t('priceFee').replace('{p}', COMMISSION)}</Text>
                <Text style={{ color: colors.textMuted }}>- {money(fee)}</Text>
              </View>
              <View style={styles.line}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>{t('priceYouGet')}</Text>
                <Text style={{ color: colors.success, fontWeight: '800', fontSize: 18 }}>{money(price - fee)}</Text>
              </View>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable onPress={onCancel} disabled={busy} style={[styles.btn, { backgroundColor: colors.surface }]} accessibilityRole="button">
              <Text style={[styles.btnText, { color: colors.text }]}>{t('cancel')}</Text>
            </Pressable>
            <Pressable onPress={submit} disabled={busy} style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} accessibilityRole="button">
              <Text style={[styles.btnText, { color: colors.onPrimary }]}>{busy ? t('pleaseWait') : t('priceConfirm')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', },
  card: { width: '100%', maxWidth: 380, borderRadius: 22, borderWidth: 1, padding: 22, alignItems: 'center' },
  badge: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 16 },
  body: { fontSize: 15, textAlign: 'center', marginTop: 8 },
  split: { alignSelf: 'stretch', borderRadius: 12, padding: 12, marginTop: 14, gap: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20, alignSelf: 'stretch' },
  btn: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  btnText: { fontSize: 16, fontWeight: '700' },
});
