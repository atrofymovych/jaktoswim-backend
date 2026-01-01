/**
 * Get Stripe credentials for a specific organization
 * @param {string} orgId - Organization ID
 * @returns {Object} Stripe credentials object
 */
function getStripeCredsForOrg(orgId) {
  console.group(`[DEBUG] getStripeCredsForOrg for ORG_ID=${orgId}`);

  const publicKey = String(process.env[`${orgId}_STRIPE_PUBLIC_KEY`]);
  const secretKey = String(process.env[`${orgId}_STRIPE_SECRET_KEY`]);
  const webhookSecret = String(process.env[`${orgId}_STRIPE_WEBHOOK_SECRET`]);
  const isTestMode = String(process.env[`${orgId}_STRIPE_TEST_MODE`]) === 'true';

  console.log(`[DEBUG] _STRIPE_PUBLIC_KEY    ${publicKey ? '***' + publicKey.slice(-4) : 'NOT_SET'}`);
  console.log(`[DEBUG] _STRIPE_SECRET_KEY    ${secretKey ? '***' + secretKey.slice(-4) : 'NOT_SET'}`);
  console.log(`[DEBUG] _STRIPE_WEBHOOK_SECRET ${webhookSecret ? '***' + webhookSecret.slice(-4) : 'NOT_SET'}`);
  console.log(`[DEBUG] _STRIPE_TEST_MODE     ${isTestMode}`);

  if (!publicKey || !secretKey) {
    console.error('[ERROR] Missing Stripe credentials for orgId');
    throw new Error(`Stripe credentials not found for ORG_ID=${orgId}`);
  }

  console.groupEnd();

  return {
    publicKey,
    secretKey,
    webhookSecret,
    isTestMode,
    // Stripe API base URL (same for test and live)
    baseUrl: 'https://api.stripe.com'
  };
}

module.exports = { getStripeCredsForOrg };
