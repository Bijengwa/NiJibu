import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import Button from './Button';
import { CheckIcon } from './Icons';
import TermsText from './TermsText';

// "I agree to the Terms and Conditions" checkbox. The words "Terms and Conditions" open the full text.
//   checked / onChange(bool)   error: translation key or ''
export default function TermsCheck({ checked, onChange, error }) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ marginTop: 16 }}>
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(!checked)}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          style={[styles.box, { borderColor: error ? colors.error : checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' }]}
        >
          {checked ? <CheckIcon size={16} color={colors.onPrimary} strokeWidth={3} /> : null}
        </Pressable>
        <Text style={[styles.text, { color: colors.text }]}>
          {t('termsAgreePre')}{' '}
          <Text style={{ color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => setOpen(true)}>
            {t('termsLink')}
          </Text>
        </Text>
      </View>
      {!!error && <Text style={[styles.error, { color: colors.error }]}>{t(error)}</Text>}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 12 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>
            <TermsText />
          </ScrollView>
          <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 12 }}>
            <Button title={t('close')} onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontSize: 14 },
  error: { fontSize: 13, marginTop: 6 },
});
