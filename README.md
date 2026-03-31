# Shopify Discount Monitor

A lightweight polling service that monitors Shopify discount codes and Klaviyo coupon rules, posting notifications to a Discord channel via webhook. Detects new, modified, and deleted coupons with rich embed formatting.

## Features

- Polls Shopify Admin API for price rules and discount codes
- Polls Klaviyo Coupons API for coupon rules (optional)
- Filters out Klaviyo-generated bulk discount codes from Shopify notifications
- Detects new, edited, and deleted discounts/coupons
- Sends color-coded Discord embeds (green = new, orange = edited, red = deleted, purple = Klaviyo)
- High-value discount alerts when amount exceeds a configurable threshold
- Silent first run to avoid spamming on startup
- Local JSON store for change detection across restarts
- Health check endpoint for uptime monitoring
- OAuth 2.0 authorization (offline access token that doesn't expire)

## Setup

### 1. Create a Shopify App

1. Go to the [Shopify Partners Dashboard](https://partners.shopify.com) or your store's developer settings
2. Create a new app
3. Note the **Client ID** and **Client Secret**
4. Under **Configuration**, set the allowed redirection URL to `{YOUR_APP_URL}/auth/callback`
5. Request the `read_price_rules` and `read_discounts` scopes

### 2. Discord Webhook

1. Open your Discord server settings
2. Go to **Integrations > Webhooks**
3. Create a new webhook, select the target channel, and copy the URL

### 3. Klaviyo API Key (Optional)

If your marketing team creates coupons in Klaviyo (which auto-generates many discount codes in Shopify), enable Klaviyo integration to:
- Monitor Klaviyo coupon rules directly
- Filter out Klaviyo-generated bulk codes from Shopify notifications

To set up:
1. Go to **Klaviyo > Settings > API Keys**
2. Create a private API key with read access to Coupons
3. Add the key as `KLAVIYO_API_KEY` in your environment variables

### 4. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description | Required |
|---|---|---|
| `SHOPIFY_STORE` | Your store domain (e.g. `my-store.myshopify.com`) | Yes |
| `SHOPIFY_CLIENT_ID` | Shopify app Client ID | Yes |
| `SHOPIFY_CLIENT_SECRET` | Shopify app Client Secret | Yes |
| `SHOPIFY_SCOPES` | OAuth scopes (default: `read_price_rules,read_discounts`) | No |
| `SHOPIFY_ACCESS_TOKEN` | Set after OAuth to persist across redeployments | No |
| `APP_URL` | Public URL of this app (e.g. `https://your-app.up.railway.app`) | Yes |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL | Yes |
| `POLL_INTERVAL_MINUTES` | How often to check for changes (default: 5) | No |
| `PORT` | Health check server port (default: 3000) | No |
| `HIGH_VALUE_THRESHOLD` | Dollar amount that triggers high-value alerts (default: 500) | No |
| `KLAVIYO_API_KEY` | Klaviyo private API key for coupon monitoring | No |
| `KLAVIYO_FILTER_THRESHOLD` | Code count threshold for Klaviyo filtering (default: 10) | No |

### 5. Authorize & Run

```bash
npm install
npm start
```

On first run, the app will print:
```
No Shopify token found. Visit {APP_URL}/auth to authorize the app.
```

1. Open `{APP_URL}/auth` in your browser
2. You'll be redirected to Shopify to authorize the app
3. After approving, you'll be redirected back and the app will start polling automatically

The OAuth token is stored locally in `data/token.json` and persists across restarts. It's an offline access token that doesn't expire.

## Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) and create a new project
3. Select **Deploy from GitHub repo**
4. Add your environment variables in the Railway dashboard (make sure `APP_URL` matches your Railway deployment URL)
5. Railway will detect the `npm start` script and deploy automatically
6. Once deployed, visit `{APP_URL}/auth` to authorize the app with Shopify
7. After OAuth, copy the `SHOPIFY_ACCESS_TOKEN` from the callback page and add it as a Railway env var

The health check endpoint at `GET /` returns the service status, authorization state, and last poll times for both Shopify and Klaviyo.

## How It Works

1. On startup, checks for a stored OAuth token in `data/token.json` or `SHOPIFY_ACCESS_TOKEN` env var
2. If no token, waits for the user to complete OAuth via `/auth`
3. Once authorized, fetches all existing discounts and stores them locally (no notifications sent on first sync)
4. If Klaviyo is configured, fetches all existing coupon rules too (silent first sync)
5. Every N minutes, polls Klaviyo first (to get coupon names for filtering), then polls Shopify
6. Shopify price rules that match a Klaviyo coupon name or have 10+ discount codes are filtered out
7. Sends Discord notifications for any new, modified, or deleted discounts/coupons
8. Updates the local store after each poll cycle
