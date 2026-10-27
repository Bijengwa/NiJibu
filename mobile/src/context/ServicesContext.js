import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { listServices } from '../api/services';
import { buildServices, legacyKey } from '../data/services';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';

const ServicesContext = createContext(null);

// The services list from the server, named in the app language.
export function ServicesProvider({ children }) {
  const { token } = useAuth();
  const { lang } = useSettings();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setRows((await listServices(token)).items);
      setError('');
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(() => {
    const services = buildServices(rows, lang);
    return {
      services,
      loading,
      error,
      reload: load,
      getService: (key) => services.find((s) => s.key === legacyKey(key)),
      getServiceById: (id) => services.find((s) => s.id === id),
    };
  }, [rows, lang, loading, error, load]);

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export const useServices = () => useContext(ServicesContext);
