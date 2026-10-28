import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfirmModal from '../components/ConfirmModal';
import { EditIcon, LogOutIcon, MailIcon, PhoneIcon, ShieldCheckIcon, UserIcon, WalletIcon } from '../components/Icons';
import Row from '../components/Row';
import ServiceIcon from '../components/ServiceIcon';
import SettingsBar from '../components/SettingsBar';
import { useAuth } from '../context/AuthContext';
import { useProvider } from '../context/ProviderContext';
import { useServices } from '../context/ServicesContext';
import { useSettings } from '../context/SettingsContext';
import { AVAILABILITY, EXPERIENCE } from '../data/options';

// Profile of the verified fundi, payout and log out
export default function AccountScreen({ onPayout, onEditDetails }) {
  const { colors, t } = useSettings();
  const { user, logout } = useAuth();
  const { provider } = useProvider();
  const { services: allServices } = useServices();
  const insets = useSafeAreaInsets();
  const [askLogout, setAskLogout] = useState(false);

  const name = provider.full_name || `+${user.phone}`;

  const labelFor = (list, value) => {
    const item = list.find((x) => x.value === value);
    return item ? t(item.label) : '';
  };
  const detailLine = (d) => [labelFor(EXPERIENCE, d.experience), labelFor(AVAILABILITY, d.availability)].filter(Boolean).join('  ·  ');

  // Jobs from the list (with experience and availability), then the jobs typed by the fundi
  const jobs = [
    ...(provider.service_details || []).map((d) => {
      const s = allServices.find((x) => x.key === d.key);
      return { id: d.key, slug: d.key, name: s?.label || d.key, line: detailLine(d), waiting: false };
    }),
    ...(provider.other_jobs || [])
      .filter((o) => o.status === 'pending')
      .map((o) => ({ id: `x:${o.name}`, slug: null, name: o.name, line: detailLine(o), waiting: true })),
  ];

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
        <Row icon={(c) => <ShieldCheckIcon size={22} color={c} />} label={t('nidaName')} value={provider.nida_name || '-'} last />
      </View>

      {/* The jobs of this fundi */}
      <Text style={[styles.section, { color: colors.textMuted }]}>{t('servicesLabel')}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {jobs.length === 0 ? (
          <Text style={{ color: colors.textMuted, padding: 16, fontSize: 15 }}>-</Text>
        ) : (
          jobs.map((j, i) => (
            <View
              key={j.id}
              style={[styles.job, { borderBottomColor: colors.border, borderBottomWidth: i === jobs.length - 1 ? 0 : StyleSheet.hairlineWidth }]}
            >
              <View style={[styles.jobIcon, { backgroundColor: colors.background }]}>
                {j.slug ? <ServiceIcon slug={j.slug} size={22} color={colors.primary} /> : <EditIcon size={20} color={colors.primary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.jobName, { color: colors.text }]} numberOfLines={1}>{j.name}</Text>
                {!!j.line && <Text style={[styles.jobLine, { color: colors.textMuted }]} numberOfLines={1}>{j.line}</Text>}
              </View>
              {j.waiting && <Text style={[styles.jobWait, { color: colors.textMuted }]}>{t('jobWaiting')}</Text>}
            </View>
          ))
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, marginTop: 16 }]}>
        <Row icon={(c) => <UserIcon size={22} color={c} />} label={t('editDetails')} chevron onPress={onEditDetails} />
        <Row
          icon={(c) => <WalletIcon size={22} color={c} />}
          label={t('payoutDetails')}
          value={provider.payout_set ? t('payoutSet') : t('payoutNotSet')}
          chevron
          onPress={onPayout}
        />
        <Row icon={(c) => <LogOutIcon size={22} color={c} />} label={t('logout')} danger last onPress={() => setAskLogout(true)} />
      </View>

      <View style={{ marginTop: 20 }}>
        <SettingsBar />
      </View>

      <ConfirmModal
        visible={askLogout}
        danger
        Icon={LogOutIcon}
        title={t('logoutConfirmTitle')}
        body={t('logoutConfirmBody')}
        confirmLabel={t('logout')}
        cancelLabel={t('cancel')}
        onCancel={() => setAskLogout(false)}
        onConfirm={() => {
          setAskLogout(false);
          logout();
        }}
      />
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
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 20, marginBottom: 8, marginLeft: 4 },
  job: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  jobIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  jobName: { fontSize: 16, fontWeight: '700' },
  jobLine: { fontSize: 13, marginTop: 2 },
  jobWait: { fontSize: 12 },
});
