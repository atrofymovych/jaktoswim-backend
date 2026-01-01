const { getPayuCreds } = require('./getPayCredsForOrg');
const fetch = require('node-fetch');

async function payuToken(orgId) {
  const { clientId, clientSecret, baseUrl } = getPayuCreds(orgId);
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const r = await fetch(`${baseUrl}/pl/standard/user/oauth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!r.ok) {
    const e = await r.text();
    throw new Error(`PayU token error ${r.status}: ${e}`);
  }
  const data = await r.json();
  return data;
}

module.exports = { payuToken };
