import { formatDob, validateAnswer as validateText, validateDob, validateNamePart } from '../utils/validation';

// Questions NIDA keeps in its record. The worker answers ONE per NIDA hit, and the second hit (only for
// corrections) asks a different one. The server checks that a question is not repeated.
export const MAX_HITS = 2;

export const POOL = [
  { id: 'dob', type: 'date', label: 'nidaDob' },
  { id: 'fatherMiddle', type: 'name', label: 'fatherMiddle' },
  { id: 'motherMiddle', type: 'name', label: 'motherMiddle' },
];

// A random question that was not asked yet in this try
export function pickQuestion(asked = []) {
  const left = POOL.filter((q) => !asked.includes(q.id));
  return left[Math.floor(Math.random() * left.length)];
}

// Returns '' or a translation key
export function validateInput(q, value) {
  return q.type === 'date' ? validateDob(value) : q.type === 'name' ? validateNamePart(value) : validateText(value);
}

// What is sent to the server
export const toAnswer = (q, value) => (q.type === 'date' ? formatDob(value) : String(value).trim());
