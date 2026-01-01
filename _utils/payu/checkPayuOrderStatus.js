const { getPayuCreds } = require('./getPayCredsForOrg');
const { payuToken } = require('./getPayTokenForOrgId');
const fetch = require('node-fetch');

async function checkPayuOrderStatus(orgId, orderId) {
  const { baseUrl } = getPayuCreds(orgId);
  const { access_token } = await payuToken(orgId);

  const response = await fetch(`${baseUrl}/api/v2_1/orders/${orderId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`PayU order status error ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  // Extract the order data from PayU response
  const orderData = data.orders?.[0];
  if (!orderData) {
    throw new Error('Order not found in PayU response');
  }

  // Return structured status information with proper PayU mapping
  return {
    orderId: orderData.orderId,
    status: orderData.status, // PayU status: NEW, PENDING, COMPLETED, CANCELLED, REJECTED
    statusCode: orderData.status?.statusCode,
    statusDesc: orderData.status?.statusDesc,
    severity: orderData.status?.severity,
    totalAmount: orderData.totalAmount,
    currencyCode: orderData.currencyCode,
    extOrderId: orderData.extOrderId,
    createdAt: orderData.createdAt,
    updatedAt: orderData.updatedAt,
    // Payment method info if available
    payMethod: orderData.payMethods?.payMethod || orderData.payMethod,
    // 3DS info if available
    redirectUri: orderData.redirectUri,
    threeDsProtocolVersion: orderData.threeDsProtocolVersion,
    // Additional PayU fields
    unmappedstatus: orderData.unmappedstatus, // Internal PayU status
    error: orderData.error, // Error details if any
  };
}

module.exports = { checkPayuOrderStatus };
