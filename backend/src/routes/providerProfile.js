// The fundi's own profile for the Worker app: details, NIDA documents, payout.
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validLat, validLng } = require('../lib/geo');
const { providerView } = require('../lib/providerView');
const secret = require('../lib/secret');
const nida = require('../services/nida');

const NIDA_DIR = path.join(__dirname, '../../private/nida'); // never served as static files
const MAX_SERVICES = 5;
const NETWORKS = ['mpesa', 'mixx', 'airtel', 'halopesa'];
const EXPERIENCE = ['lt1', '1-3', '3-5', '5-10', '10+'];
const AVAILABILITY = ['weekdays', 'weekends', 'always'];

const bad = (res, msg = 'Bad request') => res.status(400).json({ error: msg, code: 'VALIDATION' });
const str = (v, max) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|heic)$/.test(file.mimetype)),
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    res.json({ provider: await providerView(req.user.id) });
  } catch (e) {
    next(e);
  }
});

// Save services, work place, experience, availability (creates the provider profile if needed)
router.put('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const slugs = [...new Set(Array.isArray(b.services) ? b.services : [])];
    if (!slugs.length || slugs.length > MAX_SERVICES || !slugs.every((s) => typeof s === 'string')) return bad(res, 'Choose your services');
    if (!validLat(b.lat) || !validLng(b.lng)) return bad(res, 'Work place is required');
    if (!EXPERIENCE.includes(b.experience) || !AVAILABILITY.includes(b.availability)) return bad(res);
    const rows = await db('services').whereIn('slug', slugs).where({ active: true }).select('id');
    if (rows.length !== slugs.length) return bad(res, 'Unknown service');

    await db.transaction(async (trx) => {
      let p = await trx('provider_profiles').where({ user_id: req.user.id }).first();
      const fields = {
        work_lat: b.lat, work_lng: b.lng, experience: b.experience, availability: b.availability,
        region: str(b.region, 60), district: str(b.district, 60), ward: str(b.ward, 60),
      };
      if (p) await trx('provider_profiles').where({ id: p.id }).update(fields);
      else [p] = await trx('provider_profiles').insert({ user_id: req.user.id, ...fields }).returning('*');
      await trx('provider_services').where({ provider_id: p.id }).del();
      await trx('provider_services').insert(rows.map((r) => ({ provider_id: p.id, service_id: r.id })));
    });
    res.json({ provider: await providerView(req.user.id) });
  } catch (e) {
    next(e);
  }
});

// Save one photo: re-encoded as JPEG (removes hidden data), random private name
async function savePhoto(buf) {
  await fs.promises.mkdir(NIDA_DIR, { recursive: true });
  const name = `${crypto.randomBytes(16).toString('hex')}.jpg`;
  await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(NIDA_DIR, name));
  return name;
}

// NIDA number + selfie + ID photo. Goes to "pending": an admin (or the NIDA service) decides.
router.post('/nida', upload.fields([{ name: 'selfie', maxCount: 1 }, { name: 'id_photo', maxCount: 1 }]), async (req, res, next) => {
  try {
    const number = req.body?.nida_number;
    const selfie = req.files?.selfie?.[0];
    const idPhoto = req.files?.id_photo?.[0];
    if (!/^\d{20}$/.test(number || '') || !selfie || !idPhoto) return bad(res, 'NIDA number, selfie and ID photo are required');

    const p = await db('provider_profiles').where({ user_id: req.user.id }).first();
    if (!p) return bad(res, 'Save your details first');
    const hash = secret.hash(number);
    const taken = await db('provider_profiles').where({ nida_hash: hash }).whereNot({ id: p.id }).first('id');
    if (taken) return res.status(409).json({ error: 'NIDA already used', code: 'NIDA_TAKEN' });

    const selfiePath = await savePhoto(selfie.buffer);
    const idPath = await savePhoto(idPhoto.buffer);
    await db('provider_profiles').where({ id: p.id }).update({
      nida_submitted: true, nida_enc: secret.encrypt(number), nida_hash: hash,
      nida_selfie_path: selfiePath, nida_id_path: idPath,
      verification_status: p.verification_status === 'verified' ? 'verified' : 'pending', rejection_reason: null,
    });
    res.json({ provider: await providerView(req.user.id) });
  } catch (e) {
    next(e);
  }
});

// Fingerprint check against NIDA (test mode: always matches; real NIDA is not connected yet)
router.post('/nida/fingerprint', async (req, res, next) => {
  try {
    const number = req.body?.nida_number;
    if (!/^\d{20}$/.test(number || '')) return bad(res);
    const p = await db('provider_profiles').where({ user_id: req.user.id }).first();
    if (!p) return bad(res, 'Save your details first');
    await nida.fingerprint(number);
    const me = await db('users').where({ id: req.user.id }).first('name');
    await db('provider_profiles').where({ id: p.id }).update({
      nida_submitted: true, nida_enc: secret.encrypt(number), nida_hash: secret.hash(number), nida_name: nida.nameFor(me.name),
      verification_status: 'verified', verified_at: db.fn.now(), rejection_reason: null,
    });
    res.json({ provider: await providerView(req.user.id) });
  } catch (e) {
    next(e);
  }
});

router.put('/payout', async (req, res, next) => {
  try {
    const { network, number } = req.body || {};
    if (!NETWORKS.includes(network) || !/^\d{9}$/.test(String(number || ''))) return bad(res);
    const n = await db('provider_profiles').where({ user_id: req.user.id }).update({ payout_network: network, payout_number: String(number) });
    if (!n) return bad(res, 'Save your details first');
    res.json({ provider: await providerView(req.user.id) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.NIDA_DIR = NIDA_DIR;
