require('dotenv').config();

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
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 5,
  port: parseInt(process.env.PORT, 10) || 3000,
  highValueThreshold: parseFloat(process.env.HIGH_VALUE_THRESHOLD) || 500,
  shopifyApiVersion: '2024-10',
  bulkCodeThreshold: parseInt(process.env.BULK_CODE_THRESHOLD, 10) || 10,
};
