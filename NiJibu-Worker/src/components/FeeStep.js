import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { feeStatus, getFee, payFee } from '../api/provider';
import { TEST_MODE } from '../config';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../utils/errors';
import Button from './Button';
import { onlyDigits, validatePhone } from '../utils/validation';
import Field from './Field';
import { CheckIcon, PhoneIcon } from './Icons';

// The registration fee, paid before every identity check. No refund; coming back to verify = a new payment.
//   phone  : the worker's phone (9 digits or 255...). The payment prompt goes to this phone.
//   onPaid(feeId): the payment is done
// The worker types the number to pay from (not picked automatically). No network to choose: Selcom needs only the number and the amount.
// Demo mode (server PAYMENTS_MODE=mock): no real money. A phone ending 0000 is declined; ending 1111 waits ~8 seconds.
export default function FeeStep({ phone, onPaid }) {
  const { colors, t } = useSettings();
  const [amount, setAmount] = useState(1000);
  const [payNumber, setPayNumber] = useState(''); // typed by the worker: the money is taken from this number
  const [numError, setNumError] = useState('');
  const [state, setState] = useState('idle'); // idle | paying | waiting | paid | failed
  const [error, setError] = useState('');
  const timer = useRef(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    getFee().then((r) => alive.current && setAmount(r.amount)).catch(() => {});
    return () => {
      alive.current = false;
      clearInterval(timer.current);
    };
  }, []);

  const done = (fee) => {
    clearInterval(timer.current);
    if (!alive.current) return;
    if (fee.status === 'paid') {
      setState('paid');
      setTimeout(() => alive.current && onPaid(fee.id), 900); // a moment to see "Payment received"
    } else {
      setState('failed');
      setError('');
    }
  };

  // The worker approves on the phone: ask every 2.5 seconds
  const wait = (fee) => {
    setState('waiting');
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const { fee: f } = await feeStatus({ id: fee.id, phone });
        if (f.status !== 'pending') done(f);
      } catch {
        /* keep asking; a short network drop is fine */
      }
    }, 2500);
  };

  const pay = async () => {
    if (state === 'paying' || state === 'waiting') return;
    const bad = validatePhone(payNumber);
    setNumError(bad);
    if (bad) return;
    setError('');
    setState('paying');
    try {
      const { fee } = await payFee({ phone, payPhone: payNumber });
      if (fee.status === 'pending') wait(fee);
      else done(fee);
    } catch (e) {
      setState('idle');
      setError(e.code || 'UNKNOWN');
    }
  };

  const busy = state === 'paying' || state === 'waiting';

  return (
    <View>
      <Text style={[styles.amount, { color: colors.text }]}>{amount.toLocaleString('en-US')} TSh</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('feeBody')}</Text>

      <Field
        label={t('feePhone')}
        icon={<PhoneIcon size={20} color={colors.textMuted} />}
        prefix="+255"
        value={payNumber}
        onChangeText={(x) => { setPayNumber(onlyDigits(x)); setNumError(''); }}
        placeholder="795259567"
        keyboardType="number-pad"
        maxLength={9}
        editable={!busy && state !== 'paid'}
        error={numError ? t(numError) : ''}
      />
      <Text style={[styles.from, { color: colors.textMuted }]}>{t('feeFromHelp')}</Text>

      {state === 'waiting' && (
        <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.boxText, { color: colors.text }]}>{t('feeWaiting')}</Text>
        </View>
      )}
      {state === 'paid' && (
        <View style={[styles.box, { borderColor: colors.success, backgroundColor: colors.surface }]}>
          <CheckIcon size={22} color={colors.success} strokeWidth={2.6} />
          <Text style={[styles.boxText, { color: colors.success, fontWeight: '800' }]}>{t('feePaid')}</Text>
        </View>
      )}
      {state === 'failed' && <Text style={[styles.error, { color: colors.error }]}>{t('feeFailed')}</Text>}
      {!!error && <Text style={[styles.error, { color: colors.error }]}>{errorMessage(t, error)}</Text>}

      {state !== 'paid' && (
        <Button title={busy ? t('pleaseWait') : t('feePay').replace('{amount}', amount.toLocaleString('en-US'))} onPress={pay} loading={busy} style={{ marginTop: 20 }} />
      )}

      {TEST_MODE && state !== 'paid' && (
        <View style={[styles.demo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.demoText, { color: colors.textMuted }]}>{t('feeDemo')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { fontSize: 34, fontWeight: '800', marginTop: 18 },
  body: { fontSize: 14, marginTop: 6, marginBottom: 10 },
  from: { fontSize: 13, marginTop: -6 },
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 16 },
  boxText: { fontSize: 15, flex: 1 },
  error: { fontSize: 14, textAlign: 'center', marginTop: 14 },
  demo: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 20 },
  demoText: { fontSize: 13 },
});
