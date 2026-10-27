import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { updateProfile } from '../api/me';
import * as providerApi from '../api/provider';
import { clearDraft, loadDraft } from '../signup/draft';
import { useAuth } from './AuthContext';

const ProviderContext = createContext(null);

// The fundi's profile and verification status (loaded after login).
export function ProviderProvider({ children }) {
  const { user, token, updateUser } = useAuth();
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!token || !user) return null;
    try {
      let r = await providerApi.getProvider(token);
      // Just registered: send what was typed in the sign-up (names, NIDA) to the new account
      const draft = !r.provider.nida_submitted ? await loadDraft() : null;
      if (draft && String(user.phone || '').endsWith(draft.phone)) {
        const full = [draft.firstName, draft.middleName, draft.lastName].filter(Boolean).join(' ');
        updateUser((await updateProfile(token, { name: full, email: draft.email })).user);
        r = await providerApi.submitIdentity(token, draft);
        await clearDraft();
      }
      setProvider(r.provider);
      setLoadError('');
      return r.provider;
    } catch (e) {
      setLoadError(e.code || 'UNKNOWN');
      return null;
    }
  }, [token, user, updateUser]);

  useEffect(() => {
    if (!user) {
      setProvider(null);
      setLoading(true);
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [user, load]);

  // Each call throws ApiError on failure (the screen shows the message) and returns the new provider.
  const run = useCallback(
    (fn) => async (values) => {
      const r = await fn(token, values);
      setProvider(r.provider);
      return r.provider;
    },
    [token]
  );

  const value = useMemo(
    () => ({
      provider,
      loading,
      loadError,
      refresh: load,
      // Name + email go to the user profile (same route as the customer app); the rest to the fundi profile.
      saveDetails: async (values) => {
        const { full_name, email, ...rest } = values;
        const r0 = await updateProfile(token, { name: full_name, email });
        updateUser(r0.user);
        const r = await providerApi.saveDetails(token, rest);
        setProvider(r.provider);
        return r.provider;
      },
      submitNida: run(providerApi.submitNida),
      verifyNidaFingerprint: run(providerApi.verifyNidaFingerprint),
      savePayout: run(providerApi.savePayout),
    }),
    [provider, loading, loadError, load, run, token, updateUser]
  );

  return <ProviderContext.Provider value={value}>{children}</ProviderContext.Provider>;
}

export const useProvider = () => useContext(ProviderContext);
