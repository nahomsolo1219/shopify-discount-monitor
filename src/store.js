const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'known-discounts.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(STORE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
  } catch {
    console.error('Failed to parse store file, starting fresh');
    return {};
  }
}

function save(data) {
  ensureDataDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

const TRACKED_FIELDS = [
  'title', 'value', 'value_type', 'usage_limit',
  'once_per_customer', 'starts_at', 'ends_at',
  'target_type', 'target_selection', 'allocation_method',
  'prerequisite_subtotal_range', 'prerequisite_quantity_range',
  'prerequisite_shipping_price_range',
];

/**
 * Compare current price rules against the stored state.
 * Returns { added: [], edited: [], deleted: [] }
 */
function diff(stored, current) {
  const added = [];
  const edited = [];
  const deleted = [];

  const currentKeys = new Set(Object.keys(current));

  for (const [key, rule] of Object.entries(current)) {
    if (!stored[key]) {
      added.push(rule);
    } else {
      const changes = getChanges(stored[key], rule);
      if (changes.length > 0) {
        edited.push({ rule, changes });
      }
    }
  }

  for (const [key, rule] of Object.entries(stored)) {
    if (!currentKeys.has(key)) {
      deleted.push(rule);
    }
  }

  return { added, edited, deleted };
}

function getChanges(oldRule, newRule) {
  const changes = [];
  for (const field of TRACKED_FIELDS) {
    const oldVal = stringify(oldRule[field]);
    const newVal = stringify(newRule[field]);
    if (oldVal !== newVal) {
      changes.push({ field, oldValue: oldRule[field], newValue: newRule[field] });
    }
  }
  return changes;
}

function stringify(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

module.exports = { load, save, diff };
