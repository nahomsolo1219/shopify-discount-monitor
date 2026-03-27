const express = require('express');
const cron = require('node-cron');
const config = require('./config');
const shopify = require('./shopify');
const discord = require('./discord');
const store = require('./store');
const { isTokenAvailable } = require('./token');
const auth = require('./auth');

const app = express();
let lastPollTime = null;
let isFirstRun = true;
let cronJob = null;

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'shopify-discount-monitor',
    authorized: isTokenAvailable(),
    lastPoll: lastPollTime,
    pollInterval: `${config.pollIntervalMinutes} minutes`,
  });
});

async function poll() {
  if (!isTokenAvailable()) {
    console.log('[Poll] No token available, skipping');
    return;
  }

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

function startPolling() {
  if (cronJob) return; // already running

  console.log(`Starting poll cycle (every ${config.pollIntervalMinutes} minutes)`);

  // Run initial poll
  poll();

  // Schedule recurring polls
  const cronExpression = `*/${config.pollIntervalMinutes} * * * *`;
  cronJob = cron.schedule(cronExpression, () => {
    poll();
  });
}

// Register OAuth routes — onTokenAcquired callback starts polling after auth
auth.registerRoutes(app, () => {
  console.log('[Auth] Token acquired, starting polling');
  startPolling();
});

// On startup, check if we already have a token
if (isTokenAvailable()) {
  console.log('Existing token found, starting polling');
  startPolling();
} else {
  console.log(`No Shopify token found. Visit ${config.appUrl}/auth to authorize the app.`);
}

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
