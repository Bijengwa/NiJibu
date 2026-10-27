// TEST MODE: fake customer requests so the "Requests" screen can be tried before the server exists.
const SAMPLES = [
  { service: 'bomba', customer_name: 'Amina J.', area: 'Kunduchi', landmark: 'Near Mtongani market', lat: -6.6613, lng: 39.2127, distance_km: 1.2, note: 'Bomba la jikoni linavuja' },
  { service: 'dobi', customer_name: 'Hassan A.', area: 'Tegeta', landmark: 'Near the main road', lat: -6.6489, lng: 39.1533, distance_km: 2.8, note: 'Nguo za wiki nzima, kufua na kupiga pasi' },
  { service: 'viatu', customer_name: 'Neema J.', area: 'Mbezi Beach', landmark: 'Near the junction', lat: -6.7197, lng: 39.2161, distance_km: 3.5, note: 'Viatu viwili vya ngozi, soli imeachia' },
];

let online = false;
let nextAt = 0;
let counter = 0;
let items = []; // { ...request }

const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));

function generate() {
  const s = SAMPLES[counter % SAMPLES.length];
  counter += 1;
  items.push({ id: `demo-${counter}`, ...s, status: 'new', created_at: new Date().toISOString() });
}

// The phone and the exact place are hidden until the request is accepted
const view = (r) => {
  if (r.status !== 'new') return { ...r, customer_phone: '255712000111' };
  const { lat, lng, ...rest } = r;
  return rest;
};

let position = null; // last live position of the fundi (test mode keeps it in memory)
export const setPosition = async (c) => {
  position = c;
  return { ok: true };
};

export async function setOnline(value, coords) {
  await wait();
  online = value;
  if (coords) position = coords;
  if (online) nextAt = Date.now() + 4000;
  else items = items.filter((r) => r.status !== 'new');
  return { ok: true };
}

export async function list() {
  await wait(150);
  const open = items.filter((r) => r.status === 'new').length;
  if (online && open < 3 && Date.now() >= nextAt) {
    generate();
    nextAt = Date.now() + 45000;
  }
  return { requests: items.filter((r) => r.status !== 'done').map(view) };
}

const find = (id) => items.find((r) => r.id === id);

export async function accept(id) {
  await wait();
  const r = find(id);
  if (r) r.status = 'accepted';
  return { request: view(r) };
}

export async function decline(id) {
  await wait(200);
  items = items.filter((r) => r.id !== id);
  return { ok: true };
}

export async function complete(id) {
  await wait();
  const r = find(id);
  if (r) {
    r.status = 'done';
    r.done_at = new Date().toISOString();
  }
  return { request: view(r) };
}

// Testing only: make a request appear now
export function simulate() {
  nextAt = 0;
  generate();
}

// Finished jobs (history)
export const doneJobs = () => items.filter((r) => r.status === 'done').map(view);
