const express = require('express');
const fetch = require('node-fetch');
const { asyncRoute } = require('../../../_utils/network/asyncRoute');
const { httpsRequest } = require('../../../_utils/network/httpReq');
const { getPayuCreds } = require('../../../_utils/payu/getPayCredsForOrg');
const { checkPayuOrderStatus } = require('../../../_utils/payu/checkPayuOrderStatus');

const router = express.Router();

function resolveClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0];
  }
  return req.ip;
}

async function fetchClientCredentialsToken(baseUrl, clientId, clientSecret) {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(`${baseUrl}/pl/standard/user/oauth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(`PayU token request failed: ${response.status} ${response.statusText}`);
  }

  if (!result?.access_token) {
    throw new Error('PayU token response missing access_token');
  }

  return { token: result.access_token, expiresIn: result.expires_in };
}

router.post(
  '/orders/one-time',
  asyncRoute(async (req, res) => {
    const orgId = req.activeOrgId;
    const source = req.source;

    if (!orgId) {
      return res.status(400).json({ error: 'Organization context is missing' });
    }

    if (!source) {
      return res.status(400).json({ error: 'X-SOURCE header is required' });
    }

    const { totalAmount, description, continueUrl, buyer, currencyCode, extOrderId, ...rest } = req.body || {};

    if (!totalAmount || Number.isNaN(Number(totalAmount))) {
      return res.status(400).json({ error: 'totalAmount must be provided as a numeric string' });
    }
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'description must be provided' });
    }
    if (!continueUrl || typeof continueUrl !== 'string') {
      return res.status(400).json({ error: 'continueUrl must be provided' });
    }
    if (!buyer || typeof buyer !== 'object') {
      return res.status(400).json({ error: 'buyer object must be provided' });
    }

    const { baseUrl, clientId, clientSecret, posId } = getPayuCreds(orgId);

    const { token } = await fetchClientCredentialsToken(baseUrl, clientId, clientSecret);

    const payload = {
      ...rest,
      totalAmount,
      description,
      continueUrl,
      buyer,
      currencyCode: currencyCode || 'PLN',
      merchantPosId: posId,
      customerIp: resolveClientIp(req),
      extOrderId:
        typeof extOrderId === 'string' && extOrderId.length <= 128
          ? extOrderId
          : `guest-${orgId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    };

    const { statusCode, json, body } = await httpsRequest('POST', `${baseUrl}/api/v2_1/orders`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: payload,
    });

    if (json?.redirectUri) {
      return res.status(200).json({
        status: 'redirect_required',
        redirectUri: json.redirectUri,
        orderId: json.orderId,
        extOrderId: payload.extOrderId,
      });
    }

    return res.status(statusCode || 500).json({
      error: 'Unexpected PayU response',
      details: json || body,
    });
  })
);

router.get(
  '/orders/:orderId',
  asyncRoute(async (req, res) => {
    const orgId = req.activeOrgId;
    const source = req.source;
    const { orderId } = req.params;

    if (!orgId) {
      return res.status(400).json({ error: 'Organization context is missing' });
    }

    if (!source) {
      return res.status(400).json({ error: 'X-SOURCE header is required' });
    }

    if (!orderId || typeof orderId !== 'string' || orderId.length < 4) {
      return res.status(400).json({ error: 'Valid orderId path parameter is required' });
    }

    const status = await checkPayuOrderStatus(orgId, orderId);
    return res.json(status);
  })
);

module.exports = router;
