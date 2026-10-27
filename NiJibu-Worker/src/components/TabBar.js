import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import { BellIcon, ReceiptIcon, UserCircleIcon } from './Icons';

const TABS = [
  { key: 'requests', label: 'tabRequests', Icon: BellIcon },
  { key: 'jobs', label: 'tabJobs', Icon: ReceiptIcon },
  { key: 'account', label: 'tabAccount', Icon: UserCircleIcon },
];

export default function TabBar({ active, onChange, badges = {} }) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + 6,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {TABS.map(({ key, label, Icon }) => {
        const isActive = active === key;
        const color = isActive ? colors.primary : colors.textMuted;
        const badge = badges[key] || 0;
        return (
          <Pressable
            key={key}
            style={styles.tab}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={badge ? `${t(label)}, ${badge}` : t(label)}
          >
            <View>
              <Icon size={24} color={color} strokeWidth={isActive ? 2.4 : 2} />
              {badge > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.error, borderColor: colors.background }]}>
                  <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color, fontWeight: isActive ? '700' : '500' }]} numberOfLines={1}>
              {t(label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  label: { fontSize: 12 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
