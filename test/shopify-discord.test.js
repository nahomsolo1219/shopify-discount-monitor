require('./setup-env');
const test = require('node:test');
const assert = require('node:assert');
const { buildRuleMap } = require('../src/shopify');
const { buildSummaryEmbed } = require('../src/discord');

test('Klaviyo-versioned rules are skipped and counted, not logged individually', () => {
  const lines = [];
  const origLog = console.log;
  console.log = (m) => lines.push(m);
  let result;
  try {
    result = buildRuleMap([
      { id: 1, title: 'WELCOME10' },
      { id: 2, title: 'Welcome Flow (2026-10-01 12:30)' },
      { id: 3, title: 'Welcome Flow (2026-10-02 12:30:45)' },
    ]);
  } finally {
    console.log = origLog;
  }
  assert.deepStrictEqual(Object.keys(result.ruleMap), ['rule-1']);
  assert.strictEqual(result.skipped, 2);
  assert.strictEqual(lines.length, 0, 'buildRuleMap itself logs nothing per rule');
});

test('fetchAllPriceRules logs a single summary line for skipped Klaviyo rules', async () => {
  const shopify = require('../src/shopify');
  const origFetch = global.fetch;
  const origLog = console.log;
  const prevToken = process.env.SHOPIFY_ACCESS_TOKEN;
  process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test';
  const lines = [];
  const rules = [{ id: 1, title: 'KEEP' }];
  for (let i = 0; i < 25; i++) rules.push({ id: 100 + i, title: `Flow (2026-10-${String(i + 1).padStart(2, '0')} 09:00)` });
  global.fetch = async () =>
    new Response(JSON.stringify({ price_rules: rules }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  console.log = (m) => lines.push(m);
  try {
    const map = await shopify.fetchAllPriceRules();
    assert.deepStrictEqual(Object.keys(map), ['rule-1']);
  } finally {
    global.fetch = origFetch;
    console.log = origLog;
    if (prevToken === undefined) delete process.env.SHOPIFY_ACCESS_TOKEN;
    else process.env.SHOPIFY_ACCESS_TOKEN = prevToken;
  }
  const klaviyoLines = lines.filter((l) => /Klaviyo/i.test(l));
  assert.deepStrictEqual(klaviyoLines, ['[Poll] Skipped 25 Klaviyo-versioned rules']);
});

test('summary embed says "N more changes" with a breakdown', () => {
  const embed = buildSummaryEmbed(133, { added: 0, edited: 131, deleted: 2 });
  assert.match(embed.title, /133 more changes/);
  assert.match(embed.description, /131 edited, 2 deleted/);
  assert.doesNotMatch(embed.description, /new/);
  assert.match(buildSummaryEmbed(1, { added: 1 }).title, /1 more change$/);
});
