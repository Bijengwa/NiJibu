import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as api from '../api/requests';
import { connectSocket } from '../realtime';
import { distanceKm, etaMinutes } from '../utils/geo';
import { useAuth } from './AuthContext';

const RequestContext = createContext(null);

const OPEN = ['searching', 'accepted', 'on_the_way', 'arrived', 'in_progress'];
export const isOpenStatus = (s) => OPEN.includes(s);

// The customer's current request: restore it, follow it live (socket), and keep it fresh
// with a slow poll in case the socket drops. A finished request stays on screen until dismissed.
export function RequestProvider({ children }) {
  const { token } = useAuth();
  const [request, setRequest] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const requestRef = useRef(null);
  requestRef.current = request;

  const fetchOne = useCallback(
    async (id) => {
      try {
        const r = await api.getRequest(token, id);
        // ignore an answer for a request that is no longer the current one
        if (!requestRef.current || requestRef.current.id === id) setRequest(r.request);
      } catch {}
    },
    [token]
  );

  const syncOpen = useCallback(async () => {
    try {
      const r = await api.getOpenRequest(token);
      if (r.request) setRequest(r.request);
    } catch {}
  }, [token]);

  // Restore on start
  useEffect(() => {
    if (!token) return;
    (async () => {
      await syncOpen();
      setRestoring(false);
    })();
  }, [token, syncOpen]);

  // Live connection
  useEffect(() => {
    if (!token) return undefined;
    const socket = connectSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const cur = requestRef.current;
      if (cur) {
        socket.emit('request:join', cur.id);
        fetchOne(cur.id); // catch up on what happened while offline
      } else {
        syncOpen();
      }
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('request:status', (e) => {
      const cur = requestRef.current;
      if (!cur || cur.id === e.request_id) fetchOne(e.request_id);
    });

    socket.on('provider:location', (e) => {
      setRequest((r) => {
        if (!r || r.id !== e.request_id || !r.provider) return r;
        if (r.status !== 'accepted' && r.status !== 'on_the_way') return r;
        const eta = etaMinutes(distanceKm(r.lat, r.lng, e.lat, e.lng));
        return { ...r, provider: { ...r.provider, lat: e.lat, lng: e.lng, eta_min: eta } };
      });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, fetchOne, syncOpen]);

  // Join the room of the current request (also after a reconnect)
  const requestId = request?.id;
  useEffect(() => {
    if (connected && requestId) socketRef.current?.emit('request:join', requestId);
  }, [connected, requestId]);

  // Backup: while the request is open, ask the server every 7 s. Also when the app comes back.
  const open = !!request && isOpenStatus(request.status);
  useEffect(() => {
    if (!open || !requestId) return undefined;
    const id = setInterval(() => fetchOne(requestId), 7000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') fetchOne(requestId);
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [open, requestId, fetchOne]);

  // These throw ApiError (the screen shows the message)
  const create = useCallback(
    async (body) => {
      try {
        const r = await api.createRequest(token, body);
        setRequest(r.request);
        return r.request;
      } catch (e) {
        if (e.code === 'ALREADY_OPEN') await syncOpen();
        throw e;
      }
    },
    [token, syncOpen]
  );

  const cancel = useCallback(
    async (reason) => {
      const cur = requestRef.current;
      if (!cur) return;
      try {
        const r = await api.cancelRequest(token, cur.id, reason);
        setRequest(r.request);
      } catch (e) {
        await fetchOne(cur.id); // maybe the state changed meanwhile: show the truth
        throw e;
      }
    },
    [token, fetchOne]
  );

  const dismiss = useCallback(() => setRequest(null), []);

  const value = useMemo(
    () => ({ request, restoring, open, create, cancel, dismiss, connected }),
    [request, restoring, open, create, cancel, dismiss, connected]
  );
  return <RequestContext.Provider value={value}>{children}</RequestContext.Provider>;
}

export const useRequest = () => useContext(RequestContext);
