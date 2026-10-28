import { TEST_MODE } from '../config';
import { formatDob, validateAnswer as validateText, validateDob, validateNamePart } from '../utils/validation';

// Questions that NIDA keeps in its record. The fundi gets a few at random, one at a time.
// A real server picks the questions and keeps the count, so the app cannot cheat.
export const NEED = 5; // correct answers in a row to pass
export const MAX = TEST_MODE ? 6 : 8; // most questions one fundi can attempt (demo: 6 = 1 wrong + 5 right, same as the server)

export const POOL = [
  { id: 'dob', type: 'date', label: 'nidaDob' },
  { id: 'birthRegion', type: 'region', label: 'birthRegion' },
  { id: 'birthDistrict', type: 'text', label: 'birthDistrict' },
  { id: 'motherFirst', type: 'name', label: 'motherFirst' },
  { id: 'motherMiddle', type: 'name', label: 'motherMiddle' },
  { id: 'motherLast', type: 'name', label: 'motherLast' },
  { id: 'fatherFirst', type: 'name', label: 'fatherFirst' },
  { id: 'fatherMiddle', type: 'name', label: 'fatherMiddle' },
  { id: 'primarySchool', type: 'text', label: 'primarySchool' },
  { id: 'primaryYear', type: 'year', label: 'primaryYear' },
];

// A random order of MAX questions out of the pool
export function pickQuestions() {
  const a = [...POOL];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, MAX);
}

// Returns '' or a translation key
export function validateInput(q, value) {
  switch (q.type) {
    case 'date': return validateDob(value);
    case 'region': return value ? '' : 'required';
    case 'name': return validateNamePart(value);
    case 'year': return /^\d{4}$/.test(value) && Number(value) <= new Date().getFullYear() && Number(value) >= 1940 ? '' : 'YEAR_INVALID';
    default: return validateText(value);
  }
}

// What is sent to the server
export const toAnswer = (q, value) => (q.type === 'date' ? formatDob(value) : String(value).trim());

// After an answer: { streak, asked, result: 'pass' | 'fail' | null }
export function advance({ streak, asked }, correct) {
  const s = correct ? streak + 1 : 0;
  const n = asked + 1;
  if (s >= NEED) return { streak: s, asked: n, result: 'pass' };
  // fail when all tries are used or 5 in a row can no longer be reached
  if (n >= MAX || MAX - n < NEED - s) return { streak: s, asked: n, result: 'fail' };
  return { streak: s, asked: n, result: null };
}
