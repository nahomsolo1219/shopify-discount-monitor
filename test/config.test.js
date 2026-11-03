require('./setup-env');
const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/config');

test('default Shopify API version is a current stable release, not the retired 2024-10', () => {
  assert.notStrictEqual(config.DEFAULT_SHOPIFY_API_VERSION, '2024-10');
  assert.match(config.DEFAULT_SHOPIFY_API_VERSION, /^\d{4}-(01|04|07|10)$/);
  const [year] = config.DEFAULT_SHOPIFY_API_VERSION.split('-').map(Number);
  assert.ok(year >= 2026, 'version should be from 2026 or later');
  assert.strictEqual(config.resolveApiVersion({}), config.DEFAULT_SHOPIFY_API_VERSION);
});

test('SHOPIFY_API_VERSION env overrides the default', () => {
  assert.strictEqual(config.resolveApiVersion({ SHOPIFY_API_VERSION: '2027-01' }), '2027-01');
  assert.strictEqual(config.resolveApiVersion({ SHOPIFY_API_VERSION: ' 2026-07 ' }), '2026-07');
});

test('invalid SHOPIFY_API_VERSION falls back to the default', () => {
  assert.strictEqual(
    config.resolveApiVersion({ SHOPIFY_API_VERSION: 'latest' }),
    config.DEFAULT_SHOPIFY_API_VERSION
  );
  assert.strictEqual(
    config.resolveApiVersion({ SHOPIFY_API_VERSION: '2026-05' }),
    config.DEFAULT_SHOPIFY_API_VERSION
  );
});

test('poll interval defaults to 5 minutes', () => {
  assert.strictEqual(config.DEFAULT_POLL_INTERVAL_MINUTES, 5);
  assert.strictEqual(config.resolvePollInterval({}), 5);
  assert.strictEqual(config.resolvePollInterval({ POLL_INTERVAL_MINUTES: 'abc' }), 5);
  assert.strictEqual(config.resolvePollInterval({ POLL_INTERVAL_MINUTES: '0' }), 5);
  assert.strictEqual(config.resolvePollInterval({ POLL_INTERVAL_MINUTES: '60' }), 5);
  assert.strictEqual(config.resolvePollInterval({ POLL_INTERVAL_MINUTES: '10' }), 10);
});

test('Shopify client requests the configured API version and flags a served-version mismatch', () => {
  const shopify = require('../src/shopify');
  assert.ok(shopify.BASE_URL.endsWith(`/admin/api/${config.shopifyApiVersion}`));
  assert.strictEqual(shopify.warnOnApiVersionMismatch(config.shopifyApiVersion), false);
  assert.strictEqual(shopify.warnOnApiVersionMismatch(null), false);
  const origWarn = console.warn;
  const warnings = [];
  console.warn = (m) => warnings.push(m);
  try {
    assert.strictEqual(shopify.warnOnApiVersionMismatch('2025-01'), true);
    assert.strictEqual(shopify.warnOnApiVersionMismatch('2025-01'), true);
  } finally {
    console.warn = origWarn;
  }
  assert.strictEqual(warnings.length, 1, 'warns only once per served version');
});
