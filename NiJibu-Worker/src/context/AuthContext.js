import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth';
import { ApiError, setUnauthorizedHandler } from '../api/client';
import { USE_MOCK_PROVIDER } from '../config';
import { getItem, removeItem, setItem } from '../storage';

const AuthContext = createContext(null);
const TOKEN_KEY = 'authToken';

// Only fundi accounts may use this app. While the server cannot create fundi accounts yet
// (test mode), any verified account is accepted so the screens can be tested.
const isFundi = (u) => USE_MOCK_PROVIDER || u?.role === 'fundi';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [restoring, setRestoring] = useState(true);
  // Set after register (or login of an unverified phone): { phone, retryAfter }
  const [pending, setPending] = useState(null);

  // Local logout only (no server call): used when the server already ended the session
  const clearSession = useCallback(async () => {
    await removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setPending(null);
  }, []);

  // Token rejected by the server (expired / revoked / account deleted) -> back to login
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Restore session on app start
  useEffect(() => {
    (async () => {
      try {
        const saved = await getItem(TOKEN_KEY);
        if (saved) {
          const { user: u } = await authApi.me(saved);
          if (isFundi(u)) {
            setUser(u);
            setToken(saved);
          } else {
            await removeItem(TOKEN_KEY);
          }
        }
      } catch (e) {
        if (e.status === 401) await removeItem(TOKEN_KEY);
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const handleAuth = useCallback(async ({ token: tk, user: u }) => {
    // A customer (or admin) number cannot be used here. Do not keep the token.
    if (!isFundi(u)) throw new ApiError('NOT_A_FUNDI', 403);
    await setItem(TOKEN_KEY, tk);
    setToken(tk);
    setUser(u);
    setPending(null);
  }, []);

  // These throw ApiError on failure (the screen shows the message)
  const login = useCallback(
    async (phone, password) => {
      try {
        await handleAuth(await authApi.login(phone, password));
      } catch (e) {
        if (e.code === 'PHONE_NOT_VERIFIED') {
          setPending({ phone, retryAfter: e.retryAfter ?? 60 }); // server already sent a code
          return;
        }
        throw e;
      }
    },
    [handleAuth]
  );

  const register = useCallback(async (phone, password) => {
    const r = await authApi.register(phone, password);
    setPending({ phone, retryAfter: r.retry_after ?? 60 });
  }, []);

  const verify = useCallback(
    async (code) => handleAuth(await authApi.verify(pending.phone, code)),
    [handleAuth, pending]
  );

  // Returns the cooldown in seconds before the next resend
  const resend = useCallback(async () => {
    const r = await authApi.resend(pending.phone);
    return r.retry_after ?? 60;
  }, [pending]);

  const cancelVerification = useCallback(() => setPending(null), []);

  // Replace the user after a profile / settings / photo change
  const updateUser = useCallback((u) => setUser(u), []);

  // After a password change the server sends a new token (old ones stop working)
  const replaceToken = useCallback(async (tk) => {
    await setItem(TOKEN_KEY, tk);
    setToken(tk);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) await authApi.logout(token); // revoke on the server (best effort)
    } catch {}
    await clearSession();
  }, [token, clearSession]);

  const value = useMemo(
    () => ({
      user, token, restoring, pending,
      login, register, verify, resend, cancelVerification,
      updateUser, replaceToken, logout, clearSession,
    }),
    [user, token, restoring, pending, login, register, verify, resend, cancelVerification, updateUser, replaceToken, logout, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
