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
 * Check if a price rule is likely Klaviyo-generated.
 * Criteria: title matches a known Klaviyo coupon name, or the rule
 * has more discount codes than the configured threshold.
 */
function isKlaviyoGenerated(rule, codeCount, klaviyoCouponNames) {
  if (klaviyoCouponNames.has(rule.title)) {
    return true;
  }
  if (codeCount >= config.klaviyoFilterThreshold) {
    return true;
  }
  return false;
}

/**
 * Fetch all discounts: price rules enriched with their discount codes.
 * Filters out Klaviyo-generated price rules when Klaviyo names are provided.
 * Returns a map keyed by "priceRuleId-discountCodeId" for easy diffing.
 */
async function fetchAllDiscounts(klaviyoCouponNames = new Set()) {
  const priceRules = await fetchPriceRules();
  const discountMap = {};

  for (const rule of priceRules) {
    const codes = await fetchDiscountCodes(rule.id);

    // Filter out Klaviyo-generated rules
    if (klaviyoCouponNames.size > 0 && isKlaviyoGenerated(rule, codes.length, klaviyoCouponNames)) {
      continue;
    }

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
