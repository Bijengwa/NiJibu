import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../api/me';
import Field from '../components/Field';
import ConfirmModal from '../components/ConfirmModal';
import { EyeIcon, EyeOffIcon, LockIcon, TrashIcon } from '../components/Icons';
import ScreenHeader from '../components/ScreenHeader';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../utils/errors';

export default function DeleteAccountScreen({ onBack }) {
  const { colors, t } = useSettings();
  const { token, clearSession } = useAuth();
  const insets = useSafeAreaInsets();

  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ask, setAsk] = useState(false);

  const doDelete = async () => {
    setLoading(true);
    try {
      await api.deleteAccount(token, password);
      await clearSession(); // account is gone -> back to the login screen
    } catch (e) {
      setError(e.code || 'UNKNOWN');
      setLoading(false);
    }
  };

  const submit = () => {
    if (loading) return;
    if (!password) return setError('passwordRequired');
    setError('');
    setAsk(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior="padding">
      <ScreenHeader title={t('deleteAccount')} onBack={onBack} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left + 20,
          paddingRight: insets.right + 20,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={[styles.warning, { color: colors.text }]}>{t('deleteAccountBody')}</Text>

        <Field
          label={t('password')}
          icon={<LockIcon size={20} color={colors.textMuted} />}
          right={
            <Pressable onPress={() => setShow((s) => !s)} hitSlop={12} accessibilityRole="button" accessibilityLabel={show ? t('hidePassword') : t('showPassword')}>
              {show ? <EyeOffIcon color={colors.textMuted} /> : <EyeIcon color={colors.textMuted} />}
            </Pressable>
          }
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          returnKeyType="done"
          onSubmitEditing={submit}
          error={error ? errorMessage(t, error) : ''}
        />

        <Pressable
          onPress={submit}
          disabled={loading}
          style={[styles.button, { backgroundColor: colors.error, opacity: loading ? 0.6 : 1 }]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{loading ? t('pleaseWait') : t('deleteAccount')}</Text>
        </Pressable>
      </ScrollView>

      <ConfirmModal
        visible={ask}
        danger
        Icon={TrashIcon}
        title={t('deleteAccountTitle')}
        body={t('deleteAccountBody')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onCancel={() => setAsk(false)}
        onConfirm={() => {
          setAsk(false);
          doDelete();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  warning: { fontSize: 15, lineHeight: 22, marginBottom: 6 },
  button: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
