import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import TermsText from '../components/TermsText';
import { useSettings } from '../context/SettingsContext';

// Read the Terms and Conditions again (from the Account page)
export default function TermsViewScreen({ onBack }) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={t('termsLink')} onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <TermsText />
      </ScrollView>
    </View>
  );
}
