import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { ReceiptIcon } from '../components/Icons';
import { useJobs } from '../context/JobsContext';
import { useSettings } from '../context/SettingsContext';
import { money } from '../components/PriceModal';
import ServiceIcon from '../components/ServiceIcon';
import { timeAgo } from '../utils/validation';

// Finished jobs
export default function JobsScreen() {
  const { colors, t, lang } = useSettings();
  const insets = useSafeAreaInsets();
  const { jobs, totals } = useJobs();

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
          <View style={styles.earn}>
            {[
              ['earnReceived', totals.received, colors.success],
              ['earnOnTheWay', totals.on_the_way, colors.primary],
              ['earnWaiting', totals.waiting_customer, colors.textMuted],
            ].map(([key, value, color]) => (
              <View key={key} style={[styles.earnBox, { backgroundColor: colors.surface }]}>
                <Text style={[styles.earnLabel, { color: colors.textMuted }]} numberOfLines={1}>{t(key)}</Text>
                <Text style={[styles.earnValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{money(value)}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.total, { color: colors.textMuted }]}>
            {t('jobsTotal')}: {jobs.filter((j) => j.status === 'completed').length}
          </Text>
          {jobs.map((j) => {
            const done = j.status === 'completed';
            const open = ['accepted', 'on_the_way', 'arrived', 'in_progress'].includes(j.status);
            return (
              <View key={j.id} style={[styles.row, { backgroundColor: colors.surface }]}>
                <View style={[styles.iconBox, { backgroundColor: colors.background }]}>
                  <ServiceIcon slug={j.slug} size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{lang === 'sw' ? j.name_sw : j.name_en}</Text>
                  <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
                    {j.customer_name}{j.address ? ` · ${j.address}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.done, { color: done ? colors.success : open ? colors.primary : colors.textMuted }]}>{t(`job_${j.status}`)}</Text>
                  {j.price ? (
                    <Text style={[styles.sub, { color: j.payment_status === 'paid' ? colors.success : colors.textMuted, fontWeight: '700' }]}>
                      {j.payment_status === 'paid' ? `+ ${money(j.payout)}` : money(j.price)}
                    </Text>
                  ) : null}
                  {j.price ? (
                    <Text style={[styles.sub, { color: colors.textMuted }]}>
                      {j.payment_status !== 'paid' ? t('payWaiting') : j.payout_status === 'sent' ? t('payPaid') : j.payout_status === 'failed' ? t('payFailedPayout') : t('payNoDetails')}
                    </Text>
                  ) : (
                    <Text style={[styles.sub, { color: colors.textMuted }]}>{timeAgo(t, j.completed_at || j.created_at)}</Text>
                  )}
                  {j.complaint_status === 'open' ? <Text style={[styles.sub, { color: colors.error }]}>{t('complaintOpen')}</Text> : null}
                  {j.complaint_status === 'resolved' && !j.received_at ? <Text style={[styles.sub, { color: colors.primary }]}>{t('complaintDone')}</Text> : null}
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
  earn: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  earnBox: { flex: 1, borderRadius: 12, padding: 10 },
  earnLabel: { fontSize: 11, fontWeight: '600' },
  earnValue: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginTop: 10 },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  done: { fontSize: 14, fontWeight: '700' },
});
