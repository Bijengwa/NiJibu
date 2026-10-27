import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { ReceiptIcon } from '../components/Icons';
import { useSettings } from '../context/SettingsContext';

export default function ActivityScreen() {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 20 }}>
      <Text style={[styles.title, { color: colors.text, marginLeft: insets.left + 20 }]}>{t('tabActivity')}</Text>
      <EmptyState
        icon={(c) => <ReceiptIcon size={36} color={c} />}
        title={t('activityEmptyTitle')}
        body={t('activityEmptyBody')}
      />
    </View>
  );
}

const styles = StyleSheet.create({ title: { fontSize: 32, fontWeight: '800' } });
