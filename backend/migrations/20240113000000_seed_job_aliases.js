// The words customers type for the first jobs used to be hard-coded in the customer app.
// They now live in the database (services.aliases), so the admin can change them and the app reads only server data.
const WORDS = {
  dobi: ['dobi', 'laundry', 'kufua', 'nguo', 'washing', 'pasi', 'iron', 'kufulia'],
  'fundi-bomba': ['bomba', 'fundi bomba', 'plumber', 'plumbing', 'maji', 'water', 'pipe', 'mabomba', 'tap', 'leak', 'choo'],
  'fundi-umeme': ['umeme', 'fundi umeme', 'electrician', 'electric', 'taa', 'waya', 'wiring', 'socket', 'swichi', 'tanesco'],
  'fundi-viatu': ['viatu', 'fundi viatu', 'shoe', 'shoes', 'cobbler', 'kushona viatu', 'sandals', 'sandali'],
  'fundi-seremala': ['seremala', 'fundi seremala', 'carpenter', 'mbao', 'wood', 'furniture', 'samani', 'mlango', 'door', 'kitanda'],
  'fundi-rangi': ['rangi', 'fundi rangi', 'painter', 'paint', 'kupaka', 'ukuta', 'wall'],
  'fundi-simu': ['simu', 'fundi simu', 'phone', 'phone repair', 'screen', 'kioo', 'betri', 'battery'],
  'fundi-friji': ['friji', 'fridge', 'tv', 'televisheni', 'television', 'jokofu', 'freezer', 'microwave'],
  usafi: ['usafi', 'cleaning', 'clean', 'kusafisha', 'nyumba', 'house', 'mopping', 'kudeki'],
  'fundi-magari': ['gari', 'magari', 'fundi magari', 'mechanic', 'car', 'garage', 'engine', 'injini'],
};

// Postgres array literal: {"a b","c"}
const literal = (words) => `{${words.map((w) => `"${w}"`).join(',')}}`;

exports.up = async (knex) => {
  for (const [slug, words] of Object.entries(WORDS)) {
    await knex.raw('update services set aliases = array(select distinct unnest(aliases || ?::text[])) where slug = ?', [literal(words), slug]);
  }
};

exports.WORDS = WORDS; // the seed uses the same words for a fresh database
exports.down = async () => {}; // the words stay: removing only these would also remove words the admin added
