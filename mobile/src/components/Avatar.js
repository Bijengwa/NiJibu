import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../config';
import { useSettings } from '../context/SettingsContext';
import { UserIcon } from './Icons';

// Round profile picture (the server stores it as a 1:1 square). Falls back to initial / icon.
export default function Avatar({ user, size = 72 }) {
  const { colors } = useSettings();
  const [failed, setFailed] = useState(false);
  const url = user?.avatar_url;

  useEffect(() => setFailed(false), [url]);

  const box = { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface };
  const initial = user?.name ? user.name.trim().charAt(0).toUpperCase() : '';

  if (url && !failed) {
    return (
      <Image
        source={{ uri: `${API_URL}${url}` }}
        style={box}
        onError={() => setFailed(true)}
        accessibilityLabel="Profile photo"
      />
    );
  }

  return (
    <View style={[box, styles.center]}>
      {initial ? (
        <Text style={{ color: colors.primary, fontSize: size * 0.42, fontWeight: '800' }}>{initial}</Text>
      ) : (
        <UserIcon size={size * 0.42} color={colors.textMuted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
