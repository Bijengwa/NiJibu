import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import TabBar from '../components/TabBar';
import { RequestProvider } from '../context/RequestContext';
import { ServicesProvider } from '../context/ServicesContext';
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

// Services and the open request are shared by the Home and Activity tabs.
export default function MainTabs() {
  return (
    <ServicesProvider>
      <RequestProvider>
        <Tabs />
      </RequestProvider>
    </ServicesProvider>
  );
}

function Tabs() {
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
  const showHome = tab === 'home' && !Inner;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Home stays mounted so the map and the search results are kept when you change tab */}
      <View style={{ flex: 1, display: showHome ? 'flex' : 'none' }}>
        <HomeScreen active={showHome} />
      </View>
      <View style={{ flex: 1, display: showHome ? 'none' : 'flex' }}>
        {Inner ? (
          <Inner onBack={back} onOpen={open} />
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
