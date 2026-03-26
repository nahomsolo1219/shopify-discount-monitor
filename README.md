# Shopify Discount Monitor

A lightweight polling service that monitors Shopify discount codes and posts notifications to a Discord channel via webhook. Detects new, modified, and deleted coupons with rich embed formatting.

## Features

- Polls Shopify Admin API for price rules and discount codes
- Detects new, edited, and deleted discounts
- Sends color-coded Discord embeds (green = new, orange = edited, red = deleted)
- High-value discount alerts when amount exceeds a configurable threshold
- Silent first run to avoid spamming on startup
- Local JSON store for change detection across restarts
- Health check endpoint for uptime monitoring

## Setup

### 1. Shopify Access Token

Create a custom app in your Shopify admin:

1. Go to **Settings > Apps and sales channels > Develop apps**
2. Create a new app
3. Under **Configuration**, add the `read_price_rules` and `read_discounts` Admin API scopes
4. Install the app and copy the Admin API access token

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
| `SHOPIFY_ACCESS_TOKEN` | Shopify Admin API access token | Yes |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL | Yes |
| `POLL_INTERVAL_MINUTES` | How often to check for changes (default: 5) | No |
| `PORT` | Health check server port (default: 3000) | No |
| `HIGH_VALUE_THRESHOLD` | Dollar amount that triggers high-value alerts (default: 500) | No |

### 4. Run

```bash
npm install
npm start
```

## Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) and create a new project
3. Select **Deploy from GitHub repo**
4. Add your environment variables in the Railway dashboard
5. Railway will detect the `npm start` script and deploy automatically

The health check endpoint at `GET /` returns the service status and last poll time.

## How It Works

1. On startup, fetches all existing discounts and stores them locally (no notifications sent)
2. Every N minutes, fetches current discounts and compares against the local store
3. Sends Discord notifications for any new, modified, or deleted discounts
4. Updates the local store after each poll cycle
