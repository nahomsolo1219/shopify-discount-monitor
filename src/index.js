const express = require('express');
const cron = require('node-cron');
const config = require('./config');
const shopify = require('./shopify');
const klaviyo = require('./klaviyo');
const discord = require('./discord');
const store = require('./store');
const { isTokenAvailable } = require('./token');
const auth = require('./auth');

const app = express();
let lastShopifyPoll = null;
let lastKlaviyoPoll = null;
let isFirstRun = true;
let isFirstKlaviyoRun = true;
let cronJob = null;

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'shopify-discount-monitor',
    shopify: {
      authorized: isTokenAvailable(),
      lastPoll: lastShopifyPoll,
    },
    klaviyo: {
      enabled: klaviyo.isEnabled(),
      lastPoll: lastKlaviyoPoll,
    },
    pollInterval: `${config.pollIntervalMinutes} minutes`,
  });
});

async function pollKlaviyo() {
  if (!klaviyo.isEnabled()) return;

  const silent = isFirstKlaviyoRun;
  const label = silent ? 'Klaviyo initial sync' : 'Klaviyo poll';

  console.log(`[${label}] Fetching coupons from Klaviyo...`);

  try {
    const currentCoupons = await klaviyo.fetchAllCoupons();
    const storedCoupons = store.loadKlaviyo();

    const { added, edited, deleted } = store.diffKlaviyo(storedCoupons, currentCoupons);

    console.log(
      `[${label}] Found ${Object.keys(currentCoupons).length} coupons — ` +
        `${added.length} new, ${edited.length} edited, ${deleted.length} deleted`
    );

    if (!silent) {
      for (const coupon of added) {
        await discord.notifyKlaviyoNew(coupon);
      }
      for (const { discount: coupon, changes } of edited) {
        await discord.notifyKlaviyoEdited(coupon, changes);
      }
      for (const coupon of deleted) {
        await discord.notifyKlaviyoDeleted(coupon);
      }
    } else {
      console.log('[Klaviyo initial sync] Loaded existing coupons into store (no notifications sent)');
    }

    store.saveKlaviyo(currentCoupons);
    lastKlaviyoPoll = shopify.formatLastPoll();
    isFirstKlaviyoRun = false;
  } catch (err) {
    console.error(`[${label}] Error:`, err.message);
  }
}

async function pollShopify() {
  if (!isTokenAvailable()) {
    console.log('[Poll] No Shopify token available, skipping');
    return;
  }

  const silent = isFirstRun;
  const label = silent ? 'Initial sync' : 'Poll';

  console.log(`[${label}] Fetching discounts from Shopify...`);

  try {
    // Get Klaviyo coupon names for filtering (if Klaviyo is enabled)
    let klaviyoCouponNames = new Set();
    if (klaviyo.isEnabled()) {
      const klaviyoCoupons = store.loadKlaviyo();
      klaviyoCouponNames = klaviyo.getKnownCouponNames(klaviyoCoupons);
    }

    const currentDiscounts = await shopify.fetchAllDiscounts(klaviyoCouponNames);
    const storedDiscounts = store.load();

    const { added, edited, deleted } = store.diffShopify(storedDiscounts, currentDiscounts);

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
    lastShopifyPoll = shopify.formatLastPoll();
    isFirstRun = false;
  } catch (err) {
    console.error(`[${label}] Error during poll:`, err.message);
  }
}

async function poll() {
  // Poll Klaviyo first so we have coupon names for Shopify filtering
  await pollKlaviyo();
  await pollShopify();
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

// Log Klaviyo status
if (klaviyo.isEnabled()) {
  console.log('Klaviyo integration enabled');
} else {
  console.log('Klaviyo integration disabled (no KLAVIYO_API_KEY set)');
}

// On startup, check if we already have a Shopify token
if (isTokenAvailable()) {
  console.log('Existing Shopify token found, starting polling');
  startPolling();
} else {
  console.log(`No Shopify token found. Visit ${config.appUrl}/auth to authorize the app.`);
  // Even without Shopify, we can still poll Klaviyo if enabled
  if (klaviyo.isEnabled()) {
    console.log('Starting Klaviyo-only polling while waiting for Shopify auth');
    pollKlaviyo();
  }
}

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
