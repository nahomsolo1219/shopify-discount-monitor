# Shopify Discount Monitor

A lightweight polling service that monitors Shopify price rules and posts notifications to a Discord channel via webhook. Detects new, modified, and deleted coupons with rich embed formatting.

## Features

- Monitors Shopify price rules (not individual codes) — each rule shows up exactly once
- Works with Klaviyo, Smile, and any other app that creates discount rules in Shopify
- Detects new, edited, and deleted discount rules
- Sends color-coded Discord embeds (green = new, orange = edited, red = deleted)
- Shows discount restrictions: minimum purchase, minimum quantity, target selection, allocation method
- High-value discount alerts when amount exceeds a configurable threshold
- Discord rate limiting with 1s delay between messages and 429 retry handling
- At most 10 notifications per poll — anything beyond that is collapsed into one "N more changes" summary
- Format-insensitive change detection (e.g. `-10.0` vs `-10.00`, `{}` vs `null`) so API format changes don't look like edits
- Polls never overlap, and state is saved before notifications are sent
- Silent first run to avoid spamming on startup
- JSON store under a configurable `DATA_DIR` (attach a Railway volume to keep it across redeploys)
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
| `POLL_INTERVAL_MINUTES` | How often to check for changes, 1–59 (default: 5) | No |
| `SHOPIFY_API_VERSION` | Shopify Admin API version (default: `2026-10`) | No |
| `DATA_DIR` | Directory for the rule store and token file (default: `RAILWAY_VOLUME_MOUNT_PATH` if set, else `./data`) | No |
| `PORT` | Health check server port (default: 3000) | No |
| `HIGH_VALUE_THRESHOLD` | Dollar amount that triggers high-value alerts (default: 500) | No |

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

The OAuth token is stored in `$DATA_DIR/token.json` (default `data/token.json`) and persists across restarts. It's an offline access token that doesn't expire.

## Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) and create a new project
3. Select **Deploy from GitHub repo**
4. Add your environment variables in the Railway dashboard (make sure `APP_URL` matches your Railway deployment URL)
5. Railway will detect the `npm start` script and deploy automatically
6. Once deployed, visit `{APP_URL}/auth` to authorize the app with Shopify
7. After OAuth, copy the `SHOPIFY_ACCESS_TOKEN` from the callback page and add it as a Railway env var

### Persist state with a Railway volume

Without a volume, the container filesystem is wiped on every redeploy, so the store of known rules is lost and rebuilt (silently) on the next start. To keep it:

1. In the Railway dashboard, open the service and choose **New → Volume** (or right-click the service → **Attach volume**)
2. Set the mount path, e.g. `/data`
3. Add the env var `DATA_DIR=/data` (optional — Railway also sets `RAILWAY_VOLUME_MOUNT_PATH`, which the app uses when `DATA_DIR` is unset)
4. Redeploy. The startup log shows the data dir in use: `Starting poll cycle (every 5 minutes, Shopify API 2026-10, data dir /data)`

`known-discounts.json` and `token.json` are written there atomically (temp file + rename).

### Shopify API version

Shopify supports each Admin API version for about 12 months. Once a pinned version is retired, Shopify silently serves the oldest supported version instead, and response formats can change. The app defaults to `2026-10`; override with `SHOPIFY_API_VERSION` and bump it at least once a year. If Shopify serves a different version than requested, the app logs a warning once.

The health check endpoint at `GET /` returns the service status, authorization state, last poll time, whether a poll is in progress, and the Shopify API version in use.

## How It Works

The app monitors **price rules**, not individual discount codes. Whether a rule was created manually in Shopify or auto-generated by Klaviyo/Smile/another app, it shows up exactly once when first detected. Adding more codes to an existing rule does not trigger additional notifications.

1. On startup, checks for a stored OAuth token in `SHOPIFY_ACCESS_TOKEN` env var or `data/token.json`
2. If no token, waits for the user to complete OAuth via `/auth`
3. Once authorized, fetches all price rules from Shopify and stores them locally (no notifications on first sync)
4. Every N minutes (default 5), re-fetches and compares against the local store. If the previous poll is still running, the tick is skipped
5. Values are normalised before comparing (numbers, dates as instants, blank strings and empty ranges as "none"), so format-only differences are ignored. The fields that changed for each edited rule are logged
6. The new state is saved **before** any notification is sent, so a slow or rate-limited Discord can never cause the same change to be posted twice
7. Sends Discord notifications for new, modified, or deleted price rules — at most 10 per poll; if there are more, one summary message ("N more changes") covers the rest
8. Only changes to the rule itself (value, dates, restrictions, etc.) trigger edit notifications — code count changes are ignored
9. Klaviyo-versioned rules (titles ending in a timestamp) are skipped, with one summary log line per poll
10. Discord messages are sent sequentially with a 1-second delay to avoid rate limiting

## Tests

```bash
npm test
```
