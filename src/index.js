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

  console.log(`[${label}] Fetching price rules from Shopify...`);

  try {
    const currentRules = await shopify.fetchAllPriceRules();
    const storedRules = store.load();

    const { added, edited, deleted } = store.diff(storedRules, currentRules);

    console.log(
      `[${label}] Found ${Object.keys(currentRules).length} price rules — ` +
        `${added.length} new, ${edited.length} edited, ${deleted.length} deleted`
    );

    if (!silent) {
      for (const rule of added) {
        await discord.notifyNew(rule);
      }
      for (const { rule, changes } of edited) {
        await discord.notifyEdited(rule, changes);
      }
      for (const rule of deleted) {
        await discord.notifyDeleted(rule);
      }
    } else {
      console.log('[Initial sync] Loaded existing price rules into store (no notifications sent)');
    }

    store.save(currentRules);
    lastPollTime = shopify.formatLastPoll();
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
