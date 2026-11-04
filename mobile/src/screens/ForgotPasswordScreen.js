import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { forgot, reset } from '../api/auth';
import Button from '../components/Button';
import Field from '../components/Field';
import FormScreen from '../components/FormScreen';
import { EyeIcon, EyeOffIcon, LockIcon, PhoneIcon } from '../components/Icons';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../utils/errors';
import { onlyCodeDigits, onlyDigits, validateCode, validateConfirm, validatePassword, validatePhone } from '../utils/validation';

// Forgot password, 2 steps:
//   1 phone -> we send a 6 digit code by SMS (the answer is the same for any phone number)
//   2 the code + a new password -> then the person logs in again
// onBack: back to the login      onDone: after the password was changed (back to the login)
export default function ForgotPasswordScreen({ onBack, onDone, initialPhone = '' }) {
  const { colors, t } = useSettings();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0); // seconds before a new code can be asked
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);
  const startWait = (s) => {
    clearInterval(timer.current);
    setWait(s);
    timer.current = setInterval(() => setWait((w) => { if (w <= 1) { clearInterval(timer.current); return 0; } return w - 1; }), 1000);
  };

  const sendCode = async () => {
    if (busy) return;
    const bad = validatePhone(phone);
    setErrors({ phone: bad });
    if (bad) return;
    setBusy(true);
    try {
      const r = await forgot(phone);
      startWait(r.retry_after ?? 60);
      setStep(2);
      setErrors({});
    } catch (e) {
      setErrors({ form: e.code || 'UNKNOWN' });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || wait > 0) return;
    setBusy(true);
    try {
      const r = await forgot(phone);
      startWait(r.retry_after ?? 60);
      setErrors({});
    } catch (e) {
      setErrors({ form: e.code || 'UNKNOWN' });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy) return;
    const e = { code: validateCode(code), password: validatePassword(password), confirm: validateConfirm(password, confirm) };
    setErrors(e);
    if (e.code || e.password || e.confirm) return;
    setBusy(true);
    try {
      await reset(phone, code, password);
      onDone();
    } catch (x) {
      setErrors({ form: x.code || 'UNKNOWN' });
      setBusy(false);
    }
  };

  const err = (k) => (errors[k] ? t(errors[k]) : '');
  const formError = !!errors.form && <Text style={[styles.error, { color: colors.error }]}>{errorMessage(t, errors.form)}</Text>;
  const eye = (
    <Pressable onPress={() => setShow((s) => !s)} hitSlop={12} accessibilityRole="button" accessibilityLabel={show ? t('hidePassword') : t('showPassword')}>
      {show ? <EyeOffIcon color={colors.textMuted} /> : <EyeIcon color={colors.textMuted} />}
    </Pressable>
  );

  if (step === 1) {
    return (
      <FormScreen title={t('forgotTitle')} subtitle={t('forgotSub')} onBack={onBack}>
        <Field label={t('phone')} icon={<PhoneIcon size={20} color={colors.textMuted} />} prefix="+255" value={phone}
          onChangeText={(x) => { setPhone(onlyDigits(x)); setErrors({}); }} placeholder="795259567" keyboardType="number-pad" maxLength={9}
          autoComplete="tel" onSubmitEditing={sendCode} error={err('phone')} />
        {formError}
        <Button title={busy ? t('pleaseWait') : t('forgotSend')} onPress={sendCode} loading={busy} style={{ marginTop: 20 }} />
      </FormScreen>
    );
  }

  return (
    <FormScreen title={t('resetTitle')} subtitle={`${t('resetSub')} +255 ${phone}`} onBack={() => { setStep(1); setErrors({}); }}>
      <Field label={t('codeLabel')} value={code} onChangeText={(x) => { setCode(onlyCodeDigits(x)); setErrors((s) => ({ ...s, code: '', form: '' })); }}
        placeholder="123456" keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" error={err('code')} />
      <Field label={t('newPassword')} icon={<LockIcon size={20} color={colors.textMuted} />} right={eye} value={password}
        onChangeText={(x) => { setPassword(x); setErrors((s) => ({ ...s, password: '', form: '' })); }} placeholder="••••••" secureTextEntry={!show}
        autoCapitalize="none" autoCorrect={false} autoComplete="new-password" error={err('password')} />
      <Field label={t('confirmPassword')} icon={<LockIcon size={20} color={colors.textMuted} />} value={confirm}
        onChangeText={(x) => { setConfirm(x); setErrors((s) => ({ ...s, confirm: '', form: '' })); }} placeholder="••••••" secureTextEntry={!show}
        autoCapitalize="none" autoCorrect={false} autoComplete="new-password" onSubmitEditing={save} error={err('confirm')} />
      {formError}
      <Button title={busy ? t('pleaseWait') : t('resetSave')} onPress={save} loading={busy} style={{ marginTop: 20 }} />
      <View style={{ alignItems: 'center' }}>
        <Button title={wait > 0 ? `${t('resendIn')} ${wait}s` : t('resendCode')} variant="link" onPress={resend} disabled={wait > 0 || busy} />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  error: { fontSize: 14, textAlign: 'center', marginTop: 16 },
});
