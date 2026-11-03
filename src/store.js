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
    const oldVal = canonical(oldRule[field]);
    const newVal = canonical(newRule[field]);
    if (oldVal !== newVal) {
      changes.push({ field, oldValue: oldRule[field], newValue: newRule[field] });
    }
  }
  return changes;
}

const NUMERIC_RE = /^[-+]?(\d+\.?\d*|\.\d+)$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Normalise a value so that format-only differences between Shopify API
 * versions compare equal:
 *   - "-10.0" / "-10.00" / -10       -> -10
 *   - "5" / 5                         -> 5
 *   - "2024-01-01T00:00:00-07:00" / "2024-01-01T07:00:00Z" -> same instant
 *   - "true" / true                   -> true
 *   - null / undefined / "" / {} / [] / { greater_than_or_equal_to: null } -> null
 *   - object key order is ignored
 */
function normalize(val) {
  if (val === null || val === undefined) return null;

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    return val === 0 ? 0 : val; // collapse -0
  }

  if (typeof val === 'boolean') return val;

  if (typeof val === 'string') {
    const s = val.trim();
    if (s === '') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (NUMERIC_RE.test(s)) return normalize(Number(s));
    if (ISO_DATE_RE.test(s)) {
      const t = Date.parse(s);
      if (!Number.isNaN(t)) return new Date(t).toISOString();
    }
    return s;
  }

  if (Array.isArray(val)) {
    const items = val.map(normalize).filter((v) => v !== null);
    if (items.length === 0) return null;
    return items;
  }

  if (typeof val === 'object') {
    const out = {};
    for (const key of Object.keys(val).sort()) {
      const v = normalize(val[key]);
      if (v !== null) out[key] = v;
    }
    return Object.keys(out).length === 0 ? null : out;
  }

  return val;
}

function canonical(val) {
  return JSON.stringify(normalize(val));
}

module.exports = { load, save, diff, getChanges, normalize, TRACKED_FIELDS };
