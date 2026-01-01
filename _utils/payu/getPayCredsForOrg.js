const PAYU_PROD_URL = 'https://secure.payu.com';
const PAYU_SANDBOX_URL = 'https://secure.snd.payu.com';

function getPayuCreds(orgId) {
  const clientId = String(process.env[`${orgId}_PAYU_CLIENT_ID`]);
  const clientSecret = String(process.env[`${orgId}_PAYU_CLIENT_SECRET`]);
  const posId = String(process.env[`${orgId}_PAYU_MERCHANT_POS_ID`]);
  const secondKey = String(process.env[`${orgId}_PAYU_SECOND_KEY`]);
  const isSandbox = String(process.env[`${orgId}_PAYU_IS_SANDBOX`]) === 'true';
  const baseUrl = isSandbox ? PAYU_SANDBOX_URL : PAYU_PROD_URL;

  if (!clientId || !clientSecret || !posId || !secondKey) {
    console.error('[ERROR] missing credentials for orgId');
    throw new Error(`PayU credentials not found for ORG_ID=${orgId}`);
  }

  console.groupEnd();
  return { clientId, clientSecret, posId, baseUrl, secondKey };
}

module.exports = { getPayuCreds, PAYU_PROD_URL, PAYU_SANDBOX_URL };
