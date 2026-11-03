const test = require('node:test');
const assert = require('node:assert');
const { diff, normalize, getChanges } = require('../src/store');

const baseRule = {
  key: 'rule-1',
  price_rule_id: 1,
  title: 'SUMMER10',
  value: '-10.0',
  value_type: 'percentage',
  target_type: 'line_item',
  target_selection: 'all',
  allocation_method: 'across',
  usage_limit: null,
  once_per_customer: false,
  starts_at: '2026-06-01T00:00:00-06:00',
  ends_at: null,
  prerequisite_subtotal_range: null,
  prerequisite_quantity_range: null,
  prerequisite_shipping_price_range: null,
};

test('normalize collapses number formats', () => {
  assert.strictEqual(normalize('-10.0'), -10);
  assert.strictEqual(normalize('-10.00'), -10);
  assert.strictEqual(normalize(-10), -10);
  assert.strictEqual(normalize('5'), 5);
  assert.strictEqual(normalize('-0.0'), 0);
});

test('normalize collapses empty ranges and blanks to null', () => {
  for (const v of [null, undefined, '', '  ', {}, [], { greater_than_or_equal_to: null }, { a: '' }]) {
    assert.strictEqual(normalize(v), null, `expected ${JSON.stringify(v)} -> null`);
  }
});

test('normalize compares dates as instants and ignores key order', () => {
  assert.strictEqual(
    normalize('2026-06-01T00:00:00-06:00'),
    normalize('2026-06-01T06:00:00Z')
  );
  assert.deepStrictEqual(
    normalize({ b: '1.0', a: '2.50' }),
    normalize({ a: 2.5, b: 1 })
  );
});

test('format-only differences across API versions are not reported as edits', () => {
  const stored = { 'rule-1': { ...baseRule } };
  const current = {
    'rule-1': {
      ...baseRule,
      value: '-10.00',
      usage_limit: undefined,
      once_per_customer: 'false',
      starts_at: '2026-06-01T06:00:00Z',
      ends_at: '',
      prerequisite_subtotal_range: {},
      prerequisite_quantity_range: { greater_than_or_equal_to: null },
      prerequisite_shipping_price_range: { less_than_or_equal_to: null },
    },
  };
  const { added, edited, deleted } = diff(stored, current);
  assert.deepStrictEqual([added.length, edited.length, deleted.length], [0, 0, 0]);
});

test('140 rules re-served in a new format produce zero edits', () => {
  const stored = {};
  const current = {};
  for (let i = 0; i < 140; i++) {
    stored[`rule-${i}`] = { ...baseRule, key: `rule-${i}`, value: `-${i}.0` };
    current[`rule-${i}`] = { ...baseRule, key: `rule-${i}`, value: `-${i}.00`, ends_at: undefined };
  }
  assert.strictEqual(diff(stored, current).edited.length, 0);
});

test('real changes are still detected, with the changed fields listed', () => {
  const stored = { 'rule-1': { ...baseRule } };
  const current = {
    'rule-1': {
      ...baseRule,
      value: '-15.0',
      ends_at: '2026-07-01T00:00:00Z',
      prerequisite_subtotal_range: { greater_than_or_equal_to: '50.0' },
    },
  };
  const { edited } = diff(stored, current);
  assert.strictEqual(edited.length, 1);
  assert.deepStrictEqual(
    edited[0].changes.map((c) => c.field),
    ['value', 'ends_at', 'prerequisite_subtotal_range']
  );
  // raw values are kept for display
  assert.strictEqual(edited[0].changes[0].oldValue, '-10.0');
  assert.strictEqual(edited[0].changes[0].newValue, '-15.0');
});

test('range value changes are detected even when formats differ', () => {
  const changes = getChanges(
    { ...baseRule, prerequisite_subtotal_range: { greater_than_or_equal_to: '50.0' } },
    { ...baseRule, prerequisite_subtotal_range: { greater_than_or_equal_to: '75.00' } }
  );
  assert.deepStrictEqual(changes.map((c) => c.field), ['prerequisite_subtotal_range']);
});

test('added and deleted rules are detected', () => {
  const stored = { 'rule-1': { ...baseRule } };
  const current = { 'rule-2': { ...baseRule, key: 'rule-2', price_rule_id: 2 } };
  const { added, edited, deleted } = diff(stored, current);
  assert.strictEqual(added.length, 1);
  assert.strictEqual(edited.length, 0);
  assert.strictEqual(deleted.length, 1);
});
