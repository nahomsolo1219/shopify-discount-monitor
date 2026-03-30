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

    // Parse Link header for next page
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

async function fetchDiscountCodes(priceRuleId) {
  return fetchAllPages(
    `${BASE_URL}/price_rules/${priceRuleId}/discount_codes.json?limit=250`,
    'discount_codes'
  );
}

/**
 * Try to fetch events for a price rule to find who created/updated it.
 * Shopify REST API price_rules don't include user info directly,
 * but the Events API can provide attribution via the `message` field.
 * Returns { created_by, updated_by } or empty strings if unavailable.
 */
async function fetchPriceRuleAttribution(priceRuleId) {
  try {
    const { json } = await shopifyFetch(
      `${BASE_URL}/events.json?filter=PriceRule&verb=create&limit=5`
    );
    const events = json.events || [];
    // Look for an event matching this price rule
    const createEvent = events.find(
      (e) => e.subject_id === priceRuleId && e.verb === 'create'
    );
    if (createEvent && createEvent.message) {
      return { created_by: createEvent.message, updated_by: '' };
    }
  } catch {
    // Events API may not be available — that's fine
  }
  return { created_by: '', updated_by: '' };
}

/**
 * Fetch all discounts: price rules enriched with their discount codes.
 * Returns a map keyed by "priceRuleId-discountCodeId" for easy diffing.
 */
async function fetchAllDiscounts() {
  const priceRules = await fetchPriceRules();
  const discountMap = {};

  for (const rule of priceRules) {
    const codes = await fetchDiscountCodes(rule.id);

    // Try to get attribution info
    const attribution = await fetchPriceRuleAttribution(rule.id);

    const baseFields = {
      price_rule_id: rule.id,
      title: rule.title,
      value: rule.value,
      value_type: rule.value_type,
      target_type: rule.target_type,
      target_selection: rule.target_selection,
      usage_limit: rule.usage_limit,
      once_per_customer: rule.once_per_customer,
      starts_at: rule.starts_at,
      ends_at: rule.ends_at,
      created_at: rule.created_at,
      updated_at: rule.updated_at,
      prerequisite_subtotal_range: rule.prerequisite_subtotal_range,
      created_by: attribution.created_by,
      updated_by: attribution.updated_by,
    };

    if (codes.length === 0) {
      const key = `rule-${rule.id}`;
      discountMap[key] = { key, ...baseFields, code: '(no code)' };
      continue;
    }

    for (const code of codes) {
      const key = `rule-${rule.id}-code-${code.id}`;
      discountMap[key] = {
        key,
        ...baseFields,
        discount_code_id: code.id,
        code: code.code,
        usage_count: code.usage_count,
      };
    }
  }

  return discountMap;
}

function formatLastPoll() {
  return new Date().toLocaleString('en-US', {
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

module.exports = { fetchAllDiscounts, formatLastPoll };
