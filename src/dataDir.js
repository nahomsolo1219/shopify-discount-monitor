const fs = require('fs');
const path = require('path');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Directory for persistent state (known price rules, OAuth token).
 * Resolved on every call so tests and late env changes are honoured.
 *
 * Priority: DATA_DIR, then RAILWAY_VOLUME_MOUNT_PATH (set automatically by
 * Railway when a volume is attached), then ./data.
 */
function getDataDir(env = process.env) {
  const dir = env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH || DEFAULT_DATA_DIR;
  return path.resolve(dir);
}

function ensureDataDir(dir = getDataDir()) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Write via a temp file + rename so a crash mid-write can't leave a
 * truncated file (a corrupt store would otherwise look like "all rules new").
 */
function writeFileAtomic(file, contents) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
}

module.exports = { getDataDir, ensureDataDir, writeFileAtomic, DEFAULT_DATA_DIR };
