import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../components/Avatar';
import { ChevronRightIcon, SettingsIcon, ShieldCheckIcon, UserCircleIcon } from '../components/Icons';
import Row from '../components/Row';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

export default function AccountScreen({ onOpen }) {
  const { colors, t } = useSettings();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const displayName = user?.name || `+${user?.phone ?? ''}`;
  const incomplete = !user?.name || !user?.email;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingBottom: 24,
        paddingLeft: insets.left + 20,
        paddingRight: insets.right + 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.text }]}>{t('tabAccount')}</Text>

      <Pressable style={styles.header} onPress={() => onOpen('profile')} accessibilityRole="button">
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{displayName}</Text>
        <Avatar user={user} size={72} />
      </Pressable>

      {incomplete && (
        <Pressable
          onPress={() => onOpen('profile')}
          style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityRole="button"
        >
          <View style={[styles.bannerIcon, { backgroundColor: colors.primary }]}>
            <ShieldCheckIcon size={24} color={colors.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: colors.text }]}>{t('finishProfileTitle')}</Text>
            <Text style={[styles.bannerSub, { color: colors.primary }]}>{t('finishProfileSub')}</Text>
          </View>
          <ChevronRightIcon size={20} color={colors.textMuted} />
        </Pressable>
      )}

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Row icon={(c) => <UserCircleIcon size={24} color={c} />} label={t('profile')} chevron onPress={() => onOpen('profile')} />
        <Row icon={(c) => <SettingsIcon size={24} color={c} />} label={t('settings')} chevron last onPress={() => onOpen('settings')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '800' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 20 },
  name: { flex: 1, fontSize: 24, fontWeight: '800', marginRight: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 20 },
  bannerIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 16, fontWeight: '700' },
  bannerSub: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  card: { borderRadius: 16, overflow: 'hidden' },
});
