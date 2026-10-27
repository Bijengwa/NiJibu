// Same services and keys as the customer app (V1): dobi, bomba, viatu.
// A fundi can offer one or more.
export const SERVICES = [
  { key: 'dobi', emoji: '🧺', name: 'svcDobi', sub: 'svcDobiSub' },
  { key: 'bomba', emoji: '🔧', name: 'svcPlumber', sub: 'svcPlumberSub' },
  { key: 'viatu', emoji: '👞', name: 'svcShoe', sub: 'svcShoeSub' },
];

export const getService = (key) => SERVICES.find((s) => s.key === key);
