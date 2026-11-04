import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { acceptTerms } from '../api/auth';
import Button from '../components/Button';
import FormScreen from '../components/FormScreen';
import TermsText from '../components/TermsText';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../utils/errors';

// Shown after login when the person has not agreed to the CURRENT Terms and Conditions
// (accounts made before the terms existed, or after the terms changed). They cannot use the app until they agree.
export default function TermsGateScreen() {
  const { colors, t } = useSettings();
  const { token, updateUser, logout } = useAuth();
  const [version, setVersion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const agree = async () => {
    if (busy || !version) return;
    setBusy(true);
    setError('');
    try {
      const r = await acceptTerms(token, version);
      updateUser(r.user); // the app opens
    } catch (e) {
      setError(e.code || 'UNKNOWN');
      setBusy(false);
    }
  };

  return (
    <FormScreen title={t('termsGateTitle')} subtitle={t('termsGateSub')}>
      <TermsText onLoaded={setVersion} />
      {!!error && <Text style={[styles.error, { color: colors.error }]}>{errorMessage(t, error)}</Text>}
      <Button title={busy ? t('pleaseWait') : t('termsAgreeButton')} onPress={agree} loading={busy} disabled={!version} style={{ marginTop: 24 }} />
      <Button title={t('logout')} variant="link" onPress={logout} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  error: { fontSize: 14, textAlign: 'center', marginTop: 16 },
});
