import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import Field from '../components/Field';
import FormScreen from '../components/FormScreen';
import TermsCheck from '../components/TermsCheck';
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon, PhoneIcon } from '../components/Icons';
import { TEST_MODE } from '../config';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { saveDraft } from '../signup/draft';
import { errorMessage } from '../utils/errors';
import { onlyDigits, validateConfirm, validateEmail, validateNamePart, validatePassword, validatePhone } from '../utils/validation';

// Sign-up for a fundi. Three steps, in this order:
//   1 this screen: names + phone + email + password
//   2 the phone code (OTP, VerifyScreen). In test mode the code is printed in the backend terminal
//   3 the one-time registration fee (RegistrationFeeScreen), then the fundi picks jobs
// onCancel goes back to the login.
export default function WorkerSignupScreen({ onCancel }) {
  const { colors, t } = useSettings();
  const { register } = useAuth();

  const [v, setV] = useState({ firstName: '', middleName: '', lastName: '', phone: '', email: '', password: '', confirm: '' });
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({}); // values are translation keys
  const [loading, setLoading] = useState(false);
  const refs = { middle: useRef(null), last: useRef(null), phone: useRef(null), email: useRef(null), password: useRef(null), confirm: useRef(null) };

  const set = (k, val) => {
    setV((x) => ({ ...x, [k]: val }));
    setErrors((e) => ({ ...e, [k]: '', form: '' }));
  };
  const err = (k) => (errors[k] ? t(errors[k]) : '');

  // Check the form, create the account (the code is sent to the phone), then App shows the code screen
  const submit = async () => {
    if (loading) return;
    const e = {
      firstName: validateNamePart(v.firstName),
      middleName: validateNamePart(v.middleName, true),
      lastName: validateNamePart(v.lastName),
      phone: validatePhone(v.phone),
      email: validateEmail(v.email),
      password: validatePassword(v.password),
      confirm: validateConfirm(v.password, v.confirm),
      terms: agreed ? '' : 'termsRequired',
    };
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;

    setLoading(true);
    try {
      await saveDraft({
        phone: v.phone,
        firstName: v.firstName.trim(),
        middleName: v.middleName.trim(),
        lastName: v.lastName.trim(),
        email: v.email.trim(),
      });
      await register(v.phone, v.password, agreed);
    } catch (x) {
      setErrors({ form: x.code || 'UNKNOWN' });
      setLoading(false);
    }
  };

  const eye = (
    <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={12} accessibilityRole="button"
      accessibilityLabel={showPassword ? t('hidePassword') : t('showPassword')}>
      {showPassword ? <EyeOffIcon color={colors.textMuted} /> : <EyeIcon color={colors.textMuted} />}
    </Pressable>
  );

  return (
    <FormScreen step={1} steps={3} title={t('signupTitle')} subtitle={t('signupSub')} onBack={onCancel}>
      <Field label={t('firstName')} value={v.firstName} onChangeText={(x) => set('firstName', x)} autoCapitalize="words"
        returnKeyType="next" onSubmitEditing={() => refs.middle.current?.focus()} error={err('firstName')} />
      <Field label={t('middleName')} inputRef={refs.middle} value={v.middleName} onChangeText={(x) => set('middleName', x)}
        autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => refs.last.current?.focus()} error={err('middleName')} />
      <Field label={t('lastName')} inputRef={refs.last} value={v.lastName} onChangeText={(x) => set('lastName', x)}
        autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => refs.phone.current?.focus()} error={err('lastName')} />
      <Field label={t('phone')} inputRef={refs.phone} icon={<PhoneIcon size={20} color={colors.textMuted} />} prefix="+255"
        value={v.phone} onChangeText={(x) => set('phone', onlyDigits(x))} placeholder="795259567" keyboardType="number-pad"
        maxLength={9} autoComplete="tel" error={err('phone')} />
      <Field label={t('email')} inputRef={refs.email} icon={<MailIcon size={20} color={colors.textMuted} />} value={v.email}
        onChangeText={(x) => set('email', x)} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none"
        autoCorrect={false} autoComplete="email" error={err('email')} />
      <Field label={t('password')} icon={<LockIcon size={20} color={colors.textMuted} />} right={eye} inputRef={refs.password}
        value={v.password} onChangeText={(x) => set('password', x)} placeholder="••••••" secureTextEntry={!showPassword}
        autoCapitalize="none" autoCorrect={false} autoComplete="new-password" error={err('password')} />
      <Field label={t('confirmPassword')} icon={<LockIcon size={20} color={colors.textMuted} />} inputRef={refs.confirm}
        value={v.confirm} onChangeText={(x) => set('confirm', x)} placeholder="••••••" secureTextEntry={!showPassword}
        autoCapitalize="none" autoCorrect={false} autoComplete="new-password" error={err('confirm')} />
      <TermsCheck checked={agreed} onChange={(x) => { setAgreed(x); setErrors((s) => ({ ...s, terms: '' })); }} error={errors.terms} />
      {!!errors.form && (
        <Text style={[styles.formError, { color: colors.error }]}>{errorMessage(t, errors.form)}</Text>
      )}
      {TEST_MODE && (
        <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.noteText, { color: colors.textMuted }]}>{t('signupDemo')}</Text>
        </View>
      )}
      <Button title={t('continue')} onPress={submit} loading={loading} style={{ marginTop: 20 }} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  formError: { fontSize: 14, textAlign: 'center', marginTop: 16 },
  note: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 16 },
  noteText: { fontSize: 13 },
});
