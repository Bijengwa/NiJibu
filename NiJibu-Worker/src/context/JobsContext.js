import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as jobsApi from '../api/jobs';
import { getCoords, watchCoords } from '../location/geo';
import { useAuth } from './AuthContext';

const JobsContext = createContext(null);

// Online switch, requests from customers, and finished jobs.
export function JobsProvider({ children }) {
  const { token } = useAuth();
  const [online, setOnlineState] = useState(false);
  const [requests, setRequests] = useState([]); // status 'new' or 'accepted'
  const [jobs, setJobs] = useState([]); // finished
  const [error, setError] = useState('');
  const [position, setPosition] = useState(null); // live position while online
  const onlineRef = useRef(false);
  const watchRef = useRef(null);

  const stopWatch = useCallback(() => {
    watchRef.current?.remove?.();
    watchRef.current = null;
  }, []);
  useEffect(() => stopWatch, [stopWatch]);

  const refresh = useCallback(async () => {
    try {
      const [r, j] = await Promise.all([jobsApi.listRequests(token), jobsApi.listJobs(token)]);
      setRequests(r.requests);
      setJobs(j.jobs);
      setError('');
    } catch (e) {
      setError(e.code || 'UNKNOWN');
    }
  }, [token]);

  // While online, ask for new requests every few seconds
  useEffect(() => {
    if (!online) return;
    refresh();
    const id = setInterval(refresh, jobsApi.POLL_MS);
    return () => clearInterval(id);
  }, [online, refresh]);

  // Throws ApiError on failure (the screen shows the message)
  const setOnline = useCallback(
    async (value) => {
      if (value) {
        // Going online needs the location (throws LOCATION_DENIED / LOCATION_UNAVAILABLE)
        const here = await getCoords();
        await jobsApi.setOnline(token, true, here);
        setPosition(here);
        stopWatch();
        // Keep sending the position while online (only while the app is open)
        watchRef.current = await watchCoords((c) => {
          setPosition(c);
          jobsApi.sendLocation(token, c).catch(() => {});
        });
      } else {
        await jobsApi.setOnline(token, false);
        stopWatch();
        setPosition(null);
        setRequests((rs) => rs.filter((r) => r.status === 'accepted')); // an accepted job stays
      }
      onlineRef.current = value;
      setOnlineState(value);
    },
    [token, stopWatch]
  );

  const act = useCallback(
    (fn) => async (id) => {
      await fn(token, id);
      await refresh();
    },
    [token, refresh]
  );

  const value = useMemo(
    () => ({
      online,
      position,
      setOnline,
      requests,
      jobs,
      error,
      refresh,
      accept: act(jobsApi.acceptRequest),
      decline: act(jobsApi.declineRequest),
      complete: act(jobsApi.completeRequest),
      simulate: async () => {
        jobsApi.simulateRequest();
        await refresh();
      },
    }),
    [online, position, setOnline, requests, jobs, error, refresh, act]
  );

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export const useJobs = () => useContext(JobsContext);
