import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/me';
import { useAuth } from '../context/AuthContext';

// Loads notifications, refreshes every minute, and keeps the unread count for the tab badge.
export default function useNotifications() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const r = await api.listNotifications(token);
      setItems(r.items);
      setUnread(r.unread);
      setError('');
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [refresh]);

  const markRead = useCallback(
    async (id) => {
      const target = items.find((n) => n.id === id);
      if (!target || target.read_at) return;
      setItems((list) => list.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
      setUnread((u) => Math.max(0, u - 1));
      try {
        await api.markRead(token, id);
      } catch {
        refresh();
      }
    },
    [items, token, refresh]
  );

  const markAll = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    setUnread(0);
    try {
      await api.markAllRead(token);
    } catch {
      refresh();
    }
  }, [token, refresh]);

  return { items, unread, loading, error, refresh, markRead, markAll };
}
