import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { checkAnswer } from '../api/provider';
import { TEST_MODE } from '../config';
import { useSettings } from '../context/SettingsContext';
import { TZ_REGIONS } from '../data/regions';
import { advance, MAX, NEED, pickQuestions, toAnswer, validateInput } from '../signup/questions';
import { errorMessage } from '../utils/errors';
import { formatDob, onlyDobDigits } from '../utils/validation';
import Button from './Button';
import { CheckIcon, CloseIcon } from './Icons';
import Field from './Field';
import Select from './Select';

// The NIDA questions, one at a time, on one screen:
//   type the answer -> [Answer] -> the question stays, the result (right / wrong, questions left) shows under it
//   -> [Next question].
// The fundi passes with NEED correct answers in a row, and can try at most MAX questions.
//   nidaNumber: digits    onPass(): all good    onExit(): after a failure
export default function IdentityQuiz({ nidaNumber, onPass, onExit }) {
  const { colors, t } = useSettings();
  const questions = useMemo(pickQuestions, []);
  const [state, setState] = useState({ streak: 0, asked: 0, result: null });
  const [value, setValue] = useState('');
  const [error, setError] = useState(''); // translation key
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState(null); // after an answer: { correct, next } until the fundi taps Next

  const q = questions[state.asked];

  const submit = async () => {
    if (busy || fb) return;
    const bad = validateInput(q, value);
    setError(bad);
    if (bad) return; // a badly typed answer does not use a try
    setBusy(true);
    try {
      const { correct } = await checkAnswer({ nidaNumber, questionId: q.id, answer: toAnswer(q, value) });
      setFb({ correct, next: advance(state, correct) });
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    } finally {
      setBusy(false);
    }
  };

  // After the result: next question, or finish
  const proceed = () => {
    if (!fb) return;
    const { next } = fb;
    setFb(null);
    setValue('');
    setError('');
    setState(next);
    if (next.result === 'pass') onPass();
  };

  const change = (v) => {
    if (fb) return;
    setValue(q.type === 'date' ? onlyDobDigits(v) : q.type === 'year' ? v.replace(/\D/g, '').slice(0, 4) : v);
    setError('');
  };

  if (state.result === 'fail') {
    return (
      <View style={styles.fail}>
        <Text style={[styles.failTitle, { color: colors.error }]}>{t('quizFailedTitle')}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('quizFailedBody')}</Text>
        <Button title={t('quizExit')} onPress={onExit} style={{ marginTop: 24 }} />
      </View>
    );
  }

  const err = error ? errorMessage(t, error) : '';
  const color = fb ? (fb.correct ? colors.success : colors.error) : colors.border;
  const end = fb?.next.result; // 'pass' | 'fail' | null
  const buttonTitle = busy ? t('pleaseWait') : !fb ? t('quizCheck') : end === 'pass' ? t('continue') : end === 'fail' ? t('quizExit') : t('quizNext');

  return (
    <View>
      <Text style={[styles.count, { color: colors.primary }]}>
        {t('quizQuestion')} {state.asked + 1} {t('quizOf')} {MAX}
      </Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>{t('quizRule').replace('{n}', NEED)}</Text>

      {q.type === 'region' ? (
        <Select key={q.id} label={t(q.label)} choices={TZ_REGIONS.map((r) => ({ value: r, label: r }))} value={value} onChange={change} error={err} disabled={!!fb} />
      ) : (
        <Field
          key={q.id}
          label={t(q.label)}
          value={q.type === 'date' ? formatDob(value) : value}
          onChangeText={change}
          editable={!fb}
          placeholder={q.type === 'date' ? '25/12/1995' : q.type === 'year' ? '2008' : ''}
          keyboardType={q.type === 'date' || q.type === 'year' ? 'number-pad' : 'default'}
          maxLength={q.type === 'date' ? 10 : q.type === 'year' ? 4 : 60}
          autoCapitalize={q.type === 'name' || q.type === 'text' ? 'words' : 'none'}
          onSubmitEditing={submit}
          error={err}
        />
      )}

      {/* The result, right under the question */}
      {fb && (
        <View style={[styles.result, { borderColor: color, backgroundColor: colors.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {fb.correct ? <CheckIcon size={22} color={color} strokeWidth={2.6} /> : <CloseIcon size={22} color={color} strokeWidth={2.6} />}
            <Text style={[styles.resultTitle, { color }]}>{t(fb.correct ? 'quizRight' : 'quizWrong')}</Text>
          </View>
          <Text style={[styles.resultLine, { color: colors.text }]}>
            {t('quizLeft')}: {MAX - fb.next.asked}
            {'   ·   '}
            {t('quizStreak').replace('{a}', fb.next.streak).replace('{n}', NEED)}
          </Text>
          {end ? (
            <Text style={[styles.resultLine, { color: end === 'pass' ? colors.success : colors.error, fontWeight: '700' }]}>
              {t(end === 'pass' ? 'quizPassed' : 'quizCannotPass')}
            </Text>
          ) : null}
        </View>
      )}

      <Button title={buttonTitle} onPress={fb ? proceed : submit} loading={busy} style={{ marginTop: 20 }} />

      {TEST_MODE && !fb && (
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
  result: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14 },
  resultTitle: { fontSize: 18, fontWeight: '800' },
  resultLine: { fontSize: 14, marginTop: 4 },
  demo: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 20 },
  demoText: { fontSize: 13 },
  fail: { alignItems: 'center', marginTop: 28 },
  failTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, textAlign: 'center', marginTop: 10 },
});
