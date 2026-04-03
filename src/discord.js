const config = require('./config');

const TIMEZONE = 'America/Edmonton';

const COLORS = {
  GREEN: 0x2ecc71,
  ORANGE: 0xf39c12,
  RED: 0xe74c3c,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHighValue(rule) {
  const absValue = Math.abs(parseFloat(rule.value) || 0);
  return rule.value_type === 'fixed_amount' && absValue >= config.highValueThreshold;
}

function formatValue(rule) {
  const absValue = Math.abs(parseFloat(rule.value) || 0);
  if (rule.value_type === 'percentage') return `${absValue}%`;
  if (rule.value_type === 'fixed_amount') return `$${absValue.toFixed(2)}`;
  return 'Free Shipping';
}

function formatType(rule) {
  if (rule.value_type === 'percentage') return 'Percentage';
  if (rule.value_type === 'fixed_amount') return 'Fixed Amount';
  return 'Free Shipping';
}

function getStatus(rule) {
  const now = new Date();
  const start = rule.starts_at ? new Date(rule.starts_at) : null;
  const end = rule.ends_at ? new Date(rule.ends_at) : null;
  if (end && now > end) return 'Expired';
  if (start && now < start) return 'Scheduled';
  return 'Active';
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatNow() {
  return new Date().toLocaleString('en-US', {
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatTargetSelection(rule) {
  if (rule.target_selection === 'all') return 'All items';
  return 'Specific collections/products';
}

function formatAllocation(rule) {
  if (rule.allocation_method === 'across') return 'Spread across items';
  if (rule.allocation_method === 'each') return 'Applied to each item';
  return rule.allocation_method || 'N/A';
}

function formatMinPurchase(rule) {
  const range = rule.prerequisite_subtotal_range;
  if (!range || !range.greater_than_or_equal_to) return 'None';
  return `$${parseFloat(range.greater_than_or_equal_to).toFixed(2)}`;
}

function formatMinQuantity(rule) {
  const range = rule.prerequisite_quantity_range;
  if (!range || !range.greater_than_or_equal_to) return 'None';
  return `${range.greater_than_or_equal_to} items`;
}

function formatMaxShipping(rule) {
  const range = rule.prerequisite_shipping_price_range;
  if (!range || !range.less_than_or_equal_to) return 'N/A';
  return `$${parseFloat(range.less_than_or_equal_to).toFixed(2)}`;
}

function formatEntitled(rule) {
  const parts = [];
  if (rule.entitled_product_ids?.length) {
    parts.push(`${rule.entitled_product_ids.length} product(s)`);
  }
  if (rule.entitled_collection_ids?.length) {
    parts.push(`${rule.entitled_collection_ids.length} collection(s)`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function buildRestrictionFields(rule) {
  const fields = [];
  const minPurchase = formatMinPurchase(rule);
  if (minPurchase !== 'None') {
    fields.push({ name: 'Min Purchase', value: minPurchase, inline: true });
  }
  const minQty = formatMinQuantity(rule);
  if (minQty !== 'None') {
    fields.push({ name: 'Min Quantity', value: minQty, inline: true });
  }
  const maxShip = formatMaxShipping(rule);
  if (maxShip !== 'N/A') {
    fields.push({ name: 'Max Shipping Price', value: maxShip, inline: true });
  }
  fields.push({ name: 'Applies To', value: formatTargetSelection(rule), inline: true });
  if (rule.allocation_method) {
    fields.push({ name: 'Allocation', value: formatAllocation(rule), inline: true });
  }
  const entitled = formatEntitled(rule);
  if (entitled) {
    fields.push({ name: 'Entitled Items', value: entitled, inline: true });
  }
  return fields;
}

function buildNewEmbed(rule) {
  const highValue = isHighValue(rule);
  const title = highValue
    ? '⚠️ HIGH VALUE ALERT — 🏷️ New Coupon Created'
    : '🏷️ New Coupon Created';
  const color = highValue ? COLORS.RED : COLORS.GREEN;

  const fields = [
    { name: 'Title', value: rule.title, inline: true },
    { name: 'Type', value: formatType(rule), inline: true },
    { name: 'Value', value: formatValue(rule), inline: true },
    { name: 'Usage Limit', value: String(rule.usage_limit ?? 'Unlimited'), inline: true },
    { name: 'One Per Customer', value: rule.once_per_customer ? 'Yes' : 'No', inline: true },
    { name: 'Status', value: getStatus(rule), inline: true },
    { name: 'Valid From', value: formatDate(rule.starts_at), inline: true },
    { name: 'Valid Until', value: formatDate(rule.ends_at), inline: true },
    ...buildRestrictionFields(rule),
  ];

  return {
    title,
    color,
    fields,
    footer: { text: `Created: ${formatDate(rule.created_at)} MT` },
    timestamp: new Date().toISOString(),
  };
}

function buildEditedEmbed(rule, changes) {
  const highValue = isHighValue(rule);
  const title = highValue
    ? '⚠️ HIGH VALUE ALERT — ✏️ Coupon Modified'
    : '✏️ Coupon Modified';
  const color = highValue ? COLORS.RED : COLORS.ORANGE;

  const fields = [
    { name: 'Title', value: rule.title, inline: false },
  ];

  for (const change of changes) {
    const label = change.field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const oldStr = formatChangeValue(change.oldValue);
    const newStr = formatChangeValue(change.newValue);
    fields.push({
      name: label,
      value: `${oldStr} → ${newStr}`,
      inline: false,
    });
  }

  return {
    title,
    color,
    fields,
    footer: { text: `Modified: ${formatNow()} MT` },
    timestamp: new Date().toISOString(),
  };
}

function buildDeletedEmbed(rule) {
  return {
    title: '🗑️ Coupon Removed',
    color: COLORS.RED,
    fields: [
      { name: 'Title', value: rule.title, inline: true },
      { name: 'Type', value: formatType(rule), inline: true },
      { name: 'Value', value: formatValue(rule), inline: true },
    ],
    footer: { text: `Removed: ${formatNow()} MT` },
    timestamp: new Date().toISOString(),
  };
}

function formatChangeValue(val) {
  if (val === null || val === undefined) return 'N/A';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

async function sendEmbed(embed) {
  try {
    const res = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (res.status === 429) {
      const body = await res.json();
      const retryAfter = (body.retry_after || 5) * 1000;
      console.log(`[Discord] Rate limited, retrying after ${retryAfter}ms`);
      await sleep(retryAfter);
      return sendEmbed(embed);
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`Discord webhook error: ${res.status} — ${body}`);
    }
  } catch (err) {
    console.error('Failed to send Discord webhook:', err.message);
  }
}

async function notifyNew(rule) {
  await sendEmbed(buildNewEmbed(rule));
  await sleep(1000);
}

async function notifyEdited(rule, changes) {
  await sendEmbed(buildEditedEmbed(rule, changes));
  await sleep(1000);
}

async function notifyDeleted(rule) {
  await sendEmbed(buildDeletedEmbed(rule));
  await sleep(1000);
}

module.exports = { notifyNew, notifyEdited, notifyDeleted };
