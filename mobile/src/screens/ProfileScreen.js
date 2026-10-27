import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../api/me';
import Avatar from '../components/Avatar';
import Field from '../components/Field';
import { CameraIcon, MailIcon, PhoneIcon, UserIcon } from '../components/Icons';
import ScreenHeader from '../components/ScreenHeader';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../utils/errors';
import { validateEmail, validateFullName } from '../utils/validation';

export default function ProfileScreen({ onBack }) {
  const { colors, t } = useSettings();
  const { user, token, updateUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [errors, setErrors] = useState({}); // translation keys / API codes
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const emailRef = useRef(null);

  const p = user?.phone?.slice(3) ?? '';
  const phone = `+255 ${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

  const changed =
    name.trim().replace(/\s+/g, ' ') !== (user?.name || '') ||
    email.trim().toLowerCase() !== (user?.email || '');

  // ---- photo (cropped 1:1 by the picker, and again by the server) ----
  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    setPhotoBusy(true);
    setErrors((e) => ({ ...e, photo: '' }));
    try {
      const r = await api.uploadAvatar(token, result.assets[0]);
      updateUser(r.user);
    } catch (e) {
      setErrors((x) => ({ ...x, photo: e.code || 'UNKNOWN' }));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      const r = await api.removeAvatar(token);
      updateUser(r.user);
    } catch (e) {
      setErrors((x) => ({ ...x, photo: e.code || 'UNKNOWN' }));
    } finally {
      setPhotoBusy(false);
    }
  };

  const photoMenu = () => {
    const buttons = [{ text: user?.avatar_url ? t('changePhoto') : t('choosePhoto'), onPress: pickPhoto }];
    if (user?.avatar_url) buttons.push({ text: t('removePhoto'), style: 'destructive', onPress: removePhoto });
    buttons.push({ text: t('cancel'), style: 'cancel' });
    Alert.alert(t('profilePhoto'), undefined, buttons);
  };

  // ---- name + email ----
  const save = async () => {
    if (saving) return;
    const next = { name: validateFullName(name), email: validateEmail(email) };
    setErrors(next);
    if (next.name || next.email) return;

    setSaving(true);
    setSavedMsg(false);
    try {
      const r = await api.updateProfile(token, { name, email });
      updateUser(r.user);
      setName(r.user.name);
      setEmail(r.user.email);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch (e) {
      if (e.code === 'NAME_INVALID') setErrors({ name: 'nameInvalid' });
      else if (e.code === 'EMAIL_INVALID') setErrors({ email: 'emailInvalid' });
      else if (e.code === 'EMAIL_TAKEN') setErrors({ email: 'EMAIL_TAKEN' });
      else setErrors({ form: e.code || 'UNKNOWN' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior="padding">
      <ScreenHeader title={t('profile')} onBack={onBack} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left + 20,
          paddingRight: insets.right + 20,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Photo */}
        <Pressable onPress={photoMenu} disabled={photoBusy} style={styles.photoWrap} accessibilityRole="button" accessibilityLabel={t('changePhoto')}>
          <Avatar user={user} size={112} />
          <View style={[styles.camera, { backgroundColor: colors.primary, borderColor: colors.background }]}>
            {photoBusy ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <CameraIcon size={16} color={colors.onPrimary} />}
          </View>
        </Pressable>
        {!!errors.photo && <Text style={[styles.photoError, { color: colors.error }]}>{errorMessage(t, errors.photo)}</Text>}

        {/* Details */}
        <Field
          label={t('profileFullName')}
          icon={<UserIcon size={20} color={colors.textMuted} />}
          value={name}
          onChangeText={setName}
          placeholder={t('fullNamePlaceholder')}
          autoCapitalize="words"
          autoComplete="name"
          maxLength={60}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          error={errors.name ? t(errors.name) : ''}
        />
        <Field
          label={t('profileEmail')}
          icon={<MailIcon size={20} color={colors.textMuted} />}
          inputRef={emailRef}
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          maxLength={254}
          returnKeyType="done"
          onSubmitEditing={save}
          error={errors.email ? t(errors.email) : ''}
        />

        <View style={[styles.phoneBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <PhoneIcon size={20} color={colors.textMuted} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.phoneLabel, { color: colors.textMuted }]}>{t('phone')}</Text>
            <Text style={[styles.phoneValue, { color: colors.text }]}>{phone}</Text>
          </View>
        </View>

        {!!errors.form && <Text style={[styles.formError, { color: colors.error }]}>{errorMessage(t, errors.form)}</Text>}

        <Pressable
          onPress={save}
          disabled={saving || !changed}
          style={[styles.button, { backgroundColor: colors.primary, opacity: saving || !changed ? 0.5 : 1 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
            {saving ? t('saving') : savedMsg ? t('saved') : t('save')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  photoWrap: { alignSelf: 'center', marginBottom: 8 },
  camera: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoError: { textAlign: 'center', fontSize: 13, marginTop: 6 },
  phoneBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14, opacity: 0.8 },
  phoneLabel: { fontSize: 12 },
  phoneValue: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  formError: { textAlign: 'center', fontSize: 14, marginTop: 16 },
  button: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontSize: 18, fontWeight: '700' },
});
