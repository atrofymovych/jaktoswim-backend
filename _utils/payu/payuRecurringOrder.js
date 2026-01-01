const { getPayuCreds } = require('./getPayCredsForOrg');
const { payuToken } = require('./getPayTokenForOrgId');
const fetch = require('node-fetch');

async function payuRecurringOrder(
  orgId,
  userId,
  models,
  { totalAmount, description, extOrderId, customerIp, currencyCode, buyer }
) {
  const { baseUrl, posId } = getPayuCreds(orgId);
  const { access_token } = await payuToken(orgId);

  const tokenDoc = await models.PayUToken.findOne({
    orgId,
    userId,
    status: 'ACTIVE',
  }).lean();
  if (!tokenDoc) throw new Error('No active saved card token for user');

  const payload = {
    merchantPosId: posId,
    customerIp,
    extOrderId: extOrderId || `recurr-${userId}-${Date.now()}`,
    description,
    totalAmount,
    buyer,
    currencyCode,
    cardOnFile: 'STANDARD_MERCHANT',
    payMethods: { payMethod: { type: 'CARD_TOKEN', value: tokenDoc.token } },
  };

  const r = await fetch(`${baseUrl}/api/v2_1/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`PayU order error ${r.status}: ${body.status?.statusDesc || r.statusText}`);
  return body;
}

module.exports = { payuRecurringOrder };
