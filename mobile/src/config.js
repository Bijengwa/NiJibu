import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 3000;

// Dev: use the same computer that runs "expo start" (works on a real phone on the same Wi-Fi).
// Override anytime with EXPO_PUBLIC_API_URL in mobile/.env (e.g. https://api.nijibu.com).
function guessDevHost() {
  const hostUri = Constants.expoConfig?.hostUri; // "192.168.1.5:8081"
  if (hostUri) return hostUri.split(':')[0];
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || `http://${guessDevHost()}:${API_PORT}`;
