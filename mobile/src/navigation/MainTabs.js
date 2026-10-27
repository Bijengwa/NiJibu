import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import TabBar from '../components/TabBar';
import { useSettings } from '../context/SettingsContext';
import useNotifications from '../hooks/useNotifications';
import AccountScreen from '../screens/AccountScreen';
import ActivityScreen from '../screens/ActivityScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import HomeScreen from '../screens/HomeScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';

// Tiny navigator: 4 tabs (home, activity, notifications, account) + a stack of inner screens.
// (Can be replaced by Expo Router later without touching the screens' content.)
const INNER = {
  profile: ProfileScreen,
  settings: SettingsScreen,
  changePassword: ChangePasswordScreen,
  deleteAccount: DeleteAccountScreen,
};

export default function MainTabs() {
  const { colors } = useSettings();
  const notifications = useNotifications();
  const [tab, setTab] = useState('home');
  const [stack, setStack] = useState([]); // inner screens opened from Account

  const open = (name) => setStack((s) => [...s, name]);
  const back = () => setStack((s) => s.slice(0, -1));

  // Android back button: close inner screen -> Home tab -> leave app
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length) {
        back();
        return true;
      }
      if (tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [stack, tab]);

  const changeTab = (key) => {
    setStack([]);
    setTab(key);
    if (key === 'notifications') notifications.refresh();
  };

  const Inner = stack.length ? INNER[stack[stack.length - 1]] : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1 }}>
        {Inner ? (
          <Inner onBack={back} onOpen={open} />
        ) : tab === 'home' ? (
          <HomeScreen />
        ) : tab === 'activity' ? (
          <ActivityScreen />
        ) : tab === 'notifications' ? (
          <NotificationsScreen {...notifications} />
        ) : (
          <AccountScreen onOpen={open} />
        )}
      </View>
      {!Inner && <TabBar active={tab} onChange={changeTab} badges={{ notifications: notifications.unread }} />}
    </View>
  );
}
