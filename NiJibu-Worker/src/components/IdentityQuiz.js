import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { acceptNida, checkIdentity } from '../api/provider';
import { TEST_MODE } from '../config';
import { useSettings } from '../context/SettingsContext';
import { MAX_HITS, pickQuestion, toAnswer, validateInput } from '../signup/questions';
import { errorMessage } from '../utils/errors';
import { formatDob, formatNida, onlyDobDigits, onlyNidaDigits, validateNamePart, validateNida } from '../utils/validation';
import Button from './Button';
import Field from './Field';
import { CloseIcon } from './Icons';

// The NIDA check, on ONE screen. NIDA gets everything in one hit: NIDA number + names + phone + the answer to ONE question.
// The names and phone come from the sign-up (shown here); the NIDA number and the answer are typed here.
//   Right  -> done (only 1 test).
//   Wrong  -> we say what to correct, and ask ONE different question (the only other hit).
//   NIDA has another number for this person -> the worker can accept it (no new hit).
//   Still wrong -> failed. A new try needs a new payment.
// Props: details { nidaNumber, firstName, middleName, lastName, phone }, feeId (the paid try)
//        onPass(details) with the final names and NIDA number   onExit(): after a failure
export default function IdentityQuiz({ details, feeId, onPass, onExit }) {
  const { colors, t } = useSettings();
  const [v, setV] = useState({ firstName: details.firstName || '', middleName: details.middleName || '', lastName: details.lastName || '' });
  const [nida, setNida] = useState(details.nidaNumber || '');
  const [asked, setAsked] = useState([]);
  const [q, setQ] = useState(() => pickQuestion([]));
  const [value, setValue] = useState('');
  const [hitsLeft, setHitsLeft] = useState(MAX_HITS);
  const [wrong, setWrong] = useState([]); // parts NIDA said are wrong: name | nida | phone | answer
  const [errors, setErrors] = useState({}); // translation keys
  const [phase, setPhase] = useState('form'); // form | differs | failed
  const [offered, setOffered] = useState('');
  const [busy, setBusy] = useState(false);

  const attempt = MAX_HITS - hitsLeft + 1;
  const err = (k) => (errors[k] ? errorMessage(t, errors[k]) : '');
  const set = (k, x) => { setV((s) => ({ ...s, [k]: x })); setErrors((e) => ({ ...e, [k]: '', form: '' })); };
  const final = (number) => onPass({ nidaNumber: number, firstName: v.firstName.trim(), middleName: v.middleName.trim(), lastName: v.lastName.trim() });

  // What the server said after a hit or after "no, I will correct it"
  const handle = (r, nextAsked) => {
    if (r.result === 'passed') return final(r.nida_number);
    setHitsLeft(r.hits_left ?? 0);
    if (r.result === 'failed') return setPhase('failed');
    if (r.result === 'number_differs') { setOffered(r.nida_number); return setPhase('differs'); }
    // retry: show what to correct and ask a different question
    setWrong(r.wrong || []);
    setQ(pickQuestion(nextAsked));
    setValue('');
    setPhase('form');
  };

  const submit = async () => {
    if (busy) return;
    const e = {
      firstName: validateNamePart(v.firstName),
      middleName: validateNamePart(v.middleName, true),
      lastName: validateNamePart(v.lastName),
      nida: validateNida(nida),
      answer: validateInput(q, value), // a badly typed answer does not use the hit
    };
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    try {
      const nextAsked = [...asked, q.id];
      const r = await checkIdentity({
        feeId, phone: details.phone, nidaNumber: nida, firstName: v.firstName.trim(), middleName: v.middleName.trim(),
        lastName: v.lastName.trim(), questionId: q.id, answer: toAnswer(q, value),
      });
      setAsked(nextAsked);
      handle(r, nextAsked);
    } catch (x) {
      setErrors({ form: x.code || 'UNKNOWN' });
    } finally {
      setBusy(false);
    }
  };

  const answerOffer = async (accept) => {
    if (busy) return;
    setBusy(true);
    setErrors({});
    try {
      const r = await acceptNida({ feeId, phone: details.phone, accept });
      if (accept) setNida(r.nida_number);
      handle(r, asked);
    } catch (x) {
      setErrors({ form: x.code || 'UNKNOWN' });
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'failed') {
    return (
      <View style={styles.center}>
        <Text style={[styles.failTitle, { color: colors.error }]}>{t('quizFailedTitle')}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('quizFailedBody')}</Text>
        <Button title={t('quizExit')} onPress={onExit} style={{ marginTop: 24, alignSelf: 'stretch' }} />
      </View>
    );
  }

  if (phase === 'differs') {
    return (
      <View>
        <Text style={[styles.failTitle, { color: colors.text, textAlign: 'left', marginTop: 18 }]}>{t('quizDiffersTitle')}</Text>
        <Text style={[styles.body, { color: colors.textMuted, textAlign: 'left' }]}>{t('quizDiffersBody')}</Text>
        <View style={[styles.result, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
          <Text style={[styles.number, { color: colors.text }]}>{formatNida(offered)}</Text>
        </View>
        <Text style={[styles.body, { color: colors.text, textAlign: 'left' }]}>{t('quizDiffersAsk')}</Text>
        {!!errors.form && <Text style={[styles.error, { color: colors.error }]}>{errorMessage(t, errors.form)}</Text>}
        <Button title={busy ? t('pleaseWait') : t('quizAccept')} onPress={() => answerOffer(true)} loading={busy} style={{ marginTop: 16 }} />
        <Button title={t('quizCorrect')} variant="secondary" onPress={() => answerOffer(false)} disabled={busy} style={{ marginTop: 10 }} />
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.count, { color: colors.primary }]}>{t('quizTry').replace('{n}', attempt).replace('{max}', MAX_HITS)}</Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>{t('quizOneRule')}</Text>

      {wrong.length > 0 && (
        <View style={[styles.result, { borderColor: colors.error, backgroundColor: colors.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CloseIcon size={22} color={colors.error} strokeWidth={2.6} />
            <Text style={[styles.resultTitle, { color: colors.error }]}>{t('quizFixTitle')}</Text>
          </View>
          {wrong.map((w) => (
            <Text key={w} style={[styles.resultLine, { color: colors.text }]}>{`• ${t(`quizFix_${w}`)}`}</Text>
          ))}
          <Text style={[styles.resultLine, { color: colors.textMuted }]}>{t('quizLastChance')}</Text>
        </View>
      )}

      {wrong.includes('name') ? (
        <>
          <Field label={t('firstName')} value={v.firstName} onChangeText={(x) => set('firstName', x)} autoCapitalize="words" error={err('firstName')} />
          <Field label={t('middleName')} value={v.middleName} onChangeText={(x) => set('middleName', x)} autoCapitalize="words" error={err('middleName')} />
          <Field label={t('lastName')} value={v.lastName} onChangeText={(x) => set('lastName', x)} autoCapitalize="words" error={err('lastName')} />
        </>
      ) : (
        <View style={styles.names}>
          <Text style={[styles.namesLabel, { color: colors.textMuted }]}>{t('quizNames')}</Text>
          <Text style={[styles.namesValue, { color: colors.text }]}>{[v.firstName, v.middleName, v.lastName].filter(Boolean).join(' ')}</Text>
        </View>
      )}
      <Field label={t('nidaNumber')} value={formatNida(nida)} onChangeText={(x) => { setNida(onlyNidaDigits(x)); setErrors((s) => ({ ...s, nida: '', form: '' })); }}
        placeholder="19900101-12345-12345-12" keyboardType="number-pad" maxLength={23} error={err('nida')} />

      <Field
        key={q.id}
        label={t(q.label)}
        value={q.type === 'date' ? formatDob(value) : value}
        onChangeText={(x) => { setValue(q.type === 'date' ? onlyDobDigits(x) : x); setErrors((s) => ({ ...s, answer: '', form: '' })); }}
        placeholder={q.type === 'date' ? '25/12/1995' : ''}
        keyboardType={q.type === 'date' ? 'number-pad' : 'default'}
        maxLength={q.type === 'date' ? 10 : 60}
        autoCapitalize={q.type === 'name' ? 'words' : 'none'}
        onSubmitEditing={submit}
        error={err('answer')}
      />

      {!!errors.form && <Text style={[styles.error, { color: colors.error }]}>{errorMessage(t, errors.form)}</Text>}
      <Button title={busy ? t('nidaChecking') : t('quizSend')} onPress={submit} loading={busy} style={{ marginTop: 20 }} />

      {TEST_MODE && (
        <View style={[styles.demo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.demoText, { color: colors.textMuted }]}>{t('quizDemo')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  names: { marginTop: 14 },
  namesLabel: { fontSize: 13, fontWeight: '600' },
  namesValue: { fontSize: 17, fontWeight: '700', marginTop: 2 },
  count: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 18 },
  hint: { fontSize: 13, marginTop: 4, marginBottom: 6 },
  result: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14, marginBottom: 6 },
  resultTitle: { fontSize: 17, fontWeight: '800' },
  resultLine: { fontSize: 14, marginTop: 4 },
  number: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  error: { fontSize: 14, textAlign: 'center', marginTop: 14 },
  demo: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 20 },
  demoText: { fontSize: 13 },
  center: { alignItems: 'center', marginTop: 28 },
  failTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, textAlign: 'center', marginTop: 10 },
});
