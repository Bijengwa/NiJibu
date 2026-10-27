import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

// Used when location is off/denied: Kunduchi, Dar es Salaam (first area of NiJibu)
export const DEFAULT_LOCATION = { lat: -6.6667, lng: 39.2167 };

// status: 'loading' | 'granted' | 'denied' | 'error'
export default function useUserLocation() {
  const [state, setState] = useState({ coords: null, status: 'loading' });

  const locate = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState((s) => ({ ...s, status: 'denied' }));
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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

  return { ...state, locate };
}
