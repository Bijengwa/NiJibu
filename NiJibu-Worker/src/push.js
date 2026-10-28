import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { request } from './api/client';

// expo-notifications is loaded only here, inside try/catch: Expo Go has no native part for it
// and would crash the whole app at start. In a development build it works normally.
let Notifications = null;
function load() {
  if (Notifications) return Notifications;
  // Expo Go: do not even load it (no native part, only errors)
  if (Constants.executionEnvironment === 'storeClient') return null;
  try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
  } catch {
    Notifications = null;
  }
  return Notifications;
}

// Asks for permission, gets this phone's push token and sends it to the server.
// Never throws: if push does not work (Expo Go), the app still works while it is open.
export async function registerPush(token) {
  try {
    const N = load();
    if (!N) return;
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'NiJibu',
        importance: N.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 200, 300],
      });
    }
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await request('/api/me/push-token', { method: 'PUT', token, body: { token: data } });
  } catch (e) {
    console.log('push not available:', e?.message);
  }
}
