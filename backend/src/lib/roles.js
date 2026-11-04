// Who may use the admin portal, and what each staff role may do.
const SUPER = 'superadmin';
const SUPPORT = 'support'; // customer care
const STAFF = [SUPER, SUPPORT];

const isStaff = (role) => STAFF.includes(role);

// Customer care may call only these (method + path inside /api/admin). Everything else needs superadmin.
const SUPPORT_ALLOWED = [
  ['GET', /^\/summary$/],
  ['GET', /^\/events$/],
  ['GET', /^\/me$/],
  ['GET', /^\/series$/],
  ['GET', /^\/people(\/\d+)?$/],
  ['GET', /^\/people\/\d+\/series$/],
  ['GET', /^\/requests(\/\d+)?$/],
  ['GET', /^\/complaints$/],
  ['POST', /^\/complaints\/\d+$/],
  ['GET', /^\/jobs\/(registered|missing)$/],
  ['GET', /^\/(suggestions|searches|search-gaps|providers)$/],
];

const supportMay = (method, path) => SUPPORT_ALLOWED.some(([m, re]) => m === method && re.test(path));

// Pages in the portal each role can open (the portal hides the rest, the server enforces it)
const PAGES = {
  [SUPER]: ['home', 'users', 'jobs', 'requests', 'payments', 'complaints', 'services', 'staff'],
  [SUPPORT]: ['home', 'users', 'jobs', 'requests', 'complaints'],
};

module.exports = { SUPER, SUPPORT, STAFF, isStaff, supportMay, PAGES };
