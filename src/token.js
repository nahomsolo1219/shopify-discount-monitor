const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TOKEN_FILE = path.join(DATA_DIR, 'token.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadToken() {
  ensureDataDir();
  if (!fs.existsSync(TOKEN_FILE)) {
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    return data.access_token || null;
  } catch {
    console.error('Failed to parse token file');
    return null;
  }
}

function saveToken(token) {
  ensureDataDir();
  fs.writeFileSync(
    TOKEN_FILE,
    JSON.stringify({ access_token: token, saved_at: new Date().toISOString() }, null, 2)
  );
}

function isTokenAvailable() {
  return loadToken() !== null;
}

module.exports = { loadToken, saveToken, isTokenAvailable };
