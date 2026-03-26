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

function save(discounts) {
  ensureDataDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(discounts, null, 2));
}

/**
 * Compare current discounts against the stored state.
 * Returns { added: [], edited: [], deleted: [] }
 * Each item in added/deleted is the discount object.
 * Each item in edited is { discount, changes: [{ field, oldValue, newValue }] }.
 */
function diff(stored, current) {
  const added = [];
  const edited = [];
  const deleted = [];

  const currentKeys = new Set(Object.keys(current));

  // Check for new and edited discounts
  for (const [key, discount] of Object.entries(current)) {
    if (!stored[key]) {
      added.push(discount);
    } else {
      const changes = getChanges(stored[key], discount);
      if (changes.length > 0) {
        edited.push({ discount, changes });
      }
    }
  }

  // Check for deleted discounts
  for (const [key, discount] of Object.entries(stored)) {
    if (!currentKeys.has(key)) {
      deleted.push(discount);
    }
  }

  return { added, edited, deleted };
}

const TRACKED_FIELDS = [
  'title', 'value', 'value_type', 'usage_limit',
  'once_per_customer', 'starts_at', 'ends_at',
  'target_type', 'target_selection', 'prerequisite_subtotal_range',
];

function getChanges(oldDiscount, newDiscount) {
  const changes = [];
  for (const field of TRACKED_FIELDS) {
    const oldVal = String(oldDiscount[field] ?? '');
    const newVal = String(newDiscount[field] ?? '');
    if (oldVal !== newVal) {
      changes.push({ field, oldValue: oldDiscount[field], newValue: newDiscount[field] });
    }
  }
  return changes;
}

module.exports = { load, save, diff };
