const crypto = require('crypto');
const config = require('./config');
const { saveToken } = require('./token');

/**
 * Verify the HMAC signature on the OAuth callback query params.
 * Shopify signs all params except `hmac` itself with the client secret.
 */
function verifyHmac(query) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;

  // Sort params alphabetically and join as key=value&key=value
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join('&');

  const digest = crypto
    .createHmac('sha256', config.shopifyClientSecret)
    .update(message)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'));
}

function registerRoutes(app, onTokenAcquired) {
  // Redirect to Shopify's OAuth authorization page
  app.get('/auth', (_req, res) => {
    const redirectUri = `${config.appUrl}/auth/callback`;

    // Use offline access (omit grant_options for offline, which is the default)
    const offlineAuthUrl =
      `https://${config.shopifyStore}/admin/oauth/authorize` +
      `?client_id=${config.shopifyClientId}` +
      `&scope=${config.shopifyScopes}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    res.redirect(offlineAuthUrl);
  });

  // Handle the OAuth callback
  app.get('/auth/callback', async (req, res) => {
    try {
      // Verify HMAC
      if (!verifyHmac(req.query)) {
        console.error('[Auth] HMAC validation failed');
        return res.status(403).send('HMAC validation failed. Request may have been tampered with.');
      }

      const { code, shop } = req.query;

      if (!code || !shop) {
        return res.status(400).send('Missing code or shop parameter.');
      }

      // Exchange authorization code for access token
      const tokenResponse = await fetch(
        `https://${shop}/admin/oauth/access_token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: config.shopifyClientId,
            client_secret: config.shopifyClientSecret,
            code,
          }),
        }
      );

      if (!tokenResponse.ok) {
        const body = await tokenResponse.text();
        console.error(`[Auth] Token exchange failed: ${tokenResponse.status} — ${body}`);
        return res.status(500).send('Failed to exchange authorization code for access token.');
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      saveToken(accessToken);

      // Log the token so the user can persist it in Railway env vars
      console.log('[Auth] =========================================');
      console.log('[Auth] Token acquired! Add this as SHOPIFY_ACCESS_TOKEN');
      console.log('[Auth] in your Railway env vars to persist across redeployments:');
      console.log(`[Auth] ${accessToken}`);
      console.log('[Auth] =========================================');

      // Notify the caller so polling can start
      if (onTokenAcquired) {
        onTokenAcquired();
      }

      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Successful</title></head>
        <body style="font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px;">
          <h1>Authorization Successful!</h1>
          <p>The discount monitor is now active and polling for changes.</p>
          <hr>
          <h2>Important: Persist your token</h2>
          <p>To keep the app working across Railway redeployments, add this environment variable in your Railway dashboard:</p>
          <p><strong>Variable name:</strong> <code>SHOPIFY_ACCESS_TOKEN</code></p>
          <p><strong>Value:</strong></p>
          <pre style="background: #f4f4f4; padding: 12px; border-radius: 4px; word-break: break-all;">${accessToken}</pre>
          <p style="color: #666; font-size: 14px;">This is an offline access token that does not expire. You can close this tab once you've saved it.</p>
        </body>
        </html>
      `);
    } catch (err) {
      console.error('[Auth] Callback error:', err.message);
      res.status(500).send('An error occurred during authorization.');
    }
  });
}

module.exports = { registerRoutes };
