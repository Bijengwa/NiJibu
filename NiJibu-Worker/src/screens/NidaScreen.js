import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import FormScreen from '../components/FormScreen';
import FeeStep from '../components/FeeStep';
import IdentityQuiz from '../components/IdentityQuiz';
import { useAuth } from '../context/AuthContext';
import { useProvider } from '../context/ProviderContext';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../utils/errors';

// Used when a fundi has to verify again (for example after a rejection).
//   1 registration fee (every try is paid again, no refund)
//   2 NIDA check: the NIDA number + one question (names and phone are sent with it, in ONE hit)
//   Only NIDA is used to verify (no photos).
// onBack: back | onDone: called with the saved provider
export default function NidaScreen({ onBack, onDone }) {
  const { colors, t } = useSettings();
  const { user } = useAuth();
  const { provider, verifyNidaQuestions } = useProvider();

  const [mode, setMode] = useState('fee'); // 'fee' | 'quiz' | 'linking'
  const [feeId, setFeeId] = useState(null);
  const [passed, setPassed] = useState(null); // what passed NIDA: { nidaNumber, firstName, middleName, lastName }
  const [nida, setNida] = useState(''); // digits only
  const [errors, setErrors] = useState({}); // values are translation keys
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const formError = !!errors.form && (
    <Text style={[styles.formError, { color: colors.error }]}>{errorMessage(t, errors.form)}</Text>
  );

  // The questions are passed: link the checked NIDA number to this account
  const link = async (d = passed) => {
    setMode('linking');
    setErrors({});
    setLoading(true);
    try {
      onDone(await verifyNidaQuestions(d));
    } catch (e) {
      setErrors({ form: e.code || 'UNKNOWN' });
      setLoading(false);
    }
  };

  if (mode === 'fee') {
    return (
      <FormScreen title={t('feeTitle')} subtitle={t('feeSub')} onBack={onBack}>
        <FeeStep phone={user?.phone} onPaid={(id) => { setFeeId(id); setMode('quiz'); }} />
      </FormScreen>
    );
  }

  if (mode === 'quiz') {
    return (
      <FormScreen title={t('quizTitle')} subtitle={t('quizSub')}>
        <IdentityQuiz
          feeId={feeId}
          details={{ nidaNumber: nida, ...namesOf(provider?.full_name), phone: user?.phone }}
          onPass={(d) => { setPassed(d); setNida(d.nidaNumber); link(d); }}
          onExit={() => { setFeeId(null); setMode('fee'); setErrors({}); }}
        />
      </FormScreen>
    );
  }

  if (mode === 'linking') {
    return (
      <FormScreen title={t('quizTitle')} subtitle={t('nidaChecking')} onBack={loading ? undefined : () => { setMode('quiz'); setErrors({}); }}>
        <View style={styles.center}>{loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}</View>
        {formError}
        {!loading && !!errors.form && <Button title={t('tryAgain')} onPress={() => link()} style={{ marginTop: 20 }} />}
      </FormScreen>
    );
  }
}

// "Asha M Juma" -> { firstName: 'Asha', middleName: 'M', lastName: 'Juma' }
function namesOf(full) {
  const [firstName = '', ...rest] = String(full || '').trim().split(/\s+/);
  const lastName = rest.pop() || '';
  return { firstName, middleName: rest.join(' '), lastName };
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginTop: 28 },
  formError: { fontSize: 14, textAlign: 'center', marginTop: 16 },
});
