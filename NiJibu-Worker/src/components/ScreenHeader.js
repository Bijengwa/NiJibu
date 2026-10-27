import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import { ChevronLeftIcon } from './Icons';

// Top bar for inner screens (back arrow + title), safe-area aware.
export default function ScreenHeader({ title, onBack }) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8, paddingLeft: insets.left + 8, paddingRight: insets.right + 20 }]}>
      <Pressable onPress={onBack} style={styles.back} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('back')}>
        <ChevronLeftIcon size={26} color={colors.text} />
      </Pressable>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginLeft: 4, flex: 1 },
});
