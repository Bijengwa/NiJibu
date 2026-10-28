import { useEffect } from 'react';
import { BackHandler, View } from 'react-native';
import TabBar from '../components/TabBar';
import { useSettings } from '../context/SettingsContext';
import AccountScreen from '../screens/AccountScreen';
import JobsScreen from '../screens/JobsScreen';
import RequestsScreen from '../screens/RequestsScreen';

// Tabs for a verified fundi: Requests, Jobs, Account.
// Requests stays mounted so the online switch and the list are kept when you change tab.
export default function WorkerTabs({ tab, onTab: setTab, onPayout, onEditDetails }) {
  const { colors } = useSettings();

  // Android back button: go to the Requests tab, then leave the app
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab !== 'requests') {
        setTab('requests');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [tab]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, display: tab === 'requests' ? 'flex' : 'none' }}>
        <RequestsScreen />
      </View>
      {tab === 'jobs' && <JobsScreen />}
      {tab === 'account' && <AccountScreen onPayout={onPayout} onEditDetails={onEditDetails} />}
      <TabBar active={tab} onChange={setTab} />
    </View>
  );
}
