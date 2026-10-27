import { useState } from 'react';
import { Text } from 'react-native';
import Button from '../components/Button';
import Field from '../components/Field';
import FormScreen from '../components/FormScreen';
import { MailIcon, UserIcon } from '../components/Icons';
import LocationPicker from '../components/LocationPicker';
import Select from '../components/Select';
import { useAuth } from '../context/AuthContext';
import { useProvider } from '../context/ProviderContext';
import { useSettings } from '../context/SettingsContext';
import { AVAILABILITY, EXPERIENCE } from '../data/options';
import { SERVICES } from '../data/services';
import { errorMessage } from '../utils/errors';
import { validateEmail, validateFullName, validateRequired } from '../utils/validation';

// Step 2 of 4: name, services, area, experience, availability
// onDone: called after saving (the app then shows the next step)
export default function DetailsScreen({ onDone }) {
  const { colors, t } = useSettings();
  const { logout } = useAuth();
  const { provider, saveDetails } = useProvider();

  const [name, setName] = useState(provider?.full_name ?? '');
  const [email, setEmail] = useState(provider?.email ?? '');
  const [services, setServices] = useState(provider?.services ?? []);
  const [place, setPlace] = useState(provider?.lat != null ? { lat: provider.lat, lng: provider.lng } : null);
  const [experience, setExperience] = useState(provider?.experience ?? '');
  const [availability, setAvailability] = useState(provider?.availability ?? '');
  const [errors, setErrors] = useState({}); // values are translation keys
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    const next = {
      name: validateFullName(name),
      email: validateEmail(email),
      services: services.length ? '' : 'required',
      place: place ? '' : 'locationRequired',
      experience: validateRequired(experience),
      availability: validateRequired(availability),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setLoading(true);
    try {
      await saveDetails({
        full_name: name.trim().replace(/\s+/g, ' '),
        email: email.trim().toLowerCase(),
        services,
        lat: place.lat,
        lng: place.lng,
        experience,
        availability,
      });
      onDone();
    } catch (e) {
      setErrors({ form: e.code || 'UNKNOWN' });
      setLoading(false);
    }
  };

  const err = (k) => (errors[k] ? t(errors[k]) : '');
  // Change a value and remove its error message
  const set = (setter, key) => (v) => {
    setter(v);
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  return (
    <FormScreen title={t('detailsTitle')} subtitle={t('detailsSubtitle')}>
      {(
        <>
          <Field
            label={t('fullName')}
            icon={<UserIcon size={20} color={colors.textMuted} />}
            value={name}
            onChangeText={set(setName, 'name')}
            placeholder={t('fullNamePlaceholder')}
            autoCapitalize="words"
            autoComplete="name"
            error={err('name')}
          />

          <Field
            label={t('email')}
            icon={<MailIcon size={20} color={colors.textMuted} />}
            value={email}
            onChangeText={set(setEmail, 'email')}
            placeholder={t('emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            error={err('email')}
          />

          <Select
            multiple
            label={t('servicesLabel')}
            placeholder={t('servicesPlaceholder')}
            choices={SERVICES.map((s) => ({ value: s.key, label: `${s.emoji}  ${t(s.name)}` }))}
            value={services}
            onChange={set(setServices, 'services')}
            error={err('services')}
          />

          <LocationPicker
            value={place}
            onChange={(c) => {
              setPlace(c);
              setErrors((e) => ({ ...e, place: '' }));
            }}
            error={err('place')}
          />

          <Select
            label={t('experience')}
            choices={EXPERIENCE.map((o) => ({ value: o.value, label: t(o.label) }))}
            value={experience}
            onChange={set(setExperience, 'experience')}
            error={err('experience')}
          />
          <Select
            label={t('availability')}
            choices={AVAILABILITY.map((o) => ({ value: o.value, label: t(o.label) }))}
            value={availability}
            onChange={set(setAvailability, 'availability')}
            error={err('availability')}
          />

          {!!errors.form && (
            <Text style={{ color: colors.error, fontSize: 14, textAlign: 'center', marginTop: 16 }}>
              {errorMessage(t, errors.form)}
            </Text>
          )}

          <Button title={loading ? t('pleaseWait') : t('continue')} onPress={submit} loading={loading} style={{ marginTop: 24 }} />
          <Button title={t('logout')} variant="link" onPress={logout} />
        </>
      )}
    </FormScreen>
  );
}
