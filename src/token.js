const fs = require('fs');
const path = require('path');

const { ensureDataDir, writeFileAtomic } = require('./dataDir');

function getTokenFile() {
  return path.join(ensureDataDir(), 'token.json');
}

function loadToken() {
  // Check env var first (persists across Railway redeploys)
  if (process.env.SHOPIFY_ACCESS_TOKEN) {
    return process.env.SHOPIFY_ACCESS_TOKEN;
  }

  // Fall back to local JSON file
  const tokenFile = getTokenFile();
  if (!fs.existsSync(tokenFile)) {
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
    return data.access_token || null;
  } catch {
    console.error('Failed to parse token file');
    return null;
  }
}

function saveToken(token) {
  // Also set in-process env var so loadToken() picks it up immediately
  process.env.SHOPIFY_ACCESS_TOKEN = token;

  // Save to JSON file as fallback for local dev
  writeFileAtomic(
    getTokenFile(),
    JSON.stringify({ access_token: token, saved_at: new Date().toISOString() }, null, 2)
  );
}

function isTokenAvailable() {
  return loadToken() !== null;
}

module.exports = { loadToken, saveToken, isTokenAvailable };
