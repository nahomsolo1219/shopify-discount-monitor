const express = require('express');
const cron = require('node-cron');
const config = require('./config');
const shopify = require('./shopify');
const discord = require('./discord');
const store = require('./store');
const { createPoller } = require('./poller');
const { getDataDir } = require('./dataDir');
const { isTokenAvailable } = require('./token');
const auth = require('./auth');

const app = express();
let lastPollTime = null;
let cronJob = null;

const poller = createPoller({
  fetchRules: shopify.fetchAllPriceRules,
  store,
  notifier: discord,
  isAuthorized: isTokenAvailable,
  onPollComplete: () => {
    lastPollTime = shopify.formatLastPoll();
  },
});

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'shopify-discount-monitor',
    authorized: isTokenAvailable(),
    lastPoll: lastPollTime,
    pollInterval: `${config.pollIntervalMinutes} minutes`,
    pollInProgress: poller.isRunning(),
    shopifyApiVersion: config.shopifyApiVersion,
  });
});

const poll = () => poller.poll();

function startPolling() {
  if (cronJob) return; // already running

  console.log(
    `Starting poll cycle (every ${config.pollIntervalMinutes} minutes, ` +
      `Shopify API ${config.shopifyApiVersion}, data dir ${getDataDir()})`
  );

  // Run initial poll
  poll();

  // Schedule recurring polls
  const cronExpression = `*/${config.pollIntervalMinutes} * * * *`;
  // noOverlap is a second line of defence; poller.poll() also refuses to
  // run while a previous poll is still in progress.
  cronJob = cron.schedule(cronExpression, poll, { noOverlap: true });
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
