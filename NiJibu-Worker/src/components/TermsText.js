import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { getTerms } from '../api/auth';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../utils/errors';
import Button from './Button';

// The Terms and Conditions, in the app language. The text comes from the server (one source for both apps).
//   onLoaded(version): called when the text is shown (the app needs the version to say "I agree")
export default function TermsText({ onLoaded }) {
  const { colors, t, lang } = useSettings();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    getTerms()
      .then((d) => { setData(d); onLoaded?.(d.version); })
      .catch((e) => setError(e.code || 'UNKNOWN'));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.error, textAlign: 'center' }}>{errorMessage(t, error)}</Text>
        <Button title={t('refresh')} onPress={load} />
      </View>
    );
  }
  if (!data) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  const doc = data[lang] || data.en;
  return (
    <View>
      <Text style={[styles.title, { color: colors.text }]}>{doc.title}</Text>
      {doc.sections.map((s, i) => (
        <View key={i} style={{ marginTop: 16 }}>
          <Text style={[styles.h, { color: colors.text }]}>{`${i + 1}. ${s.h}`}</Text>
          <Text style={[styles.p, { color: colors.textMuted }]}>{s.p}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 32 },
  title: { fontSize: 22, fontWeight: '800' },
  h: { fontSize: 16, fontWeight: '700' },
  p: { fontSize: 15, lineHeight: 22, marginTop: 4 },
});
