const express = require('express');
const cron = require('node-cron');
const config = require('./config');
const shopify = require('./shopify');
const discord = require('./discord');
const store = require('./store');

const app = express();
let lastPollTime = null;
let isFirstRun = true;

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'shopify-discount-monitor',
    lastPoll: lastPollTime,
    pollInterval: `${config.pollIntervalMinutes} minutes`,
  });
});

async function poll() {
  const silent = isFirstRun;
  const label = silent ? 'Initial sync' : 'Poll';

  console.log(`[${label}] Fetching discounts from Shopify...`);

  try {
    const currentDiscounts = await shopify.fetchAllDiscounts();
    const storedDiscounts = store.load();

    const { added, edited, deleted } = store.diff(storedDiscounts, currentDiscounts);

    console.log(
      `[${label}] Found ${Object.keys(currentDiscounts).length} discounts — ` +
        `${added.length} new, ${edited.length} edited, ${deleted.length} deleted`
    );

    if (!silent) {
      for (const discount of added) {
        await discord.notifyNew(discount);
      }
      for (const { discount, changes } of edited) {
        await discord.notifyEdited(discount, changes);
      }
      for (const discount of deleted) {
        await discord.notifyDeleted(discount);
      }
    } else {
      console.log('[Initial sync] Loaded existing discounts into store (no notifications sent)');
    }

    store.save(currentDiscounts);
    lastPollTime = new Date().toISOString();
    isFirstRun = false;
  } catch (err) {
    console.error(`[${label}] Error during poll:`, err.message);
  }
}

// Run initial poll on startup
poll();

// Schedule recurring polls
const cronExpression = `*/${config.pollIntervalMinutes} * * * *`;
cron.schedule(cronExpression, () => {
  poll();
});

console.log(`Polling every ${config.pollIntervalMinutes} minutes`);

app.listen(config.port, () => {
  console.log(`Health check server running on port ${config.port}`);
});
