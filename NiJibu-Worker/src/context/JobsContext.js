import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as jobsApi from '../api/jobs';
import { getCoords, watchCoords } from '../location/geo';
import { connectSocket } from '../realtime';
import { useAuth } from './AuthContext';
import { useProvider } from './ProviderContext';

const JobsContext = createContext(null);

const BUSY = ['accepted', 'on_the_way', 'arrived', 'in_progress'];
const ONLINE_WATCH = { timeInterval: 15000, distanceInterval: 50 }; // waiting for offers
const TRIP_WATCH = { timeInterval: 5000, distanceInterval: 10 }; // customer follows me on the map

// Online switch, offers from customers, the active job, finished jobs.
// Push comes from the socket; the REST calls fill the screen on start and after a reconnect.
export function JobsProvider({ children }) {
  const { token } = useAuth();
  const { provider } = useProvider();
  const [online, setOnlineState] = useState(false);
  const [offers, setOffers] = useState([]);
  const [active, setActive] = useState(null); // my current job (full request view) or null
  const [jobs, setJobs] = useState([]);
  const [position, setPosition] = useState(null);
  const [error, setError] = useState('');

  const socketRef = useRef(null);
  const watchRef = useRef(null);
  const watchModeRef = useRef('');
  const activeRef = useRef(null);
  const onlineRef = useRef(false);
  activeRef.current = active;

  // ---- loading ----
  const loadJobs = useCallback(async () => {
    try {
      setJobs((await jobsApi.listJobs(token)).items);
    } catch {}
  }, [token]);

  const loadActive = useCallback(async () => {
    try {
      const { provider: me } = await jobsApi.getMe(token);
      if (me?.active_request_id) {
        const { request } = await jobsApi.getRequest(token, me.active_request_id);
        setActive(BUSY.includes(request.status) ? request : null);
        if (BUSY.includes(request.status)) socketRef.current?.emit('request:join', request.id);
      } else {
        setActive(null);
      }
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    }
  }, [token]);

  const loadOffers = useCallback(async () => {
    try {
      setOffers((await jobsApi.listOffers(token)).items);
    } catch {}
  }, [token]);

  const refresh = useCallback(async () => {
    setError('');
    await Promise.all([loadActive(), loadOffers(), loadJobs()]);
  }, [loadActive, loadOffers, loadJobs]);

  // ---- location ----
  const stopWatch = useCallback(() => {
    watchRef.current?.remove?.();
    watchRef.current = null;
    watchModeRef.current = '';
  }, []);

  const startWatch = useCallback(
    async (mode) => {
      if (watchModeRef.current === mode) return;
      stopWatch();
      watchModeRef.current = mode;
      const opts = mode === 'trip' ? TRIP_WATCH : ONLINE_WATCH;
      const sub = await watchCoords((c) => {
        setPosition(c);
        const job = activeRef.current;
        if (job && job.status === 'on_the_way') {
          socketRef.current?.emit('provider:location', { request_id: job.id, lat: c.lat, lng: c.lng });
        } else {
          jobsApi.sendLocation(token, c).catch(() => {});
        }
      }, opts);
      // a newer call may have replaced this one while we waited
      if (watchModeRef.current !== mode) sub.remove?.();
      else watchRef.current = sub;
    },
    [token, stopWatch]
  );

  // Faster updates while driving to the customer
  const tripMode = active?.status === 'on_the_way';
  useEffect(() => {
    if (onlineRef.current || activeRef.current) startWatch(tripMode ? 'trip' : 'idle').catch(() => {});
  }, [tripMode, startWatch, online, active?.id]);

  // ---- socket ----
  useEffect(() => {
    if (!token) return;
    const s = connectSocket(token);
    socketRef.current = s;

    s.on('connect', () => {
      refresh(); // first connect and every reconnect: catch up on what was missed
    });
    s.on('offer:new', (offer) => {
      setOffers((os) => (os.some((o) => o.offer_id === offer.offer_id) ? os : [...os, offer]));
    });
    s.on('offer:closed', ({ offer_id }) => setOffers((os) => os.filter((o) => o.offer_id !== offer_id)));
    s.on('request:status', () => {
      loadActive();
      loadJobs();
    });

    return () => {
      s.close();
      socketRef.current = null;
    };
  }, [token, refresh, loadActive, loadJobs]);

  // Heartbeat so the server keeps me "online" even when I do not move
  useEffect(() => {
    if (!online) return;
    const id = setInterval(async () => {
      try {
        const c = await getCoords();
        setPosition(c);
        await jobsApi.sendLocation(token, c);
      } catch {}
    }, 45000);
    return () => clearInterval(id);
  }, [online, token]);

  // The server remembers I was online (app restart): go live again with a fresh position
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !provider?.is_online) return;
    resumed.current = true;
    (async () => {
      try {
        const here = await getCoords();
        await jobsApi.setOnline(token, here);
        setPosition(here);
        onlineRef.current = true;
        setOnlineState(true);
        await startWatch('idle');
      } catch {
        jobsApi.setOffline(token).catch(() => {});
      }
    })();
  }, [provider?.is_online, token, startWatch]);

  useEffect(() => stopWatch, [stopWatch]);

  // ---- actions (throw ApiError on failure; the screen shows the message) ----
  const setOnline = useCallback(
    async (value) => {
      if (value) {
        const here = await getCoords(); // throws LOCATION_DENIED / LOCATION_UNAVAILABLE
        await jobsApi.setOnline(token, here);
        setPosition(here);
        onlineRef.current = true;
        setOnlineState(true);
        await startWatch('idle');
        loadOffers();
      } else {
        await jobsApi.setOffline(token);
        onlineRef.current = false;
        setOnlineState(false);
        setOffers([]);
        if (!activeRef.current) {
          stopWatch();
          setPosition(null);
        }
      }
    },
    [token, startWatch, stopWatch, loadOffers]
  );

  const accept = useCallback(
    async (offerId) => {
      try {
        const { request } = await jobsApi.acceptOffer(token, offerId);
        setOffers([]); // the server closed my other offers
        setActive(request);
        socketRef.current?.emit('request:join', request.id);
      } catch (e) {
        // taken by someone else / expired: it is gone either way
        if (['ALREADY_TAKEN', 'OFFER_EXPIRED', 'NOT_FOUND'].includes(e.code)) setOffers((os) => os.filter((o) => o.offer_id !== offerId));
        throw e;
      }
    },
    [token]
  );

  const decline = useCallback(
    async (offerId) => {
      setOffers((os) => os.filter((o) => o.offer_id !== offerId));
      await jobsApi.declineOffer(token, offerId).catch(() => {});
    },
    [token]
  );

  // stage: 'on-the-way' | 'arrived' | 'start' | 'complete' | 'cancel'
  const move = useCallback(
    async (stage) => {
      const job = activeRef.current;
      if (!job) return;
      const { request } = await jobsApi.moveStage(token, job.id, stage);
      if (BUSY.includes(request.status)) setActive(request);
      else {
        setActive(null);
        loadJobs();
        if (!onlineRef.current) stopWatch();
      }
      return request;
    },
    [token, loadJobs, stopWatch]
  );

  const value = useMemo(
    () => ({ online, position, setOnline, offers, active, jobs, error, refresh, accept, decline, move }),
    [online, position, setOnline, offers, active, jobs, error, refresh, accept, decline, move]
  );

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export const useJobs = () => useContext(JobsContext);
