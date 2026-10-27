import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { updateSettings } from '../api/me';
import { darkColors, lightColors } from '../theme/colors';
import { translations } from '../i18n/translations';
import { getItem, setItem } from '../storage';
import { useAuth } from './AuthContext';

const SettingsContext = createContext(null);

const DEFAULT_MODE = 'system'; // 'system' | 'light' | 'dark'
const DEFAULT_LANG = 'en'; // 'en' | 'sw'

// Language + theme: saved on the phone (works before login) and on the server (follows the account).
export function SettingsProvider({ children }) {
  const systemScheme = useColorScheme();
  const { user, token, updateUser } = useAuth();
  const [mode, setModeState] = useState(DEFAULT_MODE);
  const [lang, setLangState] = useState(DEFAULT_LANG);
  const appliedFor = useRef(null);

  useEffect(() => {
    (async () => {
      const [m, l] = await Promise.all([getItem('themeMode'), getItem('lang')]);
      if (m === 'system' || m === 'light' || m === 'dark') setModeState(m);
      if (l === 'en' || l === 'sw') setLangState(l);
    })();
  }, []);

  // When a user logs in, use the choices saved on their account (if any)
  useEffect(() => {
    if (!user) {
      appliedFor.current = null;
      return;
    }
    if (appliedFor.current === user.id) return;
    appliedFor.current = user.id;

    const s = user.settings || {};
    if (s.theme_mode) {
      setModeState(s.theme_mode);
      setItem('themeMode', s.theme_mode);
    }
    if (s.language) {
      setLangState(s.language);
      setItem('lang', s.language);
    }
  }, [user]);

  const saveToServer = useCallback(
    (changes) => {
      if (!token) return;
      updateSettings(token, changes)
        .then((r) => updateUser(r.user))
        .catch(() => {}); // the local choice still works; it syncs next time
    },
    [token, updateUser]
  );

  const setMode = useCallback(
    (m) => {
      setModeState(m);
      setItem('themeMode', m);
      saveToServer({ theme_mode: m });
    },
    [saveToServer]
  );

  const setLang = useCallback(
    (l) => {
      setLangState(l);
      setItem('lang', l);
      saveToServer({ language: l });
    },
    [saveToServer]
  );

  const notificationsEnabled = user?.settings?.notifications_enabled !== false;
  const setNotificationsEnabled = useCallback(
    (value) => saveToServer({ notifications_enabled: value }),
    [saveToServer]
  );

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const value = useMemo(
    () => ({
      mode,
      setMode,
      lang,
      setLang,
      notificationsEnabled,
      setNotificationsEnabled,
      isDark,
      colors: isDark ? darkColors : lightColors,
      t: (key) => translations[lang][key] ?? translations.en[key] ?? key,
    }),
    [mode, lang, isDark, notificationsEnabled, setMode, setLang, setNotificationsEnabled]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
