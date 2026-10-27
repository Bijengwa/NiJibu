import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import Field from '../components/Field';
import FormScreen from '../components/FormScreen';
import IdentityQuiz from '../components/IdentityQuiz';
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon, PhoneIcon, ShieldCheckIcon } from '../components/Icons';
import { FingerprintIcon } from '../components/WorkerIcons';
import { matchNida } from '../api/provider';
import { TEST_MODE } from '../config';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { saveDraft } from '../signup/draft';
import { errorMessage } from '../utils/errors';
import { scanFingerprint } from '../utils/fingerprint';
import {
  formatNida, onlyDigits, onlyNidaDigits, validateConfirm, validateEmail, validateNamePart,
  validateNida, validatePassword, validatePhone,
} from '../utils/validation';

// Sign-up for a fundi (3 steps), before the account exists:
//   1 names + phone + email + NIDA number + password (NIDA must match the names and the phone)
//   2 NIDA questions, one at a time (5 right in a row, at most 8)   3 fingerprint
// Then the phone code is asked (VerifyScreen). onCancel goes back to the login.
export default function WorkerSignupScreen({ onCancel }) {
  const { colors, t } = useSettings();
  const { register } = useAuth();

  const [step, setStep] = useState(1);
  const [v, setV] = useState({ firstName: '', middleName: '', lastName: '', phone: '', email: '', password: '', confirm: '' });
  const [matching, setMatching] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [nida, setNida] = useState('');
  const [errors, setErrors] = useState({}); // values are translation keys
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const refs = { middle: useRef(null), last: useRef(null), phone: useRef(null), email: useRef(null), password: useRef(null), confirm: useRef(null) };

  const set = (k, val) => {
    setV((x) => ({ ...x, [k]: val }));
    setErrors((e) => ({ ...e, [k]: '', form: '' }));
  };
  const err = (k) => (errors[k] ? t(errors[k]) : '');

  const back = () => {
    setErrors({});
    if (step === 1) onCancel();
    else setStep(step - 1);
  };

  // Step 1: check the form, then ask NIDA if the number, names and phone belong together
  const next1 = async () => {
    if (matching) return;
    const e = {
      firstName: validateNamePart(v.firstName),
      middleName: validateNamePart(v.middleName, true),
      lastName: validateNamePart(v.lastName),
      phone: validatePhone(v.phone),
      email: validateEmail(v.email),
      nida: validateNida(nida),
      password: validatePassword(v.password),
      confirm: validateConfirm(v.password, v.confirm),
    };
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setMatching(true);
    try {
      await matchNida({ nidaNumber: nida, firstName: v.firstName.trim(), middleName: v.middleName.trim(), lastName: v.lastName.trim(), phone: v.phone });
      setStep(2);
    } catch (x) {
      setErrors({ form: x.code || 'UNKNOWN' });
    } finally {
      setMatching(false);
    }
  };

  // Step 3: fingerprint -> create the account (the code is sent to the phone)
  const finish = async () => {
    if (loading) return;
    setErrors({});
    setLoading(true);
    try {
      const code = await scanFingerprint(t);
      if (code) {
        setErrors({ form: code });
        setLoading(false);
        return;
      }
      setChecking(true);
      await saveDraft({
        phone: v.phone,
        firstName: v.firstName.trim(),
        middleName: v.middleName.trim(),
        lastName: v.lastName.trim(),
        email: v.email.trim(),
        nidaNumber: nida,
      });
      await register(v.phone, v.password); // App then shows the code screen
    } catch (e) {
      setErrors({ form: e.code || 'UNKNOWN' });
      setChecking(false);
      setLoading(false);
    }
  };

  const eye = (
    <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={12} accessibilityRole="button"
      accessibilityLabel={showPassword ? t('hidePassword') : t('showPassword')}>
      {showPassword ? <EyeOffIcon color={colors.textMuted} /> : <EyeIcon color={colors.textMuted} />}
    </Pressable>
  );

  const formError = !!errors.form && (
    <Text style={[styles.formError, { color: colors.error }]}>{errorMessage(t, errors.form)}</Text>
  );

  if (step === 1) {
    return (
      <FormScreen step={1} steps={3} title={t('signupTitle')} subtitle={t('signupSub')} onBack={back}>
        <Field label={t('firstName')} value={v.firstName} onChangeText={(x) => set('firstName', x)} autoCapitalize="words"
          returnKeyType="next" onSubmitEditing={() => refs.middle.current?.focus()} error={err('firstName')} />
        <Field label={t('middleName')} inputRef={refs.middle} value={v.middleName} onChangeText={(x) => set('middleName', x)}
          autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => refs.last.current?.focus()} error={err('middleName')} />
        <Field label={t('lastName')} inputRef={refs.last} value={v.lastName} onChangeText={(x) => set('lastName', x)}
          autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => refs.phone.current?.focus()} error={err('lastName')} />
        <Field label={t('phone')} inputRef={refs.phone} icon={<PhoneIcon size={20} color={colors.textMuted} />} prefix="🇹🇿 +255"
          value={v.phone} onChangeText={(x) => set('phone', onlyDigits(x))} placeholder="795259567" keyboardType="number-pad"
          maxLength={9} autoComplete="tel" error={err('phone')} />
        <Field label={t('email')} inputRef={refs.email} icon={<MailIcon size={20} color={colors.textMuted} />} value={v.email}
          onChangeText={(x) => set('email', x)} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none"
          autoCorrect={false} autoComplete="email" error={err('email')} />
        <Field label={t('nidaNumber')} icon={<ShieldCheckIcon size={20} color={colors.textMuted} />} value={formatNida(nida)}
          onChangeText={(x) => { setNida(onlyNidaDigits(x)); setErrors((e) => ({ ...e, nida: '' })); }} placeholder="19900101-12345-12345-12"
          keyboardType="number-pad" maxLength={23} error={err('nida')} />
        <Field label={t('password')} icon={<LockIcon size={20} color={colors.textMuted} />} right={eye} inputRef={refs.password}
          value={v.password} onChangeText={(x) => set('password', x)} placeholder="••••••" secureTextEntry={!showPassword}
          autoCapitalize="none" autoCorrect={false} autoComplete="new-password" error={err('password')} />
        <Field label={t('confirmPassword')} icon={<LockIcon size={20} color={colors.textMuted} />} inputRef={refs.confirm}
          value={v.confirm} onChangeText={(x) => set('confirm', x)} placeholder="••••••" secureTextEntry={!showPassword}
          autoCapitalize="none" autoCorrect={false} autoComplete="new-password" error={err('confirm')} />
        {!!errors.form && (
          <Text style={[styles.formError, { color: colors.error }]}>{errorMessage(t, errors.form)}</Text>
        )}
        {TEST_MODE && (
          <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.noteText, { color: colors.textMuted }]}>{t('signupDemo')}</Text>
          </View>
        )}
        <Button title={matching ? t('nidaChecking') : t('continue')} onPress={next1} loading={matching} style={{ marginTop: 20 }} />
      </FormScreen>
    );
  }

  if (step === 2) {
    return (
      <FormScreen step={2} steps={3} title={t('quizTitle')} subtitle={t('quizSub')}>
        <IdentityQuiz nidaNumber={nida} onPass={() => setStep(3)} onExit={onCancel} />
      </FormScreen>
    );
  }

  return (
    <FormScreen step={3} steps={3} title={t('signupFingerTitle')} subtitle={t('signupFingerSub')} onBack={loading ? undefined : () => setStep(1)}>
      <View style={styles.center}>
        <Pressable onPress={finish} disabled={loading} accessibilityRole="button" accessibilityLabel={t('fingerButton')}
          style={({ pressed }) => [styles.finger, { backgroundColor: colors.surface, borderColor: colors.primary, opacity: pressed || loading ? 0.7 : 1 }]}>
          {checking ? <ActivityIndicator size="large" color={colors.primary} /> : <FingerprintIcon size={64} color={colors.primary} strokeWidth={1.6} />}
        </Pressable>
        <Text style={[styles.fingerLabel, { color: colors.text }]}>{checking ? t('nidaChecking') : t('fingerButton')}</Text>
        <Text style={[styles.fingerHelp, { color: colors.textMuted }]}>{t('fingerHelp')}</Text>
      </View>
      {formError}
      {TEST_MODE && (
        <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 24 }]}>
          <Text style={[styles.noteText, { color: colors.textMuted }]}>{t('nidaDemoNote')}</Text>
        </View>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginTop: 28 },
  finger: { width: 132, height: 132, borderRadius: 66, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  fingerLabel: { fontSize: 17, fontWeight: '700', marginTop: 14 },
  fingerHelp: { fontSize: 14, marginTop: 4, textAlign: 'center' },
  formError: { fontSize: 14, textAlign: 'center', marginTop: 16 },
  note: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 16 },
  noteText: { fontSize: 13 },
});
