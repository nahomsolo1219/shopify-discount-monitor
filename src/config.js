require('dotenv').config();

// Shopify supports each Admin API version for at least 12 months. When a
// pinned version is retired, Shopify silently serves the oldest supported
// version instead, and response formats can change underneath us. Keep this
// on a current stable release and bump it at least once a year.
// Override at deploy time with SHOPIFY_API_VERSION.
const DEFAULT_SHOPIFY_API_VERSION = '2026-10';
const DEFAULT_POLL_INTERVAL_MINUTES = 5;

const API_VERSION_RE = /^(\d{4}-(01|04|07|10)|unstable)$/;

function resolveApiVersion(env = process.env) {
  const raw = (env.SHOPIFY_API_VERSION || '').trim();
  if (!raw) return DEFAULT_SHOPIFY_API_VERSION;
  if (!API_VERSION_RE.test(raw)) {
    console.warn(
      `[Config] SHOPIFY_API_VERSION="${raw}" is not a valid Shopify API version ` +
        `(expected YYYY-01/04/07/10); using ${DEFAULT_SHOPIFY_API_VERSION}`
    );
    return DEFAULT_SHOPIFY_API_VERSION;
  }
  return raw;
}

function resolvePollInterval(env = process.env) {
  const n = parseInt(env.POLL_INTERVAL_MINUTES, 10);
  // node-cron's */N minute step only makes sense for 1-59
  if (!Number.isFinite(n) || n < 1 || n > 59) return DEFAULT_POLL_INTERVAL_MINUTES;
  return n;
}

const required = ['SHOPIFY_STORE', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'DISCORD_WEBHOOK_URL', 'APP_URL'];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  shopifyStore: process.env.SHOPIFY_STORE,
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID,
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  shopifyScopes: process.env.SHOPIFY_SCOPES || 'read_price_rules,read_discounts',
  appUrl: process.env.APP_URL.replace(/\/+$/, ''), // strip trailing slash
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  pollIntervalMinutes: resolvePollInterval(),
  port: parseInt(process.env.PORT, 10) || 3000,
  highValueThreshold: parseFloat(process.env.HIGH_VALUE_THRESHOLD) || 500,
  shopifyApiVersion: resolveApiVersion(),
  DEFAULT_SHOPIFY_API_VERSION,
  DEFAULT_POLL_INTERVAL_MINUTES,
  resolveApiVersion,
  resolvePollInterval,
};
