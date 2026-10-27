import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { checkAnswer } from '../api/provider';
import { USE_MOCK_PROVIDER } from '../config';
import { useSettings } from '../context/SettingsContext';
import { TZ_REGIONS } from '../data/regions';
import { advance, MAX, NEED, pickQuestions, toAnswer, validateInput } from '../signup/questions';
import { errorMessage } from '../utils/errors';
import { formatDob, onlyDobDigits } from '../utils/validation';
import Button from './Button';
import Field from './Field';
import Select from './Select';

// The NIDA questions, one at a time. It does NOT say if an answer was right.
// The fundi passes with NEED correct answers in a row, and can try at most MAX questions.
//   nidaNumber: digits    onPass(): all good    onExit(): after a failure
export default function IdentityQuiz({ nidaNumber, onPass, onExit }) {
  const { colors, t } = useSettings();
  const questions = useMemo(pickQuestions, []);
  const [state, setState] = useState({ streak: 0, asked: 0, result: null });
  const [value, setValue] = useState('');
  const [error, setError] = useState(''); // translation key
  const [busy, setBusy] = useState(false);

  if (state.result === 'fail') {
    return (
      <View style={styles.fail}>
        <Text style={[styles.failTitle, { color: colors.error }]}>{t('quizFailedTitle')}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('quizFailedBody')}</Text>
        <Button title={t('quizExit')} onPress={onExit} style={{ marginTop: 24 }} />
      </View>
    );
  }

  const q = questions[state.asked];

  const submit = async () => {
    if (busy) return;
    const bad = validateInput(q, value);
    setError(bad);
    if (bad) return; // a badly typed answer does not use a try
    setBusy(true);
    try {
      const { correct } = await checkAnswer({ nidaNumber, questionId: q.id, answer: toAnswer(q, value) });
      const next = advance(state, correct);
      setValue('');
      setBusy(false);
      setState(next);
      if (next.result === 'pass') onPass();
    } catch (e) {
      setError(e.code || 'UNKNOWN');
      setBusy(false);
    }
  };

  const change = (v) => {
    setValue(q.type === 'date' ? onlyDobDigits(v) : q.type === 'year' ? v.replace(/\D/g, '').slice(0, 4) : v);
    setError('');
  };
  const err = error ? errorMessage(t, error) : '';

  return (
    <View>
      <Text style={[styles.count, { color: colors.primary }]}>
        {t('quizQuestion')} {state.asked + 1} {t('quizOf')} {MAX}
      </Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>{t('quizRule').replace('{n}', NEED)}</Text>

      {q.type === 'region' ? (
        <Select key={q.id} label={t(q.label)} choices={TZ_REGIONS.map((r) => ({ value: r, label: r }))} value={value} onChange={change} error={err} />
      ) : (
        <Field
          key={q.id}
          label={t(q.label)}
          value={q.type === 'date' ? formatDob(value) : value}
          onChangeText={change}
          placeholder={q.type === 'date' ? '25/12/1995' : q.type === 'year' ? '2008' : ''}
          keyboardType={q.type === 'date' || q.type === 'year' ? 'number-pad' : 'default'}
          maxLength={q.type === 'date' ? 10 : q.type === 'year' ? 4 : 60}
          autoCapitalize={q.type === 'name' || q.type === 'text' ? 'words' : 'none'}
          onSubmitEditing={submit}
          error={err}
        />
      )}

      <Button title={busy ? t('pleaseWait') : t('quizCheck')} onPress={submit} loading={busy} style={{ marginTop: 20 }} />

      {USE_MOCK_PROVIDER && (
        <View style={[styles.demo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.demoText, { color: colors.textMuted }]}>{t('quizDemo')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  count: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 18 },
  hint: { fontSize: 13, marginTop: 4, marginBottom: 6 },
  fail: { alignItems: 'center', marginTop: 28 },
  failTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, textAlign: 'center', marginTop: 10 },
  demo: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 24 },
  demoText: { fontSize: 13 },
});
