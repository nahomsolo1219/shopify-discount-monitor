const config = require('./config');

const BASE_URL = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15';

function getHeaders() {
  return {
    Authorization: `Klaviyo-API-Key ${config.klaviyoApiKey}`,
    revision: REVISION,
    Accept: 'application/json',
  };
}

async function klaviyoFetch(url) {
  const res = await fetch(url, { headers: getHeaders() });

  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get('Retry-After') || '5');
    console.log(`[Klaviyo] Rate limited, retrying after ${retryAfter}s`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return klaviyoFetch(url);
  }

  if (!res.ok) {
    throw new Error(`Klaviyo API error: ${res.status} ${res.statusText} for ${url}`);
  }

  return res.json();
}

/**
 * Fetch all Klaviyo coupons, handling cursor-based pagination.
 * Returns a map keyed by coupon ID for diffing.
 */
async function fetchAllCoupons() {
  const couponMap = {};
  let nextUrl = `${BASE_URL}/coupons/`;

  while (nextUrl) {
    const data = await klaviyoFetch(nextUrl);

    for (const coupon of data.data || []) {
      const attrs = coupon.attributes || {};
      couponMap[coupon.id] = {
        id: coupon.id,
        external_id: attrs.external_id || '',
        description: attrs.description || '',
      };
    }

    nextUrl = data.links?.next || null;
  }

  return couponMap;
}

/**
 * Return the set of known Klaviyo coupon external_ids for Shopify filtering.
 */
function getKnownCouponNames(couponMap) {
  const names = new Set();
  for (const coupon of Object.values(couponMap)) {
    if (coupon.external_id) {
      names.add(coupon.external_id);
    }
  }
  return names;
}

function isEnabled() {
  return Boolean(config.klaviyoApiKey);
}

module.exports = { fetchAllCoupons, getKnownCouponNames, isEnabled };
