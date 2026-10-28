import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import Field from '../components/Field';
import FormScreen from '../components/FormScreen';
import { ShieldCheckIcon } from '../components/Icons';
import IdentityQuiz from '../components/IdentityQuiz';
import PhotoField from '../components/PhotoField';
import { useProvider } from '../context/ProviderContext';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../utils/errors';
import { formatNida, onlyNidaDigits, validateNida } from '../utils/validation';

// Used when a fundi has to verify again (for example after a rejection).
//   Main way : NIDA number -> NIDA questions
//   Backup   : NIDA number + selfie + photo of the ID card (an admin checks it)
// onBack: back | onDone: called with the saved provider
export default function NidaScreen({ onBack, onDone }) {
  const { colors, t } = useSettings();
  const { verifyNidaQuestions, submitNida } = useProvider();

  const [mode, setMode] = useState('number'); // 'number' | 'quiz' | 'linking' | 'photos'
  const [nida, setNida] = useState(''); // digits only
  const [selfie, setSelfie] = useState(null);
  const [idPhoto, setIdPhoto] = useState(null);
  const [errors, setErrors] = useState({}); // values are translation keys
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const nidaField = (
    <Field
      label={t('nidaNumber')}
      icon={<ShieldCheckIcon size={20} color={colors.textMuted} />}
      value={formatNida(nida)}
      onChangeText={(v) => {
        setNida(onlyNidaDigits(v));
        setErrors((e) => ({ ...e, nida: '' }));
      }}
      placeholder="19900101-12345-12345-12"
      keyboardType="number-pad"
      maxLength={23}
      error={errors.nida ? t(errors.nida) : ''}
    />
  );

  const formError = !!errors.form && (
    <Text style={[styles.formError, { color: colors.error }]}>{errorMessage(t, errors.form)}</Text>
  );

  const toQuiz = () => {
    const bad = validateNida(nida);
    setErrors({ nida: bad });
    if (!bad) setMode('quiz');
  };

  // The questions are passed: link the checked NIDA number to this account
  const link = async () => {
    setMode('linking');
    setErrors({});
    setLoading(true);
    try {
      onDone(await verifyNidaQuestions({ nidaNumber: nida }));
    } catch (e) {
      setErrors({ form: e.code || 'UNKNOWN' });
      setLoading(false);
    }
  };

  const submitPhotos = async () => {
    if (loading) return;
    const next = {
      nida: validateNida(nida),
      selfie: selfie ? '' : 'photoRequired',
      idPhoto: idPhoto ? '' : 'photoRequired',
    };
    setErrors(next);
    if (next.nida || next.selfie || next.idPhoto) return;
    setLoading(true);
    try {
      onDone(await submitNida({ nidaNumber: nida, selfie, idPhoto }));
    } catch (e) {
      setErrors({ form: e.code || 'UNKNOWN' });
      setLoading(false);
    }
  };

  if (mode === 'photos') {
    return (
      <FormScreen title={t('nidaTitle')} subtitle={t('nidaSubtitle')} onBack={onBack}>
        {nidaField}
        <PhotoField label={t('selfie')} help={t('selfieHelp')} camera="front" asset={selfie}
          onChange={(a) => { setSelfie(a); setErrors((e) => ({ ...e, selfie: '' })); }} error={errors.selfie ? t(errors.selfie) : ''} />
        <PhotoField label={t('idPhoto')} help={t('idHelp')} camera="back" asset={idPhoto}
          onChange={(a) => { setIdPhoto(a); setErrors((e) => ({ ...e, idPhoto: '' })); }} error={errors.idPhoto ? t(errors.idPhoto) : ''} />
        <Text style={[styles.note, { color: colors.textMuted }]}>{t('nidaPrivacy')}</Text>
        {formError}
        <Button title={loading ? t('pleaseWait') : t('submit')} onPress={submitPhotos} loading={loading} style={{ marginTop: 20 }} />
        <Button title={t('useQuestions')} variant="link" onPress={() => { setMode('number'); setErrors({}); }} />
      </FormScreen>
    );
  }

  if (mode === 'quiz') {
    return (
      <FormScreen title={t('quizTitle')} subtitle={t('quizSub')}>
        <IdentityQuiz nidaNumber={nida} onPass={link} onExit={onBack} />
      </FormScreen>
    );
  }

  if (mode === 'linking') {
    return (
      <FormScreen title={t('quizTitle')} subtitle={t('nidaChecking')} onBack={loading ? undefined : () => { setMode('number'); setErrors({}); }}>
        <View style={styles.center}>{loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}</View>
        {formError}
        {!loading && !!errors.form && <Button title={t('tryAgain')} onPress={link} style={{ marginTop: 20 }} />}
      </FormScreen>
    );
  }

  return (
    <FormScreen title={t('nidaVerifyTitle')} subtitle={t('nidaNumberSub')} onBack={onBack}>
      {nidaField}
      <Button title={t('continue')} onPress={toQuiz} style={{ marginTop: 20 }} />
      <Button title={t('usePhotos')} variant="link" onPress={() => { setMode('photos'); setErrors({}); }} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginTop: 28 },
  formError: { fontSize: 14, textAlign: 'center', marginTop: 16 },
  note: { fontSize: 13, marginTop: 18 },
});
