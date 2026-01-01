const express = require('express');
const fetch = require('node-fetch');
const { httpsRequest } = require('../../../_utils/network/httpReq');
const { checkPayuOrderStatus } = require('../../../_utils/payu/checkPayuOrderStatus');
const { getPayuCreds } = require('../../../_utils/payu/getPayCredsForOrg');
const router = express.Router();
const PAYU_PROD_URL = 'https://secure.payu.com';
const PAYU_SANDBOX_URL = 'https://secure.snd.payu.com';


function attachPayU(req, res, next) {
  try {
    const orgId = req.get('X-ORG-ID');
    const authHeader = req.get('X-PayU-Authorization');

    if (!orgId) return res.status(400).json({ error: 'X-ORG-ID header is required' });
    if (!authHeader) return res.status(400).json({ error: 'X-PayU-Authorization header is required' });

    const creds = getPayuCreds(orgId);
    const token = authHeader.replace(/^Bearer\s+/i, '');

    req.payu = { ...creds, token };
    req.activeOrgId = orgId;

    console.groupEnd();
    next();
  } catch (err) {
    console.error('[ERROR] attachPayU', err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
}

// Функция поллинга для проверки статуса заказа
async function pollOrderStatus(orgId, orderId, maxAttempts = 30, intervalMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const orderStatus = await checkPayuOrderStatus(orgId, orderId);


      if (orderStatus.status === 'COMPLETED') {
        return { success: true, orderStatus };
      }

      if (orderStatus.status === 'CANCELLED' || orderStatus.status === 'REJECTED') {
        return { success: false, orderStatus, error: `Order ${orderStatus.status.toLowerCase()}` };
      }

      // Если статус еще PENDING или NEW, ждем и повторяем
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    } catch (error) {
      console.error(`[ERROR] Polling attempt ${attempt} failed for order ${orderId}:`, error.message);
      if (attempt === maxAttempts) {
        return { success: false, error: error.message };
      }
      // Ждем перед следующей попыткой даже при ошибке
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return { success: false, error: 'Polling timeout - order status not completed' };
}

// =================================================================
router.post('/token', async (req, res) => {
  console.group('[DEBUG] POST /token');
  try {
    const orgId = req.get('X-ORG-ID');
    if (!orgId) return res.status(400).json({ error: 'X-ORG-ID header is required' });

    const { clientId, clientSecret, baseUrl } = getPayuCreds(orgId);
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const resp = await fetch(`${baseUrl}/pl/standard/user/oauth/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await resp.json();

    if (!resp.ok) return res.status(resp.status).json(`${data} ${clientId} ${clientSecret}`);

    res.json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (err) {
    console.error('[ERROR] POST /token', err);
    res.status(500).json({ error: err.message });
  } finally {
    console.groupEnd();
  }
});

// =================================================================
router.post('/orders', attachPayU, async (req, res) => {
  console.group('[DEBUG] POST /orders via token (https)');
  try {
    const { baseUrl, token: payuToken, posId } = req.payu;
    const userId = req.auth()?.userId;
    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { token: feToken, ...rest } = req.body;

    const payload = {
      merchantPosId: posId,
      payMethods: { payMethod: { type: 'CARD_TOKEN', value: feToken } },
      customerIp: req.ip,
      cardOnFile: 'FIRST',
      ...rest,
    };

    const url = `${baseUrl}/api/v2_1/orders`;
    const { statusCode, headers, json, body } = await httpsRequest('POST', url, {
      headers: {
        Authorization: `Bearer ${payuToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: payload,
    });

    // Перед редиректом сохраняем карту в статусе INACTIVE, если PayU вернул токен карты
    if (json) {
      const pmAtCreate = json?.payMethods?.payMethod || json?.payMethod;
      const orderIdAtCreate = json?.orderId;
      if (pmAtCreate?.type === 'CARD_TOKEN' && pmAtCreate.value && orderIdAtCreate) {
        try {
          const { PayUToken } = req.models;
          const existing = await PayUToken.findOne({
            orgId: req.activeOrgId,
            userId,
            token: pmAtCreate.value,
          });

          if (!existing) {
            await PayUToken.create({
              orgId: req.activeOrgId,
              userId,
              token: pmAtCreate.value,
              maskedPan: pmAtCreate.card?.number || null,
              expiryMonth: pmAtCreate.card?.expirationMonth || null,
              expiryYear: pmAtCreate.card?.expirationYear || null,
              brand: pmAtCreate.card?.brand || null,
              status: 'INACTIVE',
              threeDsProtocolVersion: json?.threeDsProtocolVersion || null,
              redirectUri: json?.redirectUri || headers?.location || null,
              lastStatusCode: null,
              lastStatusSeverity: null,
            });
          } else {
            existing.maskedPan = pmAtCreate.card?.number || null;
            existing.expiryMonth = pmAtCreate.card?.expirationMonth || null;
            existing.expiryYear = pmAtCreate.card?.expirationYear || null;
            existing.brand = pmAtCreate.card?.brand || null;
            existing.status = 'INACTIVE';
            existing.threeDsProtocolVersion = json?.threeDsProtocolVersion || null;
            existing.redirectUri = json?.redirectUri || headers?.location || null;
            existing.lastStatusCode = null;
            existing.lastStatusSeverity = null;
            await existing.save();
          }
        } catch (e) {
          console.error('[ERROR] Saving INACTIVE PayUToken at create', e);
        }
      }
    }

    // Если PayU требует редирект (3DS), отдаём его на фронт и не поллим здесь
    const immediateRedirectUri = json?.redirectUri || headers?.location;
    if (immediateRedirectUri) {
      console.groupEnd();
      return res.status(200).json({
        status: 'redirect_required',
        redirectUri: immediateRedirectUri,
        orderId: json?.orderId || null,
      });
    }

    return res.status(200).json(json);
  } catch (err) {
    console.error('[ERROR] POST /orders via token (https)', err);
    console.groupEnd();
    return res.status(500).json({ error: err.message });
  }
});

router.post('/orders/:orderId/complete', attachPayU, async (req, res) => {
  const { orderId } = req.params;
  console.group(`[DEBUG] POST /orders/${orderId}/complete`);
  try {
    const userId = req.auth()?.userId;
    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const pollResult = await pollOrderStatus(req.activeOrgId, orderId);

    if (pollResult.success && pollResult.orderStatus.status === 'COMPLETED') {
      const { PayUToken } = req.models;

      try {
        const existing = await PayUToken.findOne({
          orgId: req.activeOrgId,
          userId,
          status: 'INACTIVE',
        }).sort({ createdAt: -1 });

        if (existing) {
          existing.status = 'ACTIVE';
          existing.lastStatusCode = pollResult.orderStatus.statusCode || null;
          existing.lastStatusSeverity = pollResult.orderStatus.severity || null;
          await existing.save();
        }
      } catch (e) {
        console.error('[ERROR] Activating card after completion', e);
      }

      console.groupEnd();
      return res.status(200).json({
        status: 'COMPLETED',
        cardSaved: true,
        orderStatus: pollResult.orderStatus,
      });
    }

    console.groupEnd();
    return res.status(200).json({
      status: pollResult.orderStatus?.status || 'unknown',
      cardSaved: false,
      orderStatus: pollResult.orderStatus || null,
      pollingError: pollResult.error || null,
    });
  } catch (err) {
    console.error(`[ERROR] POST /orders/${orderId}/complete`, err);
    console.groupEnd();
    return res.status(500).json({ error: err.message });
  }
});

router.get('/orders/:orderId', attachPayU, async (req, res) => {
  const { orderId } = req.params;
  console.group(`[DEBUG] GET /orders/${orderId}`);
  try {
    const { baseUrl, token } = req.payu;
    const resp = await fetch(`${baseUrl}/api/v2_1/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error(`[ERROR] GET /orders/${orderId}`, err);
    res.status(500).json({ error: err.message });
  } finally {
    console.groupEnd();
  }
});

// =================================================================
router.delete('/orders/:orderId', attachPayU, async (req, res) => {
  const { orderId } = req.params;
  console.group(`[DEBUG] DELETE /orders/${orderId}`);
  try {
    const { baseUrl, token } = req.payu;
    const resp = await fetch(`${baseUrl}/api/v2_1/orders/${orderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 204) return res.status(204).send();
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error(`[ERROR] DELETE /orders/${orderId}`, err);
    res.status(500).json({ error: err.message });
  } finally {
    console.groupEnd();
  }
});

// =================================================================
router.get('/cards', attachPayU, async (req, res) => {
  console.group('[DEBUG] GET /cards');
  try {
    const userId = req.auth()?.userId;
    const { PayUToken } = req.models;
    const cards = await PayUToken.find({
      orgId: req.activeOrgId,
      userId,
      status: 'ACTIVE',
    })
      .select('token maskedPan brand expiryMonth expiryYear')
      .lean();
    res.json(cards);
  } catch (err) {
    console.error('[ERROR] GET /cards', err);
    res.status(500).json({ error: err.message });
  } finally {
    console.groupEnd();
  }
});

// =================================================================
router.delete('/cards/:cardToken', attachPayU, async (req, res) => {
  console.group('[DEBUG] DELETE /cards/:cardToken');
  try {
    const { cardToken } = req.params;
    const userId = req.auth()?.userId;
    const { PayUToken } = req.models;
    const updated = await PayUToken.findOneAndUpdate(
      { orgId: req.activeOrgId, userId, token: cardToken, status: 'ACTIVE' },
      { status: 'INACTIVE' },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Active card not found' });

    res.json({ status: 'card_unlinked', cardToken });
  } catch (err) {
    console.error('[ERROR] DELETE /cards/:cardToken', err);
    res.status(500).json({ error: err.message });
  } finally {
    console.groupEnd();
  }
});

// =================================================================
router.post('/orders/recurring', attachPayU, async (req, res) => {
  console.group('[DEBUG] POST /orders/recurring');
  try {
    const { baseUrl, token, posId } = req.payu;
    const userId = req.auth()?.userId;
    const { totalAmount, description, extOrderId } = req.body;
    const url = `${baseUrl}/api/v2_1/orders`;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { PayUToken } = req.models;
    const savedToken = await PayUToken.findOne({
      userId,
      orgId: req.activeOrgId,
      status: 'ACTIVE',
    });

    if (!savedToken) {
      console.error(`[DEBUG] /recurring: No active token found for user ${userId}`);
      return res.status(404).json({ error: 'No active saved card found for this user.' });
    }

    const payload = {
      ...req.body,
      customerIp: req.ip,
      merchantPosId: posId,
      extOrderId: extOrderId || `recurr-${userId}-${Date.now()}`,
      description,
      totalAmount,
      currencyCode: 'PLN',
      payMethods: {
        payMethod: {
          type: 'CARD_TOKEN',
          value: savedToken.token,
        },
      },
      cardOnFile: 'STANDARD_MERCHANT',
    };

    const { statusCode, headers, json, body } = await httpsRequest('POST', url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: payload,
    });

    res.status(statusCode).json(json);
  } catch (err) {
    console.error('[ERROR] POST /orders/recurring', err);
    res.status(500).json({ error: err.message });
  } finally {
    console.groupEnd();
  }
});

router.post('/orders/one-time', attachPayU, async (req, res) => {
  try {
    const { baseUrl, token, posId } = req.payu;
    const { userId } = req.auth;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { totalAmount, description, continueUrl, buyer } = req.body;
    if (!totalAmount || !description || !continueUrl || !buyer) {
      return res.status(400).json({
        error: '`totalAmount`, `description`, `continueUrl`, and `buyer` object are required',
      });
    }

    const payload = {
      ...req.body,
      merchantPosId: posId,
      customerIp: req.body.customerIp || req.ip,
      extOrderId: req.body.extOrderId || `one-time-${userId}-${Date.now()}`,
      currencyCode: req.body.currencyCode || 'PLN',
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
      });
    }

    return res.status(statusCode || 500).json({
      error: 'Unexpected PayU response',
      details: json || body,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
