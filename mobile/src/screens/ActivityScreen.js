import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listRequests } from '../api/requests';
import EmptyState from '../components/EmptyState';
import PayModal, { money } from '../components/PayModal';
import ServiceIcon from '../components/ServiceIcon';
import { ReceiptIcon } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { useRequest } from '../context/RequestContext';
import { useServices } from '../context/ServicesContext';
import { useSettings } from '../context/SettingsContext';
import { timeAgo } from '../utils/validation';

const DONE = ['completed'];
const BAD = ['cancelled', 'no_provider'];

// The customer's requests, newest first. Reloads when you open the tab and when the open request changes.
export default function ActivityScreen() {
  const { colors, t, lang } = useSettings();
  const { token } = useAuth();
  const { services } = useServices();
  const { request } = useRequest();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [payFor, setPayFor] = useState(null); // a finished request that is not paid yet
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
    return (
      <Pressable
        disabled={!unpaid}
        onPress={() => setPayFor({ id: item.id, agreed_price: item.price, customer_confirmed_at: item.customer_confirmed_at })}
        style={[styles.row, { backgroundColor: colors.surface }]}
        accessibilityRole={unpaid ? 'button' : undefined}
      >
        <ServiceIcon slug={svc?.key} size={26} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{lang === 'sw' ? item.name_sw : item.name_en}</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
            {item.address ? `${item.address} · ` : ''}{timeAgo(t, item.created_at)}
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
          ListFooterComponent={<PayModal visible={!!payFor} request={payFor} onClose={() => setPayFor(null)} onPaid={load} />}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 10 },
  name: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  status: { fontSize: 13, fontWeight: '800' },
});
