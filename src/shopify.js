const config = require('./config');
const { loadToken } = require('./token');

const BASE_URL = `https://${config.shopifyStore}/admin/api/${config.shopifyApiVersion}`;
const TIMEZONE = 'America/Edmonton';

function getHeaders() {
  const token = loadToken();
  if (!token) {
    throw new Error('No Shopify access token available');
  }
  return {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  };
}

async function shopifyFetch(url) {
  const res = await fetch(url, { headers: getHeaders() });

  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get('Retry-After') || '2');
    console.log(`Rate limited, retrying after ${retryAfter}s`);
    await sleep(retryAfter * 1000);
    return shopifyFetch(url);
  }

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText} for ${url}`);
  }

  return { json: await res.json(), headers: res.headers };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch all pages for a given endpoint, handling Link-header pagination.
 */
async function fetchAllPages(url, dataKey) {
  const results = [];
  let nextUrl = url;

  while (nextUrl) {
    const { json, headers: resHeaders } = await shopifyFetch(nextUrl);
    results.push(...(json[dataKey] || []));

    nextUrl = null;
    const linkHeader = resHeaders.get('link');
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        nextUrl = nextMatch[1];
      }
    }
  }

  return results;
}

async function fetchPriceRules() {
  return fetchAllPages(`${BASE_URL}/price_rules.json?limit=250`, 'price_rules');
}

/**
 * Fetch all price rules. Each rule is tracked once — individual discount
 * codes are never fetched. Returns a map keyed by price rule ID.
 */
const KLAVIYO_TIMESTAMP_RE = /\(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?\)\s*$/;

async function fetchAllPriceRules() {
  const priceRules = await fetchPriceRules();
  const ruleMap = {};

  for (const rule of priceRules) {
    if (KLAVIYO_TIMESTAMP_RE.test(rule.title)) {
      console.log(`[Poll] Skipping Klaviyo-versioned rule: ${rule.title}`);
      continue;
    }

    const key = `rule-${rule.id}`;
    ruleMap[key] = {
      key,
      price_rule_id: rule.id,
      title: rule.title,
      value: rule.value,
      value_type: rule.value_type,
      target_type: rule.target_type,
      target_selection: rule.target_selection,
      allocation_method: rule.allocation_method,
      usage_limit: rule.usage_limit,
      once_per_customer: rule.once_per_customer,
      starts_at: rule.starts_at,
      ends_at: rule.ends_at,
      created_at: rule.created_at,
      updated_at: rule.updated_at,
      prerequisite_subtotal_range: rule.prerequisite_subtotal_range,
      prerequisite_quantity_range: rule.prerequisite_quantity_range,
      prerequisite_shipping_price_range: rule.prerequisite_shipping_price_range,
      entitled_product_ids: rule.entitled_product_ids,
      entitled_collection_ids: rule.entitled_collection_ids,
    };
  }

  return ruleMap;
}

function formatLastPoll() {
  return new Date().toLocaleString('en-US', {
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

module.exports = { fetchAllPriceRules, formatLastPoll };
