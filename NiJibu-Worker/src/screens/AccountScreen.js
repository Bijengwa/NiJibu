import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOutIcon, MailIcon, PhoneIcon, SettingsIcon, ShieldCheckIcon, UserIcon } from '../components/Icons';
import Row from '../components/Row';
import SettingsBar from '../components/SettingsBar';
import { useAuth } from '../context/AuthContext';
import { useProvider } from '../context/ProviderContext';
import { useSettings } from '../context/SettingsContext';
import { SERVICES } from '../data/services';

// Profile of the verified fundi, payout and log out
export default function AccountScreen({ onPayout }) {
  const { colors, t } = useSettings();
  const { user, logout } = useAuth();
  const { provider } = useProvider();
  const insets = useSafeAreaInsets();

  const name = provider.full_name || `+${user.phone}`;
  const services = SERVICES.filter((s) => provider.services?.includes(s.key))
    .map((s) => `${s.emoji} ${t(s.name)}`)
    .join('   ');

  const confirmLogout = () =>
    Alert.alert(t('logoutConfirmTitle'), t('logoutConfirmBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: logout },
    ]);

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

      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 16 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{name}</Text>
          {provider.status === 'verified' && (
            <View style={styles.verified}>
              <ShieldCheckIcon size={16} color={colors.success} />
              <Text style={[styles.verifiedText, { color: colors.success }]}>{t('verifiedFundi')}</Text>
            </View>
          )}
        </View>
        <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
          <Text style={{ color: colors.primary, fontSize: 30, fontWeight: '800' }}>{name.charAt(0).toUpperCase()}</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Row icon={(c) => <PhoneIcon size={22} color={c} />} label={t('phone')} value={`+${user.phone}`} />
        <Row icon={(c) => <MailIcon size={22} color={c} />} label={t('email')} value={provider.email || user.email || t('payoutNotSet')} />
        <Row
          icon={(c) => <ShieldCheckIcon size={22} color={c} />}
          label={t('nidaName')}
          value={provider.nida_name || '-'}
        />
        <Row icon={(c) => <UserIcon size={22} color={c} />} label={t('servicesLabel')} value={services} last />
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, marginTop: 16 }]}>
        <Row
          icon={(c) => <SettingsIcon size={22} color={c} />}
          label={t('payoutDetails')}
          value={provider.payout_set ? t('payoutSet') : t('payoutNotSet')}
          chevron
          onPress={onPayout}
        />
        <Row icon={(c) => <LogOutIcon size={22} color={c} />} label={t('logout')} danger last onPress={confirmLogout} />
      </View>

      <View style={{ marginTop: 20 }}>
        <SettingsBar />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '800' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 20 },
  name: { fontSize: 24, fontWeight: '800' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  verifiedText: { fontSize: 14, fontWeight: '700' },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 16, overflow: 'hidden' },
});
