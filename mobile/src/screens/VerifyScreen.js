import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SettingsBar from '../components/SettingsBar';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../utils/errors';
import { onlyCodeDigits, validateCode } from '../utils/validation';

export default function VerifyScreen() {
  const { colors, t } = useSettings();
  const { pending, verify, resend, cancelVerification } = useAuth();
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState('');
  const [error, setError] = useState(''); // translation key
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(pending?.retryAfter ?? 60);

  // Countdown until "Resend" is allowed
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const submit = async () => {
    if (loading) return;
    const invalid = validateCode(code);
    if (invalid) return setError(invalid);

    setError('');
    setLoading(true);
    try {
      await verify(code); // success -> App shows the home screen
    } catch (e) {
      setError(e.code || 'UNKNOWN');
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (seconds > 0) return;
    setError('');
    try {
      setSeconds(await resend());
      setCode('');
    } catch (e) {
      if (e.retryAfter) setSeconds(e.retryAfter);
      setError(e.code || 'UNKNOWN');
    }
  };

  const p = pending?.phone ?? '';
  const shown = `+255 ${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior="padding"
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 24,
            paddingLeft: insets.left + 24,
            paddingRight: insets.right + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <SettingsBar />

        <View style={styles.center}>
          <Text style={[styles.brand, { color: colors.primary }]}>NiJibu</Text>
          <Text style={[styles.title, { color: colors.text }]}>{t('verifyTitle')}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t('verifySubtitle')}
          </Text>
          <Text style={[styles.phone, { color: colors.text }]}>{shown}</Text>

          <TextInput
            style={[
              styles.codeInput,
              {
                backgroundColor: colors.surface,
                color: colors.text,
                borderColor: error ? colors.error : colors.border,
              },
            ]}
            value={code}
            onChangeText={(v) => setCode(onlyCodeDigits(v))}
            placeholder="······"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            accessibilityLabel={t('codeLabel')}
            onSubmitEditing={submit}
          />
          {!!error && (
            <Text style={[styles.error, { color: colors.error }]}>{errorMessage(t, error)}</Text>
          )}

          {__DEV__ && (
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t('devOtpHint')}</Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary, opacity: pressed || loading ? 0.7 : 1 },
            ]}
            onPress={submit}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
              {loading ? t('pleaseWait') : t('verify')}
            </Text>
          </Pressable>

          <Pressable
            onPress={onResend}
            disabled={seconds > 0}
            hitSlop={10}
            style={styles.linkWrap}
            accessibilityRole="button"
          >
            <Text style={[styles.link, { color: seconds > 0 ? colors.textMuted : colors.primary }]}>
              {seconds > 0 ? `${t('resendIn')} ${seconds}s` : t('resendCode')}
            </Text>
          </Pressable>

          <Pressable onPress={cancelVerification} hitSlop={10} style={styles.linkWrap} accessibilityRole="button">
            <Text style={[styles.link, { color: colors.textMuted }]}>{t('back')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', paddingVertical: 24 },
  brand: { fontSize: 38, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: 18 },
  subtitle: { fontSize: 15, textAlign: 'center', marginTop: 6 },
  phone: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginTop: 4, marginBottom: 22 },
  codeInput: {
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 12,
    textAlign: 'center',
  },
  error: { fontSize: 14, textAlign: 'center', marginTop: 12 },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 12 },
  button: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontSize: 18, fontWeight: '700' },
  linkWrap: { alignItems: 'center', marginTop: 20 },
  link: { fontSize: 15, fontWeight: '700' },
});
