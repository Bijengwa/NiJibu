// Region -> district -> ward.
//
// SAMPLE DATA for the first area (north Dar es Salaam). The app asks the server first
// (GET /api/locations). This list is only the fallback: replace it with the official list.
const wards = (names) => names.map((n) => ({ value: n.toLowerCase().replace(/\s+/g, '_'), label: n }));

export const SAMPLE_LOCATIONS = {
  regions: [
    {
      value: 'dar_es_salaam',
      label: 'Dar es Salaam',
      districts: [
        {
          value: 'kinondoni',
          label: 'Kinondoni',
          wards: wards(['Tegeta', 'Kunduchi', 'Bunju', 'Wazo', 'Mbweni', 'Mabwepande', 'Kawe', 'Mikocheni', 'Msasani', 'Mwananyamala']),
        },
        {
          value: 'ubungo',
          label: 'Ubungo',
          wards: wards(['Mbezi', 'Kimara', 'Kibamba', 'Goba', 'Saranga', 'Sinza', 'Ubungo', 'Mabibo']),
        },
      ],
    },
  ],
};
