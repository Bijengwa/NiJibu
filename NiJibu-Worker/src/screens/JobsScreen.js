import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { ReceiptIcon } from '../components/Icons';
import { useJobs } from '../context/JobsContext';
import { useSettings } from '../context/SettingsContext';
import { emojiOf, labelOf } from '../data/services';
import { timeAgo } from '../utils/validation';

// Finished jobs
export default function JobsScreen() {
  const { colors, t, lang } = useSettings();
  const insets = useSafeAreaInsets();
  const { jobs } = useJobs();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 20 }}>
      <Text style={[styles.title, { color: colors.text, marginLeft: insets.left + 20 }]}>{t('tabJobs')}</Text>
      {jobs.length === 0 ? (
        <EmptyState
          icon={(c) => <ReceiptIcon size={36} color={c} />}
          title={t('jobsEmptyTitle')}
          body={t('jobsEmptyBody')}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }}>
          <Text style={[styles.total, { color: colors.textMuted }]}>
            {t('jobsTotal')}: {jobs.filter((j) => j.status === 'completed').length}
          </Text>
          {jobs.map((j) => {
            const done = j.status === 'completed';
            const open = ['accepted', 'on_the_way', 'arrived', 'in_progress'].includes(j.status);
            return (
              <View key={j.id} style={[styles.row, { backgroundColor: colors.surface }]}>
                <Text style={styles.emoji}>{emojiOf(j.slug)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{lang === 'sw' ? j.name_sw : j.name_en}</Text>
                  <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
                    {j.customer_name}{j.address ? ` · ${j.address}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.done, { color: done ? colors.success : open ? colors.primary : colors.textMuted }]}>{t(`job_${j.status}`)}</Text>
                  <Text style={[styles.sub, { color: colors.textMuted }]}>{timeAgo(t, j.completed_at || j.created_at)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '800' },
  total: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginTop: 10 },
  emoji: { fontSize: 28 },
  name: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  done: { fontSize: 14, fontWeight: '700' },
});
