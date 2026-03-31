const config = require('./config');

const TIMEZONE = 'America/Edmonton';

const COLORS = {
  GREEN: 0x2ecc71,
  ORANGE: 0xf39c12,
  RED: 0xe74c3c,
  PURPLE: 0x9b59b6,
};

function isHighValue(discount) {
  const absValue = Math.abs(parseFloat(discount.value) || 0);
  return discount.value_type === 'fixed_amount' && absValue >= config.highValueThreshold;
}

function formatValue(discount) {
  const absValue = Math.abs(parseFloat(discount.value) || 0);
  if (discount.value_type === 'percentage') return `${absValue}%`;
  if (discount.value_type === 'fixed_amount') return `$${absValue.toFixed(2)}`;
  return 'Free Shipping';
}

function formatType(discount) {
  if (discount.value_type === 'percentage') return 'Percentage';
  if (discount.value_type === 'fixed_amount') return 'Fixed Amount';
  return 'Free Shipping';
}

function getStatus(discount) {
  const now = new Date();
  const start = discount.starts_at ? new Date(discount.starts_at) : null;
  const end = discount.ends_at ? new Date(discount.ends_at) : null;
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

function buildNewEmbed(discount) {
  const highValue = isHighValue(discount);
  const title = highValue
    ? '⚠️ HIGH VALUE ALERT — 🏷️ New Coupon Created'
    : '🏷️ New Coupon Created';
  const color = highValue ? COLORS.RED : COLORS.GREEN;

  const fields = [
    { name: 'Code', value: discount.code, inline: true },
    { name: 'Type', value: formatType(discount), inline: true },
    { name: 'Value', value: formatValue(discount), inline: true },
    { name: 'Usage Limit', value: String(discount.usage_limit ?? 'Unlimited'), inline: true },
    { name: 'One Per Customer', value: discount.once_per_customer ? 'Yes' : 'No', inline: true },
    { name: 'Status', value: getStatus(discount), inline: true },
    { name: 'Valid From', value: formatDate(discount.starts_at), inline: true },
    { name: 'Valid Until', value: formatDate(discount.ends_at), inline: true },
  ];

  return {
    title,
    color,
    fields,
    footer: { text: `Created: ${formatDate(discount.created_at)} MT` },
    timestamp: new Date().toISOString(),
  };
}

function buildEditedEmbed(discount, changes) {
  const highValue = isHighValue(discount);
  const title = highValue
    ? '⚠️ HIGH VALUE ALERT — ✏️ Coupon Modified'
    : '✏️ Coupon Modified';
  const color = highValue ? COLORS.RED : COLORS.ORANGE;

  const fields = [
    { name: 'Code', value: discount.code, inline: false },
  ];

  for (const change of changes) {
    const label = change.field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    fields.push({
      name: label,
      value: `${change.oldValue ?? 'N/A'} → ${change.newValue ?? 'N/A'}`,
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

function buildDeletedEmbed(discount) {
  return {
    title: '🗑️ Coupon Removed',
    color: COLORS.RED,
    fields: [
      { name: 'Code', value: discount.code, inline: true },
      { name: 'Type', value: formatType(discount), inline: true },
      { name: 'Value', value: formatValue(discount), inline: true },
    ],
    footer: { text: `Removed: ${formatNow()} MT` },
    timestamp: new Date().toISOString(),
  };
}

async function sendEmbed(embed) {
  try {
    const res = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Discord webhook error: ${res.status} — ${body}`);
    }
  } catch (err) {
    console.error('Failed to send Discord webhook:', err.message);
  }
}

// Klaviyo coupon embeds

function buildKlaviyoNewEmbed(coupon) {
  return {
    title: '📧 New Klaviyo Coupon Rule Created',
    color: COLORS.PURPLE,
    fields: [
      { name: 'Name', value: coupon.external_id || 'N/A', inline: true },
      { name: 'Description', value: coupon.description || 'N/A', inline: false },
    ],
    footer: { text: `Detected: ${formatNow()} MT` },
    timestamp: new Date().toISOString(),
  };
}

function buildKlaviyoEditedEmbed(coupon, changes) {
  const fields = [
    { name: 'Name', value: coupon.external_id || 'N/A', inline: false },
  ];

  for (const change of changes) {
    const label = change.field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    fields.push({
      name: label,
      value: `${change.oldValue ?? 'N/A'} → ${change.newValue ?? 'N/A'}`,
      inline: false,
    });
  }

  return {
    title: '📧 Klaviyo Coupon Rule Modified',
    color: COLORS.PURPLE,
    fields,
    footer: { text: `Modified: ${formatNow()} MT` },
    timestamp: new Date().toISOString(),
  };
}

function buildKlaviyoDeletedEmbed(coupon) {
  return {
    title: '📧 Klaviyo Coupon Rule Removed',
    color: COLORS.PURPLE,
    fields: [
      { name: 'Name', value: coupon.external_id || 'N/A', inline: true },
      { name: 'Description', value: coupon.description || 'N/A', inline: false },
    ],
    footer: { text: `Removed: ${formatNow()} MT` },
    timestamp: new Date().toISOString(),
  };
}

async function notifyKlaviyoNew(coupon) {
  await sendEmbed(buildKlaviyoNewEmbed(coupon));
}

async function notifyKlaviyoEdited(coupon, changes) {
  await sendEmbed(buildKlaviyoEditedEmbed(coupon, changes));
}

async function notifyKlaviyoDeleted(coupon) {
  await sendEmbed(buildKlaviyoDeletedEmbed(coupon));
}

async function notifyNew(discount) {
  await sendEmbed(buildNewEmbed(discount));
}

async function notifyEdited(discount, changes) {
  await sendEmbed(buildEditedEmbed(discount, changes));
}

async function notifyDeleted(discount) {
  await sendEmbed(buildDeletedEmbed(discount));
}

module.exports = {
  notifyNew, notifyEdited, notifyDeleted,
  notifyKlaviyoNew, notifyKlaviyoEdited, notifyKlaviyoDeleted,
};
