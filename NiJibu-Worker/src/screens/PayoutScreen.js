import { useState } from 'react';
import { Text } from 'react-native';
import Button from '../components/Button';
import Field from '../components/Field';
import FormScreen from '../components/FormScreen';
import { PhoneIcon } from '../components/Icons';
import Select from '../components/Select';
import { useProvider } from '../context/ProviderContext';
import { useSettings } from '../context/SettingsContext';
import { NETWORKS } from '../data/options';
import { errorMessage } from '../utils/errors';
import { onlyDigits, validatePhone, validateRequired } from '../utils/validation';

// Step 4 of 4: mobile money. Optional.
// onDone: called after saving or skipping
export default function PayoutScreen({ onDone, onBack }) {
  const { colors, t } = useSettings();
  const { savePayout } = useProvider();

  const [network, setNetwork] = useState('');
  const [number, setNumber] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    const next = { network: validateRequired(network), number: validatePhone(number) };
    setErrors(next);
    if (next.network || next.number) return;

    setLoading(true);
    try {
      await savePayout({ network, number });
      onDone();
    } catch (e) {
      setErrors({ form: e.code || 'UNKNOWN' });
      setLoading(false);
    }
  };

  return (
    <FormScreen title={t('payoutTitle')} subtitle={t('payoutSubtitle')} onBack={onBack}>
      <Select
        label={t('network')}
        choices={NETWORKS.map((n) => ({ value: n.value, label: n.name }))}
        value={network}
        onChange={(v) => {
          setNetwork(v);
          setErrors((e) => ({ ...e, network: '' }));
        }}
        error={errors.network ? t(errors.network) : ''}
      />

      <Field
        label={t('payoutNumber')}
        icon={<PhoneIcon size={20} color={colors.textMuted} />}
        prefix="+255"
        value={number}
        onChangeText={(v) => {
          setNumber(onlyDigits(v));
          setErrors((e) => ({ ...e, number: '' }));
        }}
        placeholder="795259567"
        keyboardType="number-pad"
        maxLength={9}
        error={errors.number ? t(errors.number) : ''}
      />

      {!!errors.form && (
        <Text style={{ color: colors.error, fontSize: 14, textAlign: 'center', marginTop: 16 }}>
          {errorMessage(t, errors.form)}
        </Text>
      )}

      <Button title={loading ? t('pleaseWait') : t('save')} onPress={submit} loading={loading} style={{ marginTop: 24 }} />
      <Button title={t('skip')} variant="link" onPress={onDone} />
    </FormScreen>
  );
}
