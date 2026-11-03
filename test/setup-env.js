// Minimal env so modules that require ./config can load in tests.
process.env.SHOPIFY_STORE ||= 'test-store.myshopify.com';
process.env.SHOPIFY_CLIENT_ID ||= 'test-client-id';
process.env.SHOPIFY_CLIENT_SECRET ||= 'test-secret';
process.env.DISCORD_WEBHOOK_URL ||= 'https://discord.invalid/webhook';
process.env.APP_URL ||= 'https://app.invalid';
