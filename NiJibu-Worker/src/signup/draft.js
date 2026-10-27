import { getItem, removeItem, setItem } from '../storage';

// What the fundi typed before the account existed (names, NIDA number).
// Kept on the phone until the phone number is confirmed with the code; then it is sent to the server.
// The password is never kept here.
const KEY = 'workerSignupDraft';
let memory = null;

export async function saveDraft(d) {
  memory = d;
  await setItem(KEY, JSON.stringify(d));
}

export async function loadDraft() {
  if (memory) return memory;
  try {
    const raw = await getItem(KEY);
    memory = raw ? JSON.parse(raw) : null;
  } catch {
    memory = null;
  }
  return memory;
}

export async function clearDraft() {
  memory = null;
  await removeItem(KEY);
}
