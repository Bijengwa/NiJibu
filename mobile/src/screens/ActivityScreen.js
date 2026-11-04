import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listRequests, reportProblem } from '../api/requests';
import EmptyState from '../components/EmptyState';
import PayModal, { money } from '../components/PayModal';
import ReportModal from '../components/ReportModal';
import ServiceIcon from '../components/ServiceIcon';
import { ReceiptIcon } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { useRequest } from '../context/RequestContext';
import { useServices } from '../context/ServicesContext';
import { useSettings } from '../context/SettingsContext';
import { timeAgo } from '../utils/validation';

const DONE = ['completed'];
const BAD = ['cancelled', 'no_provider'];
const REASONS = ['worker_no_show', 'bad_work', 'price_changed', 'rude', 'payment_problem', 'other'];
const ACTIVE = ['open', 'in_review'];

// The customer's requests, newest first. Reloads when you open the tab and when the open request changes.
export default function ActivityScreen() {
  const { colors, t, lang } = useSettings();
  const { token } = useAuth();
  const { services } = useServices();
  const { request } = useRequest();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [payFor, setPayFor] = useState(null); // a finished request that is not paid yet
  const [report, setReport] = useState(null); // the request being reported or viewed
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems((await listRequests(token)).items);
      setError('');
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const stage = request?.status;
  useEffect(() => {
    load();
  }, [load, stage]);

  const renderItem = ({ item }) => {
    const svc = services.find((s) => s.label === (lang === 'sw' ? item.name_sw : item.name_en));
    const color = DONE.includes(item.status) ? colors.primary : BAD.includes(item.status) ? colors.error : colors.textMuted;
    const unpaid = item.status === 'completed' && item.price && item.payment_status !== 'paid';
    const cs = item.complaint_status;
    const canReport = item.can_complain && !ACTIVE.includes(cs);
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Pressable
          disabled={!unpaid}
          onPress={() => setPayFor({ id: item.id, agreed_price: item.price, customer_confirmed_at: item.customer_confirmed_at })}
          style={styles.row}
          accessibilityRole={unpaid ? 'button' : undefined}
        >
          <ServiceIcon slug={svc?.key} size={26} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{lang === 'sw' ? item.name_sw : item.name_en}</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
              {item.code ? `${item.code} · ` : ''}{item.address ? `${item.address} · ` : ''}{timeAgo(t, item.created_at)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.status, { color }]}>{t(`status_${item.status}`)}</Text>
            {item.status === 'completed' && item.price ? (
              <Text style={[styles.sub, { color: unpaid ? colors.error : colors.success, fontWeight: '700' }]}>
                {unpaid ? `${item.customer_confirmed_at ? t('payNow') : t('confirmPay')} · ${money(item.price)}` : `${t('payPaidLabel')} · ${money(item.price)}`}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {cs || canReport ? (
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            {cs ? (
              <Pressable onPress={() => setReport({ item, mode: 'view' })} accessibilityRole="button">
                <Text style={[styles.link, { color: colors.primary }]}>{t('reportView')} · {t(`cs_${cs}`)}</Text>
              </Pressable>
            ) : null}
            {canReport ? (
              <Pressable onPress={() => setReport({ item, mode: 'new' })} accessibilityRole="button">
                <Text style={[styles.link, { color: colors.textMuted }]}>{t('reportProblem')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 20 }}>
      <Text style={[styles.title, { color: colors.text, marginLeft: insets.left + 20 }]}>{t('tabActivity')}</Text>
      {error && items.length === 0 ? (
        <EmptyState icon={(c) => <ReceiptIcon size={36} color={c} />} title={t('loadFailed')} body={t(error)} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderItem}
          contentContainerStyle={items.length ? { padding: 20, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 } : { flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
          ListFooterComponent={
            <>
              <PayModal visible={!!payFor} request={payFor} onClose={() => setPayFor(null)} onPaid={load} />
              <ReportModal
                visible={!!report}
                reasons={REASONS}
                requestCode={report?.item.code}
                existing={report?.mode === 'view' ? { reason: report.item.complaint_reason, message: report.item.complaint_message, status: report.item.complaint_status, reply: report.item.complaint_reply } : null}
                onClose={() => setReport(null)}
                onSend={async (reason, message) => {
                  await reportProblem(token, report.item.id, reason, message);
                  setReport(null);
                  load();
                }}
              />
            </>
          }
          ListEmptyComponent={
            loading ? null : (
              <EmptyState icon={(c) => <ReceiptIcon size={36} color={c} />} title={t('activityEmptyTitle')} body={t('activityEmptyBody')} />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '800' },
  card: { borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  link: { fontSize: 13, fontWeight: '700' },
  name: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  status: { fontSize: 13, fontWeight: '800' },
});
