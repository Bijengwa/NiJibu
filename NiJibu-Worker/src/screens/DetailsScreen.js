import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import Field from '../components/Field';
import FormScreen from '../components/FormScreen';
import { CloseIcon, EditIcon, MailIcon, UserIcon } from '../components/Icons';
import LocationPicker from '../components/LocationPicker';
import Select from '../components/Select';
import { useAuth } from '../context/AuthContext';
import { useProvider } from '../context/ProviderContext';
import { useSettings } from '../context/SettingsContext';
import { AVAILABILITY, EXPERIENCE } from '../data/options';
import { useServices } from '../context/ServicesContext';
import { errorMessage } from '../utils/errors';
import { validateEmail, validateFullName } from '../utils/validation';

const MAX_JOBS = 5; // same limit as the server

// Step 2 of 4: name, jobs (each with its own experience), availability, work place
//   Jobs come from a fixed list. A job that is not in the list can be written; an admin adds it to the list.
//   Availability: the same for all jobs, or one per job.
// onDone: called after saving (the app then shows the next step)   onBack: shown when there is a screen to go back to
export default function DetailsScreen({ onDone, onBack }) {
  const { colors, t } = useSettings();
  const { logout } = useAuth();
  const { provider, saveDetails } = useProvider();
  const { services: allServices, error: servicesError, reload: reloadServices } = useServices();

  const saved = provider?.service_details ?? [];
  const savedOthers = provider?.other_jobs ?? [];
  const fromSaved = (field) =>
    Object.fromEntries([...saved.map((d) => [d.key, d[field] || '']), ...savedOthers.map((o) => [`x:${o.name}`, o[field] || ''])]);

  const [name, setName] = useState(provider?.full_name ?? '');
  const [email, setEmail] = useState(provider?.email ?? '');
  const [services, setServices] = useState(provider?.services ?? []); // keys from the list
  const [others, setOthers] = useState(savedOthers.map((o) => o.name)); // jobs written by hand
  const [otherText, setOtherText] = useState('');
  const [place, setPlace] = useState(provider?.lat != null ? { lat: provider.lat, lng: provider.lng } : null);
  const [exp, setExp] = useState(fromSaved('experience')); // { jobId: value }
  const [avail, setAvail] = useState(fromSaved('availability'));
  const [sameAvail, setSameAvail] = useState(() => new Set(Object.values(fromSaved('availability')).filter(Boolean)).size <= 1);
  const [commonAvail, setCommonAvail] = useState(() => Object.values(fromSaved('availability')).find(Boolean) || '');
  const [errors, setErrors] = useState({}); // values are translation keys
  const [loading, setLoading] = useState(false);

  const jobs = [
    ...services.map((k) => {
      const s = allServices.find((x) => x.key === k);
      return { id: k, label: s ? s.label : k, listed: true };
    }),
    ...others.map((n) => ({ id: `x:${n}`, label: n, listed: false, name: n })),
  ];
  const oneAvail = sameAvail && jobs.length > 1; // a single availability for all

  const clear = (key) => setErrors((e) => ({ ...e, [key]: '', form: '' }));

  const addOther = () => {
    const n = otherText.trim().replace(/\s+/g, ' ');
    if (!n) return;
    if (n.length < 3 || n.length > 60) return setErrors((e) => ({ ...e, other: 'required' }));
    if (jobs.length >= MAX_JOBS) return setErrors((e) => ({ ...e, other: 'jobsLimit' }));
    if (!others.some((x) => x.toLowerCase() === n.toLowerCase())) setOthers([...others, n]);
    setOtherText('');
    clear('other');
  };

  const submit = async () => {
    if (loading) return;
    const next = {
      name: validateFullName(name),
      email: validateEmail(email),
      services: jobs.length ? '' : 'required',
      place: place ? '' : 'locationRequired',
    };
    for (const j of jobs) {
      next[`exp:${j.id}`] = exp[j.id] ? '' : 'required';
      next[`av:${j.id}`] = (oneAvail ? commonAvail : avail[j.id]) ? '' : 'required';
    }
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const pick = (j) => ({ experience: exp[j.id], availability: oneAvail ? commonAvail : avail[j.id] });
    setLoading(true);
    try {
      await saveDetails({
        full_name: name.trim().replace(/\s+/g, ' '),
        email: email.trim().toLowerCase(),
        services: jobs.filter((j) => j.listed).map((j) => ({ key: j.id, ...pick(j) })),
        other_jobs: jobs.filter((j) => !j.listed).map((j) => ({ name: j.name, ...pick(j) })),
        lat: place.lat,
        lng: place.lng,
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
  const setFor = (setter, id, key) => (v) => {
    setter((m) => ({ ...m, [id]: v }));
    clear(key);
  };
  const removeOther = (n) => setOthers(others.filter((x) => x !== n));

  const expChoices = EXPERIENCE.map((o) => ({ value: o.value, label: t(o.label) }));
  const availChoices = AVAILABILITY.map((o) => ({ value: o.value, label: t(o.label) }));

  return (
    <FormScreen title={t('detailsTitle')} subtitle={t('detailsSubtitle')} onBack={onBack}>
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

      {!!servicesError && !allServices.length && (
        <Button title={`${errorMessage(t, servicesError)} · ${t('refresh')}`} variant="secondary" onPress={reloadServices} />
      )}
      <Select
        multiple
        label={t('servicesLabel')}
        placeholder={t('servicesPlaceholder')}
        choices={allServices.map((s) => ({ value: s.key, label: s.label }))}
        value={services}
        onChange={(v) => {
          if (v.length + others.length > MAX_JOBS) return setErrors((e) => ({ ...e, services: 'jobsLimit' }));
          set(setServices, 'services')(v);
        }}
        error={err('services')}
      />

      {/* A job that is not in the list: written by hand, added to the list later by an admin */}
      <Field
        label={t('otherJobLabel')}
        value={otherText}
        onChangeText={(v) => {
          setOtherText(v);
          clear('other');
        }}
        placeholder={t('otherJobPlaceholder')}
        autoCapitalize="sentences"
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={addOther}
        right={
          <Pressable onPress={addOther} hitSlop={10} accessibilityRole="button">
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>{t('addJob')}</Text>
          </Pressable>
        }
        error={err('other')}
      />
      <Text style={[styles.help, { color: colors.textMuted }]}>{t('otherJobHelp')}</Text>
      {others.map((n) => (
        <View key={n} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <EditIcon size={16} color={colors.textMuted} />
          <Text style={{ color: colors.text, flex: 1, fontSize: 15, marginLeft: 8 }} numberOfLines={1}>{n}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginRight: 10 }}>{t('jobWaiting')}</Text>
          <Pressable onPress={() => removeOther(n)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('removeJob')}>
            <CloseIcon size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}

      {/* Experience for each job */}
      {jobs.map((j) => (
        <Select
          key={`exp:${j.id}`}
          label={`${t('experience')} · ${j.label}`}
          choices={expChoices}
          value={exp[j.id] || ''}
          onChange={setFor(setExp, j.id, `exp:${j.id}`)}
          error={err(`exp:${j.id}`)}
        />
      ))}

      {/* Availability: same for all jobs, or one for each */}
      {jobs.length > 1 && (
        <Select
          label={t('availabilityMode')}
          choices={[
            { value: 'same', label: t('availSame') },
            { value: 'each', label: t('availEach') },
          ]}
          value={sameAvail ? 'same' : 'each'}
          onChange={(v) => setSameAvail(v === 'same')}
        />
      )}
      {oneAvail || jobs.length <= 1 ? (
        <Select
          label={jobs.length > 1 ? t('availAll') : t('availability')}
          choices={availChoices}
          value={(jobs.length === 1 ? avail[jobs[0].id] : commonAvail) || ''}
          onChange={(v) => {
            if (jobs.length === 1) setFor(setAvail, jobs[0].id, `av:${jobs[0].id}`)(v);
            else {
              setCommonAvail(v);
              jobs.forEach((j) => clear(`av:${j.id}`));
            }
          }}
          error={err(`av:${jobs[0]?.id}`)}
        />
      ) : (
        jobs.map((j) => (
          <Select
            key={`av:${j.id}`}
            label={`${t('availability')} · ${j.label}`}
            choices={availChoices}
            value={avail[j.id] || ''}
            onChange={setFor(setAvail, j.id, `av:${j.id}`)}
            error={err(`av:${j.id}`)}
          />
        ))
      )}

      <LocationPicker
        value={place}
        onChange={(c) => {
          setPlace(c);
          setErrors((e) => ({ ...e, place: '' }));
        }}
        error={err('place')}
      />

      {!!errors.form && (
        <Text style={{ color: colors.error, fontSize: 14, textAlign: 'center', marginTop: 16 }}>
          {errorMessage(t, errors.form)}
        </Text>
      )}

      <Button title={loading ? t('pleaseWait') : t('continue')} onPress={submit} loading={loading} style={{ marginTop: 24 }} />
      {!onBack && <Button title={t('logout')} variant="link" onPress={logout} />}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  help: { fontSize: 13, marginTop: -4, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
});
