import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSettings } from '../context/SettingsContext';
import Button from './Button';
import { CameraIcon } from './Icons';

// Takes a NEW photo with the camera (no gallery), so the selfie and ID are fresh.
//   camera: 'front' (selfie, round preview) | 'back' (ID card, wide preview)
//   asset : { uri, mimeType } | null
export default function PhotoField({ label, help, camera, asset, onChange, error }) {
  const { colors, t } = useSettings();
  const [denied, setDenied] = useState(false);
  const round = camera === 'front';

  const take = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setDenied(true);
      return;
    }
    setDenied(false);
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: round ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!r.canceled && r.assets?.[0]) onChange(r.assets[0]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.help, { color: colors.textMuted }]}>{help}</Text>

      <Pressable
        onPress={take}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.frame,
          round ? styles.round : styles.wide,
          { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border },
        ]}
      >
        {asset ? (
          <Image source={{ uri: asset.uri }} style={styles.image} resizeMode="cover" />
        ) : (
          <CameraIcon size={36} color={colors.textMuted} />
        )}
      </Pressable>

      <Button title={asset ? t('retakePhoto') : t('takePhoto')} variant="secondary" onPress={take} style={styles.btn} />
      {denied ? <Text style={[styles.error, { color: colors.error }]}>{t('cameraDenied')}</Text> : null}
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 22 },
  label: { fontSize: 14, fontWeight: '600' },
  help: { fontSize: 13, marginTop: 2, marginBottom: 10 },
  frame: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  round: { width: 170, height: 170, borderRadius: 85, alignSelf: 'center' },
  wide: { height: 180, borderRadius: 12 },
  image: { width: '100%', height: '100%' },
  btn: { marginTop: 12, height: 46 },
  error: { fontSize: 13, marginTop: 6 },
});
