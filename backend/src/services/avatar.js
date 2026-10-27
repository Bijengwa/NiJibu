const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const DIR = path.join(__dirname, '../../uploads/avatars');

// Re-encodes ANY accepted image to a clean 512x512 square JPEG (1:1, centre crop).
// This also fixes phone rotation, strips EXIF/GPS data, and rejects files that are not real images.
async function saveAvatar(userId, buffer) {
  const out = await sharp(buffer, { limitInputPixels: 40e6, failOn: 'error' })
    .rotate()
    .resize(512, 512, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toBuffer();

  await fs.mkdir(DIR, { recursive: true });
  const name = `${userId}-${crypto.randomBytes(12).toString('hex')}.jpg`; // unguessable, new name every time
  await fs.writeFile(path.join(DIR, name), out);
  return name;
}

async function removeAvatar(name) {
  if (!name) return;
  await fs.unlink(path.join(DIR, path.basename(name))).catch(() => {});
}

module.exports = { saveAvatar, removeAvatar };
