import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfirmModal from '../components/ConfirmModal';
import { BellIcon, LockIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, TrashIcon } from '../components/Icons';
import Row from '../components/Row';
import ScreenHeader from '../components/ScreenHeader';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const LANGS = [
  { key: 'en', label: 'English' },
  { key: 'sw', label: 'Kiswahili' },
];
const MODES = [
  { key: 'system', label: 'themeSystem', Icon: MonitorIcon },
  { key: 'light', label: 'themeLight', Icon: SunIcon },
  { key: 'dark', label: 'themeDark', Icon: MoonIcon },
];

function Section({ title, children }) {
  const { colors } = useSettings();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

export default function SettingsScreen({ onBack, onOpen }) {
  const { colors, t, lang, setLang, mode, setMode, notificationsEnabled, setNotificationsEnabled } = useSettings();
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [askLogout, setAskLogout] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={t('settings')} onBack={onBack} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left + 20,
          paddingRight: insets.right + 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Section title={t('language')}>
          {LANGS.map((l, i) => (
            <Row key={l.key} label={l.label} selected={lang === l.key} last={i === LANGS.length - 1} onPress={() => setLang(l.key)} />
          ))}
        </Section>

        <Section title={t('appearance')}>
          {MODES.map(({ key, label, Icon }, i) => (
            <Row
              key={key}
              icon={(c) => <Icon size={22} color={c} />}
              label={t(label)}
              selected={mode === key}
              last={i === MODES.length - 1}
              onPress={() => setMode(key)}
            />
          ))}
        </Section>

        <Section title={t('notificationsSection')}>
          <Row
            icon={(c) => <BellIcon size={22} color={c} />}
            label={t('allowNotifications')}
            last
            right={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#fff"
                accessibilityLabel={t('allowNotifications')}
              />
            }
          />
        </Section>

        <Section title={t('securitySection')}>
          <Row icon={(c) => <LockIcon size={22} color={c} />} label={t('changePassword')} chevron last onPress={() => onOpen('changePassword')} />
        </Section>

        <Section title={t('accountSection')}>
          <Row icon={(c) => <LogOutIcon size={22} color={c} />} label={t('logout')} danger onPress={() => setAskLogout(true)} />
          <Row icon={(c) => <TrashIcon size={22} color={c} />} label={t('deleteAccount')} danger last onPress={() => onOpen('deleteAccount')} />
        </Section>

        <Text style={[styles.version, { color: colors.textMuted }]}>
          NiJibu · {t('version')} {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </ScrollView>

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
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 16, overflow: 'hidden' },
  version: { textAlign: 'center', fontSize: 13, marginTop: 28 },
});
