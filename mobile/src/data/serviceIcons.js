// Line icons (24x24, stroke only) for each job. No emojis anywhere in the apps: only these SVG paths.
// One job = a list of path strings. The same data is used by the app (ServiceIcon) and by the map pins.
export const SERVICE_ICON_PATHS = {
  dobi: ['M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z'],
  'fundi-bomba': ['M12 2.7s6 6.3 6 10.3a6 6 0 0 1-12 0c0-4 6-10.3 6-10.3z'],
  'fundi-umeme': ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  'fundi-viatu': ['M2 18v-5l5-2 1-4h3l1 3 4 1.5c2.2.9 4 2.3 4 4.5V18H2z', 'M2 20.5h20'],
  'fundi-seremala': ['M13.5 10.5 4.5 19.5', 'M12 8.5 16.5 4 20 7.5 15.5 12z'],
  'fundi-rangi': ['M5 3h12a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M18 5.5h2a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1h-8v3', 'M10 14h4v6.5a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5z'],
  'fundi-simu': ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01'],
  'fundi-friji': ['M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z', 'M5 10h14', 'M9 6v1.5', 'M9 13v3'],
  usafi: ['M19 3 12.5 9.5', 'M9.5 9.5l5 5', 'M3 21c0-4.5 2.5-7.5 6.5-11.5l5 5C10.5 19 7.5 21 3 21z'],
  'fundi-magari': ['M5 17H3v-5l2-5h14l2 5v5h-2', 'M3 12h18', 'M5.5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0', 'M14.5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0', 'M9.5 17h5'],
};

// A job the app does not know yet (added later by the admin): a wrench
export const DEFAULT_ICON_PATHS = [
  'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
];

export const iconPathsOf = (slug) => SERVICE_ICON_PATHS[slug] ?? DEFAULT_ICON_PATHS;
