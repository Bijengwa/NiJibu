import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SettingsProvider, useSettings } from './src/context/SettingsContext';
import MainTabs from './src/navigation/MainTabs';
import AuthScreen from './src/screens/AuthScreen';
import VerifyScreen from './src/screens/VerifyScreen';

function Root() {
  const { colors, isDark } = useSettings();
  const { user, restoring, pending } = useAuth();

  let screen;
  if (restoring) {
    screen = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  } else if (user) {
    screen = <MainTabs />;
  } else if (pending) {
    screen = <VerifyScreen />;
  } else {
    screen = <AuthScreen />;
  }

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
          <Root />
        </SettingsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
