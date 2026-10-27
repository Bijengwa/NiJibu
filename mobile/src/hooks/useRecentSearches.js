import { useCallback, useEffect, useState } from 'react';
import { getItem, setItem } from '../storage';

const KEY = 'recentSearches';
const MAX = 5;

// Remembers the last services the user searched (service keys only, kept on the phone)
export default function useRecentSearches() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) setItems(parsed.filter((k) => typeof k === 'string').slice(0, MAX));
      } catch {}
    })();
  }, []);

  const add = useCallback((key) => {
    setItems((list) => {
      const next = [key, ...list.filter((k) => k !== key)].slice(0, MAX);
      setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setItem(KEY, '[]');
  }, []);

  return { items, add, clear };
}
