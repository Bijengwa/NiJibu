import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { BellIcon } from '../components/Icons';
import { useSettings } from '../context/SettingsContext';
import { timeAgo } from '../utils/validation';

// Text by type is translated in the app; unknown types fall back to the server's English text.
function textFor(t, n, part) {
  const key = `notif_${n.type}_${part}`;
  const translated = t(key);
  return translated === key ? n[part] : translated;
}

export default function NotificationsScreen({ items, unread, loading, error, refresh, markRead, markAll }) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();

  const renderItem = ({ item }) => {
    const isUnread = !item.read_at;
    return (
      <Pressable
        onPress={() => markRead(item.id)}
        style={({ pressed }) => [
          styles.item,
          { backgroundColor: isUnread ? colors.surface : 'transparent', opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
      >
        <View style={[styles.dot, { backgroundColor: isUnread ? colors.primary : 'transparent' }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemTitle, { color: colors.text, fontWeight: isUnread ? '700' : '500' }]}>
            {textFor(t, item, 'title')}
          </Text>
          <Text style={[styles.itemBody, { color: colors.textMuted }]}>{textFor(t, item, 'body')}</Text>
          <Text style={[styles.itemTime, { color: colors.textMuted }]}>{timeAgo(t, item.created_at)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 20 }}>
      <View style={[styles.header, { paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('tabNotifications')}</Text>
        {unread > 0 && (
          <Pressable onPress={markAll} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.markAll, { color: colors.primary }]}>{t('markAllRead')}</Text>
          </Pressable>
        )}
      </View>

      {error && items.length === 0 ? (
        <EmptyState icon={(c) => <BellIcon size={36} color={c} />} title={t('loadFailed')} body={t(error)} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => String(n.id)}
          renderItem={renderItem}
          contentContainerStyle={items.length ? { paddingBottom: 16 } : { flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                icon={(c) => <BellIcon size={36} color={c} />}
                title={t('notificationsEmptyTitle')}
                body={t('notificationsEmptyBody')}
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 32, fontWeight: '800' },
  markAll: { fontSize: 14, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 20 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  itemTitle: { fontSize: 16 },
  itemBody: { fontSize: 14, marginTop: 3 },
  itemTime: { fontSize: 12, marginTop: 6 },
});
