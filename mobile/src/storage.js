import * as SecureStore from 'expo-secure-store';

// Small safe wrapper: storage can fail (e.g. web), the app must still work.
export async function getItem(key) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key, value) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {}
}

export async function removeItem(key) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {}
}
