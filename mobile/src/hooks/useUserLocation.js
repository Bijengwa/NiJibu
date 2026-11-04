import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

// Used when location is off/denied: Kunduchi, Dar es Salaam (first area of NiJibu)
export const DEFAULT_LOCATION = { lat: -6.6667, lng: 39.2167 };

// status: 'loading' | 'granted' | 'denied' | 'error'
export default function useUserLocation() {
  const [state, setState] = useState({ coords: null, status: 'loading' });

  const locate = useCallback(async (fresh = false) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState((s) => ({ ...s, status: 'denied' }));
        return null;
      }
      // Fast: a position from the last minute is used at once. Otherwise ask for a new one (low accuracy is quick;
      // a city-block error does not matter for a house call).
      const last = fresh ? null : await Location.getLastKnownPositionAsync({ maxAge: 60000, requiredAccuracy: 200 }).catch(() => null);
      const pos = last || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setState({ coords, status: 'granted' });
      return coords;
    } catch {
      setState((s) => ({ ...s, status: 'error' }));
      return null;
    }
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  // Keep the position fresh while the app is open, so "use my place" and "request" do not wait for GPS
  useEffect(() => {
    let sub = null;
    let gone = false;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const s = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 30 },
          (p) => setState({ coords: { lat: p.coords.latitude, lng: p.coords.longitude }, status: 'granted' })
        );
        if (gone) s.remove();
        else sub = s;
      } catch {}
    })();
    return () => {
      gone = true;
      sub?.remove?.();
    };
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, locate };
}
