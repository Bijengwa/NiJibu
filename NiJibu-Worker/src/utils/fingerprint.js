import * as LocalAuthentication from 'expo-local-authentication';
import { USE_MOCK_PROVIDER } from '../config';

// Asks for the fingerprint of the phone. Returns '' when it worked, or an error code.
// Demo: this only proves somebody is holding the phone. The real check is made by NIDA.
export async function scanFingerprint(t) {
  const hasSensor = await LocalAuthentication.hasHardwareAsync();
  const enrolled = hasSensor && (await LocalAuthentication.isEnrolledAsync());
  if (enrolled) {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: t('fingerPrompt'),
      cancelLabel: t('cancel'),
      disableDeviceFallback: true,
    });
    return r.success ? '' : 'FINGERPRINT_FAILED';
  }
  return USE_MOCK_PROVIDER ? '' : 'FINGERPRINT_UNAVAILABLE'; // demo without a sensor: simulated
}
