import FeeStep from '../components/FeeStep';
import FormScreen from '../components/FormScreen';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useProvider } from '../context/ProviderContext';
import { useSettings } from '../context/SettingsContext';

// Step 3 of the sign-up: the phone code is done, now the worker pays the one-time fee (1,000 TSh).
// When it is paid the server opens the worker account; we reload the profile and the app moves on.
export default function RegistrationFeeScreen() {
  const { t } = useSettings();
  const { logout } = useAuth();
  const { refresh } = useProvider();

  return (
    <FormScreen step={3} steps={3} title={t('feeTitle')} subtitle={t('feeSub')}>
      <FeeStep onPaid={refresh} />
      <Button title={t('logout')} variant="link" onPress={logout} />
    </FormScreen>
  );
}
