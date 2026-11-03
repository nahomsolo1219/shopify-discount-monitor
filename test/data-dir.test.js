const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDataDir, DEFAULT_DATA_DIR } = require('../src/dataDir');

test('getDataDir prefers DATA_DIR, then RAILWAY_VOLUME_MOUNT_PATH, then ./data', () => {
  assert.strictEqual(getDataDir({ DATA_DIR: '/data', RAILWAY_VOLUME_MOUNT_PATH: '/vol' }), '/data');
  assert.strictEqual(getDataDir({ RAILWAY_VOLUME_MOUNT_PATH: '/vol' }), '/vol');
  assert.strictEqual(getDataDir({}), path.resolve(DEFAULT_DATA_DIR));
});

test('store persists under DATA_DIR and survives a reload', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-store-'));
  const target = path.join(dir, 'nested', 'volume');
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = target;
  t.after(() => {
    if (prev === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const store = require('../src/store');
  assert.deepStrictEqual(store.load(), {});
  store.save({ 'rule-1': { key: 'rule-1', title: 'X' } });

  assert.strictEqual(store.getStoreFile(), path.join(target, 'known-discounts.json'));
  assert.ok(fs.existsSync(path.join(target, 'known-discounts.json')));
  assert.deepStrictEqual(store.load(), { 'rule-1': { key: 'rule-1', title: 'X' } });
  // no temp files left behind by the atomic write
  assert.deepStrictEqual(fs.readdirSync(target), ['known-discounts.json']);
});

test('token file is written under DATA_DIR', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-token-'));
  const prevDir = process.env.DATA_DIR;
  const prevTok = process.env.SHOPIFY_ACCESS_TOKEN;
  process.env.DATA_DIR = dir;
  t.after(() => {
    if (prevDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDir;
    if (prevTok === undefined) delete process.env.SHOPIFY_ACCESS_TOKEN;
    else process.env.SHOPIFY_ACCESS_TOKEN = prevTok;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const { saveToken, loadToken } = require('../src/token');
  saveToken('shpat_test');
  delete process.env.SHOPIFY_ACCESS_TOKEN;
  assert.strictEqual(loadToken(), 'shpat_test');
  assert.ok(fs.existsSync(path.join(dir, 'token.json')));
});
