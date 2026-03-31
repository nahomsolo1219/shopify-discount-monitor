const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SHOPIFY_STORE_FILE = path.join(DATA_DIR, 'known-discounts.json');
const KLAVIYO_STORE_FILE = path.join(DATA_DIR, 'known-klaviyo-coupons.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFile(filePath) {
  ensureDataDir();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    console.error(`Failed to parse ${path.basename(filePath)}, starting fresh`);
    return {};
  }
}

function saveFile(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Shopify store
function load() {
  return loadFile(SHOPIFY_STORE_FILE);
}

function save(discounts) {
  saveFile(SHOPIFY_STORE_FILE, discounts);
}

// Klaviyo store
function loadKlaviyo() {
  return loadFile(KLAVIYO_STORE_FILE);
}

function saveKlaviyo(coupons) {
  saveFile(KLAVIYO_STORE_FILE, coupons);
}

/**
 * Compare current items against the stored state.
 * Returns { added: [], edited: [], deleted: [] }
 */
function diff(stored, current, trackedFields) {
  const added = [];
  const edited = [];
  const deleted = [];

  const currentKeys = new Set(Object.keys(current));

  for (const [key, item] of Object.entries(current)) {
    if (!stored[key]) {
      added.push(item);
    } else if (trackedFields) {
      const changes = getChanges(stored[key], item, trackedFields);
      if (changes.length > 0) {
        edited.push({ discount: item, changes });
      }
    }
  }

  for (const [key, item] of Object.entries(stored)) {
    if (!currentKeys.has(key)) {
      deleted.push(item);
    }
  }

  return { added, edited, deleted };
}

const SHOPIFY_TRACKED_FIELDS = [
  'title', 'value', 'value_type', 'usage_limit',
  'once_per_customer', 'starts_at', 'ends_at',
  'target_type', 'target_selection', 'prerequisite_subtotal_range',
];

const KLAVIYO_TRACKED_FIELDS = ['external_id', 'description'];

function diffShopify(stored, current) {
  return diff(stored, current, SHOPIFY_TRACKED_FIELDS);
}

function diffKlaviyo(stored, current) {
  return diff(stored, current, KLAVIYO_TRACKED_FIELDS);
}

function getChanges(oldItem, newItem, trackedFields) {
  const changes = [];
  for (const field of trackedFields) {
    const oldVal = String(oldItem[field] ?? '');
    const newVal = String(newItem[field] ?? '');
    if (oldVal !== newVal) {
      changes.push({ field, oldValue: oldItem[field], newValue: newItem[field] });
    }
  }
  return changes;
}

module.exports = { load, save, loadKlaviyo, saveKlaviyo, diffShopify, diffKlaviyo };
