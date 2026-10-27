import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import ScreenHeader from './ScreenHeader';
import SettingsBar from './SettingsBar';


// Page for the registration steps. Same layout as the login screen:
// language/theme bar (or a back arrow), 4-step bar, title, then the form.
//   step: 1..4   onBack: shows a back arrow instead of the settings bar
export default function FormScreen({ step, steps = 4, title, subtitle, onBack, children }) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior="padding">
      {onBack ? <ScreenHeader title="" onBack={onBack} /> : null}
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: onBack ? 4 : insets.top + 12,
            paddingBottom: insets.bottom + 32,
            paddingLeft: insets.left + 24,
            paddingRight: insets.right + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {!onBack ? <SettingsBar /> : null}

        {step ? (
          <View style={styles.steps}>
            <View style={styles.bar}>
              {Array.from({ length: steps }, (_, i) => (
                <View
                  key={i}
                  style={[styles.seg, { backgroundColor: i < step ? colors.primary : colors.border }]}
                />
              ))}
            </View>
            <Text style={[styles.stepText, { color: colors.textMuted }]}>
              {`${t('step')} ${step} ${t('stepOf')} ${steps}`}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}

        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1 },
  steps: { marginTop: 22 },
  bar: { flexDirection: 'row', gap: 6 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
  stepText: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  title: { fontSize: 26, fontWeight: '700', marginTop: 18 },
  subtitle: { fontSize: 15, marginTop: 6, marginBottom: 6 },
});
