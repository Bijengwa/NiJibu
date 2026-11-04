// Creates (or promotes) a superadmin account. More staff (customer care) are created in the admin portal, page Staff.
//   npm run create-admin -- 7XXXXXXXX "Full Name"
// The password is typed when asked (not shown, not saved in shell history).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/db');

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    let value = '';
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u0003') process.exit(1);
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

(async () => {
  const digits = String(process.argv[2] ?? '').replace(/\D/g, '');
  const phone = /^\d{9}$/.test(digits) ? `255${digits}` : /^255\d{9}$/.test(digits) ? digits : null;
  const name = (process.argv[3] || 'Admin').trim().slice(0, 100);
  if (!phone) {
    console.error('Usage: npm run create-admin -- 7XXXXXXXX "Full Name"   (phone: 9 digits)');
    process.exit(1);
  }
  const password = await askHidden('Password (8 to 72 characters): ');
  if (password.length < 8 || password.length > 72) {
    console.error('Password must be 8 to 72 characters.');
    process.exit(1);
  }
  const password_hash = await bcrypt.hash(password, 12);
  const existing = await db('users').where({ phone }).first('id');
  if (existing) {
    await db('users').where({ id: existing.id }).update({ role: 'superadmin', disabled_at: null, password_hash, phone_verified_at: db.fn.now(), token_version: db.raw('token_version + 1') });
    console.log(`Updated ${phone} to superadmin.`);
  } else {
    await db('users').insert({ name, phone, password_hash, role: 'superadmin', phone_verified_at: db.fn.now() });
    console.log(`Created superadmin ${phone}.`);
  }
  await db.destroy();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
