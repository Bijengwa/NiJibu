import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import Field from '../components/Field';
import FormScreen from '../components/FormScreen';
import FeeStep from '../components/FeeStep';
import IdentityQuiz from '../components/IdentityQuiz';
import TermsCheck from '../components/TermsCheck';
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon, PhoneIcon } from '../components/Icons';
import { TEST_MODE } from '../config';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { saveDraft } from '../signup/draft';
import { errorMessage } from '../utils/errors';
import { onlyDigits, validateConfirm, validateEmail, validateNamePart, validatePassword, validatePhone } from '../utils/validation';

// Sign-up for a fundi (3 steps), before the account exists:
//   1 account details: names + phone + email + password
//   2 the registration fee (every identity check is paid, no refund)
//   3 NIDA check: the NIDA number + one question, sent to NIDA with the names and phone in ONE hit
//     (a second hit only to correct mistakes)
// Then the phone code is asked (VerifyScreen). onCancel goes back to the login.
export default function WorkerSignupScreen({ onCancel }) {
  const { colors, t } = useSettings();
  const { register } = useAuth();

  const [step, setStep] = useState(1);
  const [v, setV] = useState({ firstName: '', middleName: '', lastName: '', phone: '', email: '', password: '', confirm: '' });
  const [feeId, setFeeId] = useState(null);
  const [agreed, setAgreed] = useState(false);
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

  // Step 1: check the form (NIDA is asked only after the fee is paid)
  const next1 = () => {
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
    setFeeId(null); // a new try is a new payment
    setStep(2);
  };

  // After the questions are passed: create the account (the code is sent to the phone)
  const finish = async (d) => {
    if (loading) return;
    setErrors({});
    setLoading(true);
    try {
      setChecking(true);
      // d = what passed NIDA (the names and the NIDA number may have been corrected in the check)
      await saveDraft({
        phone: v.phone,
        firstName: d.firstName,
        middleName: d.middleName,
        lastName: d.lastName,
        email: v.email.trim(),
        nidaNumber: d.nidaNumber,
      });
      await register(v.phone, v.password, agreed); // App then shows the code screen
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
        <Button title={t('continue')} onPress={next1} style={{ marginTop: 20 }} />
      </FormScreen>
    );
  }

  if (step === 2) {
    return (
      <FormScreen step={2} steps={3} title={t('feeTitle')} subtitle={t('feeSub')} onBack={back}>
        <FeeStep phone={v.phone} onPaid={(id) => { setFeeId(id); setStep(3); }} />
      </FormScreen>
    );
  }

  if (step === 3) {
    // The fee is paid: no back arrow (going back would mean paying again)
    return (
      <FormScreen step={3} steps={3} title={t('quizTitle')} subtitle={t('quizSub')}>
        <IdentityQuiz
          feeId={feeId}
          details={{ nidaNumber: nida, firstName: v.firstName.trim(), middleName: v.middleName.trim(), lastName: v.lastName.trim(), phone: v.phone }}
          onPass={(d) => { setV((x) => ({ ...x, firstName: d.firstName, middleName: d.middleName, lastName: d.lastName })); setNida(d.nidaNumber); setStep(4); finish(d); }}
          onExit={() => setStep(1)}
        />
      </FormScreen>
    );
  }

  // Step 4: creating the account (no screen to fill; if it fails the fundi can try again, the check stays valid for 1 hour)
  const lastD = { nidaNumber: nida, firstName: v.firstName.trim(), middleName: v.middleName.trim(), lastName: v.lastName.trim() };
  return (
    <FormScreen step={3} steps={3} title={t('signupCreatingTitle')} subtitle={t('signupFingerSub')}>
      <View style={styles.center}>
        {checking ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        <Text style={[styles.fingerLabel, { color: colors.text }]}>{checking ? t('nidaChecking') : ''}</Text>
      </View>
      {formError}
      {!loading && !!errors.form && <Button title={t('tryAgain')} onPress={() => finish(lastD)} style={{ marginTop: 20 }} />}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginTop: 28 },
  fingerLabel: { fontSize: 17, fontWeight: '700', marginTop: 14 },
  formError: { fontSize: 14, textAlign: 'center', marginTop: 16 },
  note: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 16 },
  noteText: { fontSize: 13 },
});
