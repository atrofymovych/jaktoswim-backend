const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { getOrgConnection } = require('../../../connection');
const router = express.Router();

function getOrgCredentials(orgId) {
  console.group(`[DEBUG] getOrgCredentials for ORG_ID=${orgId}`);
  const clientId = String(process.env[`${orgId}_PAYU_CLIENT_ID`]);
  const clientSecret = String(process.env[`${orgId}_PAYU_CLIENT_SECRET`]);
  const posId = String(process.env[`${orgId}_PAYU_MERCHANT_POS_ID`]);
  const secondKey = String(process.env[`${orgId}_PAYU_SECOND_KEY`]);
  const isSandbox = String(process.env[`${orgId}_PAYU_IS_SANDBOX`]) === 'true';
  const baseUrl = isSandbox ? 'https://secure.snd.payu.com' : 'https://secure.payu.com';

  console.log(`[DEBUG] _PAYU_CLIENT_ID       ${clientId}`);
  console.log(`[DEBUG] _PAYU_CLIENT_SECRET   ${clientSecret}`);
  console.log(`[DEBUG] _PAYU_MERCHANT_POS_ID ${posId}`);
  console.log(`[DEBUG] _PAYU_SECOND_KEY      ${secondKey}`);
  console.log(`[DEBUG] _PAYU_IS_SANDBOX      ${isSandbox}`);

  if (!clientId || !clientSecret || !posId || !secondKey) {
    console.error('[ERROR] missing credentials for orgId');
    throw new Error(`PayU credentials not found for ORG_ID=${orgId}`);
  }
  console.groupEnd();
  return { clientId, clientSecret, posId, baseUrl, secondKey };
}

router.post('/', async (req, res) => {
  console.log('==========================[ PAYU WEBHOOK HANDLER - BY THE DOCS ]==========================');
  let orgId, userId, orderId;

  try {
    // 1. ПАРСИНГ И БАЗОВАЯ ВАЛИДАЦИЯ
    // =================================================================
    const rawJson = req.body.toString('utf8');
    if (!rawJson) {
      console.warn('[WARN] Received empty request body.');
      return res.status(400).send('Empty body');
    }

    const notification = JSON.parse(rawJson);
    orderId = notification.order?.orderId;
    if (!orderId) {
      console.error('[ERROR] Notification is missing order.orderId.');
      return res.status(400).send('Missing orderId in notification');
    }
    console.log(`[INFO] Processing notification for orderId: ${orderId}`); // 2. ПРОВЕРКА ПОДПИСИ (SECURITY) // =================================================================

    orgId = notification.order?.extOrderId?.split('-').find((p) => p.startsWith('org_'));
    if (!orgId) {
      console.error(`[ERROR] Could not extract orgId from extOrderId: ${notification.order?.extOrderId}`);
      return res.status(400).send('Cannot determine organization from extOrderId');
    }

    const { secondKey, clientId, clientSecret, baseUrl } = getOrgCredentials(orgId);
    const signatureHeader = req.headers['openpayu-signature'] || '';
    const signature = signatureHeader.match(/signature=([^;]+)/)?.[1];
    const algorithm = signatureHeader.match(/algorithm=([^;]+)/)?.[1] || 'sha256';
    const expectedSignature = crypto
      .createHash(algorithm.toLowerCase())
      .update(rawJson + secondKey)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error(`[SECURITY] Invalid signature for orderId: ${orderId}`);
      return res.status(403).send('Invalid signature');
    }
    console.log(`[SUCCESS] Signature for orderId: ${orderId} is valid.`); // 3. ПРОВЕРКА СТАТУСА И ИДЕМПОТЕНТНОСТЬ // ================================================================= // Мы действуем только если платеж успешно завершен.

    if (notification.order?.status !== 'COMPLETED') {
      console.log(`[INFO] Order status is "${notification.order?.status}". No action needed.`);
      return res.sendStatus(200);
    } // ПРОВЕРКА НА ИДЕМПОТЕНТНОСТЬ: Убедимся, что мы еще не обрабатывали этот заказ. // Для этого в вашей модели PayUToken должно быть поле, где вы храните `orderId`. Например, `payuOrderId`.

    userId = notification.order?.buyer?.extCustomerId;
    const conn = getOrgConnection(orgId);
    const PayUToken = conn.model('PayUToken');
    const alreadyProcessed = await PayUToken.findOne({ payuOrderId: orderId });
    if (alreadyProcessed) {
      console.log(`[INFO] Order ${orderId} has already been processed. Skipping to ensure idempotency.`);
      return res.sendStatus(200);
    } // 4. ВЗАИМОДЕЙСТВИЕ С API PAYU // ================================================================= // Получаем OAuth токен

    const tokenResp = await fetch(`${baseUrl}/pl/standard/user/oauth/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) throw new Error('Failed to obtain OAuth token from PayU'); // Делаем ЕДИНСТВЕННЫЙ запрос за деталями заказа.
    console.log(`[INFO] Fetching details for order ${orderId}`);
    const orderDetailsResp = await fetch(`${baseUrl}/api/v2_1/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!orderDetailsResp.ok) {
      const errorText = await orderDetailsResp.text();
      throw new Error(`PayU API error fetching order details: ${orderDetailsResp.status} - ${errorText}`);
    }
    const orderDetailsEnvelope = await orderDetailsResp.json();
    console.log('[DEBUG] Received order details from PayU API:', JSON.stringify(orderDetailsEnvelope, null, 2)); // 5. ИЗВЛЕЧЕНИЕ ТОКЕНА И СОХРАНЕНИЕ В БАЗУ // =================================================================

    const orderData = orderDetailsEnvelope.orders?.[0];
    if (!orderData) throw new Error('Order data array is missing in PayU API response');

    const payMethod = orderData.payMethods?.payMethod || orderData.payMethod;
    const multiUseToken = payMethod?.value; // Проверяем, действительно ли мы получили токен TOKC_

    if (!multiUseToken || !multiUseToken.startsWith('TOKC_')) {
      console.warn(
        `[WARN] Order ${orderId} completed, but NO multi-use token (TOKC_) was found in the order details. This is likely a PayU account setting issue.`
      ); // Мы всё равно возвращаем 200, потому что технически мы обработали уведомление успешно.
      return res.sendStatus(200);
    }

    console.log(`[SUCCESS] 🏆 Found multi-use token ${multiUseToken} for order ${orderId}!`);
    const cardData = payMethod?.card || orderData.card;
    await PayUToken.create({
      orgId,
      userId,
      token: multiUseToken,
      payuOrderId: orderId, // Сохраняем ID заказа для проверки идемпотентности
      maskedPan: cardData?.number,
      brand: cardData?.brand,
      expiryMonth: cardData?.expirationMonth,
      expiryYear: cardData?.expirationYear,
      status: 'ACTIVE',
    });
    console.log(`[SUCCESS] Token for order ${orderId} saved to database.`); // 6. УСПЕШНЫЙ ОТВЕТ // ================================================================= // Сообщаем PayU, что все прошло хорошо.

    return res.sendStatus(200);
  } catch (err) {
    // В случае любой ошибки, логируем её и отвечаем PayU ошибкой 500.
    // PayU попытается прислать уведомление еще раз позже.
    console.error(`[FATAL] Webhook failed for orderId ${orderId}:`, err);
    return res.status(500).json({ status: 'error', message: err.message });
  } finally {
    console.log('==========================[ PAYU WEBHOOK HANDLER DONE ]=====================================');
  }
});

module.exports = router;

module.exports = router;
