import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { MonitorIcon, MoonIcon, SunIcon } from './Icons';

const MODES = [
  { key: 'system', Icon: MonitorIcon, label: 'themeSystem' },
  { key: 'light', Icon: SunIcon, label: 'themeLight' },
  { key: 'dark', Icon: MoonIcon, label: 'themeDark' },
];
const LANGS = [
  { key: 'en', label: 'EN', full: 'English' },
  { key: 'sw', label: 'SW', full: 'Kiswahili' },
];

// Language (EN | SW) + theme (system | light | dark) switchers
export default function SettingsBar() {
  const { colors, mode, setMode, lang, setLang, t } = useSettings();

  const segment = (active) => [
    styles.segment,
    { backgroundColor: active ? colors.primary : 'transparent' },
  ];

  return (
    <View style={styles.row}>
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        {LANGS.map((l) => (
          <Pressable
            key={l.key}
            style={segment(lang === l.key)}
            onPress={() => setLang(l.key)}
            accessibilityRole="button"
            accessibilityLabel={`${t('language')}: ${l.full}`}
            accessibilityState={{ selected: lang === l.key }}
          >
            <Text style={[styles.langText, { color: lang === l.key ? colors.onPrimary : colors.text }]}>
              {l.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        {MODES.map(({ key, Icon, label }) => (
          <Pressable
            key={key}
            style={segment(mode === key)}
            onPress={() => setMode(key)}
            accessibilityRole="button"
            accessibilityLabel={t(label)}
            accessibilityState={{ selected: mode === key }}
          >
            <Icon size={18} color={mode === key ? colors.onPrimary : colors.text} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  group: { flexDirection: 'row', borderRadius: 20, padding: 3 },
  segment: {
    minWidth: 40,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langText: { fontSize: 13, fontWeight: '700' },
});
