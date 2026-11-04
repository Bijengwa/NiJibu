import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchServices } from '../api/services';
import { toService } from '../data/services';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';

const ServicesContext = createContext(null);

// The list of jobs from the server, named in the app language. A fundi picks from this fixed list.
export function ServicesProvider({ children }) {
  const { token } = useAuth();
  const { lang } = useSettings();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setRows((await fetchServices(token)).items);
      setError('');
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(() => {
    // Jobs a worker wrote that the admin has not approved yet (status 'pending') are not in the fixed list
    const services = rows.filter((r) => r.status !== 'pending').map((r) => toService(r, lang));
    return { services, error, reload: load, getService: (key) => services.find((s) => s.key === key) };
  }, [rows, lang, error, load]);

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export const useServices = () => useContext(ServicesContext);
