import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../api/me';
import Field from '../components/Field';
import { EyeIcon, EyeOffIcon, LockIcon } from '../components/Icons';
import ScreenHeader from '../components/ScreenHeader';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../utils/errors';
import { validateConfirm, validatePassword } from '../utils/validation';

export default function ChangePasswordScreen({ onBack }) {
  const { colors, t } = useSettings();
  const { token, updateUser, replaceToken } = useAuth();
  const insets = useSafeAreaInsets();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const nextRef = useRef(null);
  const confirmRef = useRef(null);

  const submit = async () => {
    if (loading) return;
    const e = {
      current: current ? '' : 'passwordRequired',
      next: validatePassword(next),
      confirm: validateConfirm(next, confirm),
    };
    setErrors(e);
    if (e.current || e.next || e.confirm) return;

    setLoading(true);
    try {
      const r = await api.changePassword(token, current, next);
      await replaceToken(r.token); // other devices are logged out, this one continues
      updateUser(r.user);
      Alert.alert(t('passwordChanged'), t('passwordChangedBody'), [{ text: t('ok'), onPress: onBack }]);
    } catch (err) {
      if (err.code === 'WRONG_PASSWORD') setErrors({ current: 'WRONG_PASSWORD' });
      else if (err.code === 'SAME_PASSWORD') setErrors({ next: 'SAME_PASSWORD' });
      else setErrors({ form: err.code || 'UNKNOWN' });
    } finally {
      setLoading(false);
    }
  };

  const eye = (
    <Pressable onPress={() => setShow((s) => !s)} hitSlop={12} accessibilityRole="button" accessibilityLabel={show ? t('hidePassword') : t('showPassword')}>
      {show ? <EyeOffIcon color={colors.textMuted} /> : <EyeIcon color={colors.textMuted} />}
    </Pressable>
  );
  const lockIcon = <LockIcon size={20} color={colors.textMuted} />;
  const common = { secureTextEntry: !show, autoCapitalize: 'none', autoCorrect: false };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior="padding">
      <ScreenHeader title={t('changePassword')} onBack={onBack} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left + 20,
          paddingRight: insets.right + 20,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Field label={t('currentPassword')} icon={lockIcon} right={eye} value={current} onChangeText={setCurrent}
          autoComplete="current-password" returnKeyType="next" onSubmitEditing={() => nextRef.current?.focus()}
          error={errors.current ? t(errors.current) : ''} {...common} />
        <Field label={t('newPassword')} icon={lockIcon} inputRef={nextRef} value={next} onChangeText={setNext}
          autoComplete="new-password" returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()}
          error={errors.next ? t(errors.next) : ''} {...common} />
        <Field label={t('confirmPassword')} icon={lockIcon} inputRef={confirmRef} value={confirm} onChangeText={setConfirm}
          autoComplete="new-password" returnKeyType="done" onSubmitEditing={submit}
          error={errors.confirm ? t(errors.confirm) : ''} {...common} />

        {!!errors.form && <Text style={[styles.formError, { color: colors.error }]}>{errorMessage(t, errors.form)}</Text>}

        <Pressable
          onPress={submit}
          disabled={loading}
          style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{loading ? t('pleaseWait') : t('changePassword')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  formError: { textAlign: 'center', fontSize: 14, marginTop: 16 },
  button: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontSize: 18, fontWeight: '700' },
});
