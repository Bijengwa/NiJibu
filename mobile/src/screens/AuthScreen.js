import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Field from '../components/Field';
import { EyeIcon, EyeOffIcon, LockIcon, PhoneIcon } from '../components/Icons';
import SettingsBar from '../components/SettingsBar';
import { errorMessage } from '../utils/errors';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import {
  onlyDigits,
  validateConfirm,
  validatePassword,
  validatePhone,
} from '../utils/validation';

export default function AuthScreen() {
  const { colors, t } = useSettings();
  const { login, register } = useAuth();
  const insets = useSafeAreaInsets();

  const [isRegister, setIsRegister] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({}); // values are translation keys
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const switchMode = () => {
    setErrors({});
    setPassword('');
    setConfirm('');
    setIsRegister((r) => !r);
  };

  const submit = async () => {
    if (loading) return;
    const next = {
      phone: validatePhone(phone),
      password: validatePassword(password),
      confirm: isRegister ? validateConfirm(password, confirm) : '',
    };
    setErrors(next);
    if (next.phone || next.password || next.confirm) return;

    setLoading(true);
    try {
      await (isRegister ? register(phone, password) : login(phone, password));
      // On success AuthContext updates and App shows the home screen.
    } catch (e) {
      setErrors({ form: e.code || 'UNKNOWN' });
      setLoading(false);
    }
  };

  const eyeButton = (
    <Pressable
      onPress={() => setShowPassword((s) => !s)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={showPassword ? t('hidePassword') : t('showPassword')}
    >
      {showPassword ? (
        <EyeOffIcon color={colors.textMuted} />
      ) : (
        <EyeIcon color={colors.textMuted} />
      )}
    </Pressable>
  );

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
          <Text style={[styles.title, { color: colors.text }]}>
            {isRegister ? t('registerTitle') : t('loginTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {isRegister ? t('registerSubtitle') : t('loginSubtitle')}
          </Text>

          <Field
            label={t('phone')}
            icon={<PhoneIcon size={20} color={colors.textMuted} />}
            prefix="🇹🇿 +255"
            value={phone}
            onChangeText={(v) => setPhone(onlyDigits(v))}
            placeholder="795259567"
            keyboardType="number-pad"
            maxLength={9}
            autoComplete="tel"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={errors.phone ? t(errors.phone) : ''}
          />

          <Field
            label={t('password')}
            icon={<LockIcon size={20} color={colors.textMuted} />}
            right={eyeButton}
            inputRef={passwordRef}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            returnKeyType={isRegister ? 'next' : 'done'}
            onSubmitEditing={() => (isRegister ? confirmRef.current?.focus() : submit())}
            error={errors.password ? t(errors.password) : ''}
          />

          {isRegister && (
            <Field
              label={t('confirmPassword')}
              icon={<LockIcon size={20} color={colors.textMuted} />}
              inputRef={confirmRef}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="••••••"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={submit}
              error={errors.confirm ? t(errors.confirm) : ''}
            />
          )}

          {!!errors.form && (
            <Text style={[styles.formError, { color: colors.error }]}>{errorMessage(t, errors.form)}</Text>
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
              {loading ? t('pleaseWait') : isRegister ? t('register') : t('login')}
            </Text>
          </Pressable>

          <View style={styles.switchRow}>
            <Text style={[styles.switchText, { color: colors.textMuted }]}>
              {isRegister ? t('haveAccount') : t('noAccount')}{' '}
            </Text>
            <Pressable onPress={switchMode} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.primary }]}>
                {isRegister ? t('login') : t('register')}
              </Text>
            </Pressable>
          </View>
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
  subtitle: { fontSize: 15, textAlign: 'center', marginTop: 6, marginBottom: 14 },
  formError: { fontSize: 14, textAlign: 'center', marginTop: 16 },
  button: {
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  buttonText: { fontSize: 18, fontWeight: '700' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
  switchText: { fontSize: 15 },
  link: { fontSize: 15, fontWeight: '700' },
});
