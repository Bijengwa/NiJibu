import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Button from './src/components/Button';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { JobsProvider } from './src/context/JobsContext';
import WorkerTabs from './src/navigation/WorkerTabs';
import { ProviderProvider, useProvider } from './src/context/ProviderContext';
import { ServicesProvider } from './src/context/ServicesContext';
import { SettingsProvider, useSettings } from './src/context/SettingsContext';
import AuthScreen from './src/screens/AuthScreen';
import DetailsScreen from './src/screens/DetailsScreen';
import NidaScreen from './src/screens/NidaScreen';
import PayoutScreen from './src/screens/PayoutScreen';
import StatusScreen from './src/screens/StatusScreen';
import VerifyScreen from './src/screens/VerifyScreen';
import WorkerSignupScreen from './src/screens/WorkerSignupScreen';
import { errorMessage } from './src/utils/errors';

function Loading() {
  const { colors } = useSettings();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

// After login the fundi goes through: details -> NIDA -> payout (optional) -> status.
// When verified, the fundi sees the requests (tabs).
// The step is chosen from what the server already has, so closing the app never loses progress.
function ProviderFlow() {
  const { colors, t } = useSettings();
  const { logout } = useAuth();
  const { provider, loading, loadError, refresh } = useProvider();
  const [override, setOverride] = useState(null); // 'details' | 'nida' | 'payout' | null

  // Android back button: runs the back action of the screen that is open (set below on each render)
  const backRef = useRef(null);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!backRef.current) return false;
      backRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);
  backRef.current = null;

  if (loading) return <Loading />;

  if (!provider) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
        <Text style={{ color: colors.error, textAlign: 'center', fontSize: 15 }}>{errorMessage(t, loadError || 'UNKNOWN')}</Text>
        <Button title={t('refresh')} onPress={refresh} />
        <Button title={t('logout')} variant="link" onPress={logout} />
      </View>
    );
  }

  const view =
    override ??
    (!provider.full_name || (provider.nida_submitted && !provider.services?.length && !provider.other_jobs?.length)
      ? 'details'
      : !provider.nida_submitted
        ? 'nida'
        : provider.status === 'verified'
          ? 'home'
          : 'status');

  // A fundi who already has jobs can go back from the details (edit mode)
  const hasJobs = !!(provider.services?.length || provider.other_jobs?.length);

  if (view === 'details') {
    const back = provider.nida_submitted && hasJobs ? () => setOverride(null) : null;
    backRef.current = back;
    return <DetailsScreen onBack={back} onDone={() => setOverride(back || provider.payout_set ? null : 'payout')} />;
  }

  if (view === 'nida') {
    // Can go back to the details only before the NIDA was sent
    const back = provider.full_name && !provider.nida_submitted ? () => setOverride('details') : () => setOverride(null);
    backRef.current = back;
    return (
      <NidaScreen
        onBack={back}
        onDone={(p) => setOverride(p.payout_set ? null : 'payout')}
      />
    );
  }

  // A verified fundi keeps the online switch and the requests while moving between Account and Payout
  if (view === 'payout' || view === 'home') {
    if (view === 'payout') backRef.current = () => setOverride(null);
    const body =
      view === 'payout' ? (
        <PayoutScreen onDone={() => setOverride(null)} onBack={() => setOverride(null)} />
      ) : (
        <WorkerTabs onPayout={() => setOverride('payout')} onEditDetails={() => setOverride('details')} />
      );
    return provider.status === 'verified' ? <JobsProvider>{body}</JobsProvider> : body;
  }

  return <StatusScreen onRetry={() => setOverride('nida')} onPayout={() => setOverride('payout')} onEditDetails={() => setOverride('details')} />;
}

function Root() {
  const { isDark } = useSettings();
  const { user, restoring, pending } = useAuth();
  const [signup, setSignup] = useState(false);

  let screen;
  if (restoring) screen = <Loading />;
  else if (user) screen = <ProviderFlow />;
  else if (pending) screen = <VerifyScreen />;
  else if (signup) screen = <WorkerSignupScreen onCancel={() => setSignup(false)} />;
  else screen = <AuthScreen onSignup={() => setSignup(true)} />;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {screen}
    </>
  );
}

// AuthProvider is outside SettingsProvider: settings follow the logged-in account.
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SettingsProvider>
          <ServicesProvider>
            <ProviderProvider>
              <Root />
            </ProviderProvider>
          </ServicesProvider>
        </SettingsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
