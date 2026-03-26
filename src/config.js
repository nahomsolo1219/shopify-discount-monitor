require('dotenv').config();

const required = ['SHOPIFY_STORE', 'SHOPIFY_ACCESS_TOKEN', 'DISCORD_WEBHOOK_URL'];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  shopifyStore: process.env.SHOPIFY_STORE,
  shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 5,
  port: parseInt(process.env.PORT, 10) || 3000,
  highValueThreshold: parseFloat(process.env.HIGH_VALUE_THRESHOLD) || 500,
  shopifyApiVersion: '2024-10',
};
