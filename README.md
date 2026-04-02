# Shopify Discount Monitor

A lightweight polling service that monitors Shopify price rules and posts notifications to a Discord channel via webhook. Detects new, modified, and deleted coupons with rich embed formatting.

## Features

- Monitors Shopify price rules (not individual codes) for efficient tracking
- Filters out bulk-generated rules (Klaviyo, apps) by code count threshold
- Detects new, edited, and deleted discount rules
- Sends color-coded Discord embeds (green = new, orange = edited, red = deleted)
- Shows discount restrictions: minimum purchase, minimum quantity, target selection, allocation method
- High-value discount alerts when amount exceeds a configurable threshold
- Discord rate limiting with 1s delay between messages and 429 retry handling
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

### 3. Environment Variables

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
| `BULK_CODE_THRESHOLD` | Skip price rules with this many+ codes (default: 10) | No |

### 4. Authorize & Run

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

## Filtering Bulk Discount Rules

Marketing tools like Klaviyo auto-generate hundreds of unique discount codes under a single Shopify price rule. To avoid notification spam, the app skips any price rule that has more discount codes than `BULK_CODE_THRESHOLD` (default: 10). Only manually-created rules with a small number of codes are tracked.

## Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) and create a new project
3. Select **Deploy from GitHub repo**
4. Add your environment variables in the Railway dashboard (make sure `APP_URL` matches your Railway deployment URL)
5. Railway will detect the `npm start` script and deploy automatically
6. Once deployed, visit `{APP_URL}/auth` to authorize the app with Shopify
7. After OAuth, copy the `SHOPIFY_ACCESS_TOKEN` from the callback page and add it as a Railway env var

The health check endpoint at `GET /` returns the service status, authorization state, and last poll time.

## How It Works

1. On startup, checks for a stored OAuth token in `SHOPIFY_ACCESS_TOKEN` env var or `data/token.json`
2. If no token, waits for the user to complete OAuth via `/auth`
3. Once authorized, fetches all price rules from Shopify
4. For each price rule, gets the discount code count (lightweight count endpoint)
5. Skips rules with 10+ codes (bulk/app-generated) — configurable via `BULK_CODE_THRESHOLD`
6. Stores remaining rules locally (no notifications sent on first sync)
7. Every N minutes, re-fetches and compares against the local store
8. Sends Discord notifications for any new, modified, or deleted price rules
9. Discord messages are sent sequentially with a 1-second delay to avoid rate limiting
