const express = require('express');
const { httpsRequest } = require('../../../_utils/network/httpReq');
const { getStripeCredsForOrg } = require('../../../_utils/stripe/getStripeCredsForOrg');
const router = express.Router();

/**
 * Middleware to attach Stripe credentials to request
 */
function attachStripe(req, res, next) {
  try {
    const orgId = req.get('X-ORG-ID');
    const authHeader = req.get('X-Stripe-Authorization');

    if (!orgId) return res.status(400).json({ error: 'X-ORG-ID header is required' });
    if (!authHeader) return res.status(400).json({ error: 'X-Stripe-Authorization header is required' });

    const creds = getStripeCredsForOrg(orgId);
    const token = authHeader.replace(/^Bearer\s+/i, '');

    req.stripe = { ...creds, token };
    req.activeOrgId = orgId;

    next();
  } catch (err) {
    console.error('[ERROR] attachStripe', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Create a Payment Intent
 * POST /stripe/payment-intents
 */
router.post('/payment-intents', attachStripe, async (req, res) => {
  console.group('[DEBUG] POST /stripe/payment-intents');
  try {
    const { secretKey, baseUrl } = req.stripe;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const {
      amount,
      currency = 'usd',
      description,
      metadata = {},
      customer_id,
      payment_method_id,
      confirmation_method = 'automatic'
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    // Prepare Stripe Payment Intent payload
    const payload = {
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      description,
      metadata: {
        ...metadata,
        orgId: req.activeOrgId,
        userId: userId
      },
      confirmation_method,
      capture_method: 'automatic'
    };

    // Add Apple Pay support if requested
    if (req.body.enable_apple_pay) {
      payload.payment_method_types = ['card', 'apple_pay'];
    }

    // Add customer if provided
    if (customer_id) {
      payload.customer = customer_id;
    }

    // Add payment method if provided
    if (payment_method_id) {
      payload.payment_method = payment_method_id;
    }

    const url = `${baseUrl}/v1/payment_intents`;
    const { statusCode, json, body } = await httpsRequest('POST', url, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16'
      },
      body: new URLSearchParams(payload).toString()
    });

    if (statusCode !== 200) {
      console.error('[ERROR] Stripe API error:', json);
      return res.status(statusCode).json({
        error: 'Failed to create payment intent',
        details: json
      });
    }

    // Save payment intent to database
    try {
      const { StripePayment } = req.models;
      await StripePayment.create({
        orgId: req.activeOrgId,
        userId,
        stripePaymentIntentId: json.id,
        stripeCustomerId: json.customer,
        stripePaymentMethodId: json.payment_method,
        amount: json.amount,
        currency: json.currency,
        status: json.status,
        description: json.description,
        metadata: json.metadata,
        clientSecret: json.client_secret,
        requiresAction: json.status === 'requires_action',
        nextAction: json.next_action
      });
    } catch (dbError) {
      console.error('[ERROR] Failed to save payment intent to database:', dbError);
      console.log(`SAVE THIS: ${JSON.stringify({
        orgId: req.activeOrgId,
        userId,
        stripePaymentIntentId: json.id,
        stripeCustomerId: json.customer,
        stripePaymentMethodId: json.payment_method,
        amount: json.amount,
        currency: json.currency,
        status: json.status,
        description: json.description,
        metadata: json.metadata,
        clientSecret: json.client_secret,
        requiresAction: json.status === 'requires_action',
        nextAction: json.next_action
      }, null, 2)}`);
      // Continue anyway - the payment intent was created successfully
    }

    console.groupEnd();
    res.status(200).json({
      id: json.id,
      client_secret: json.client_secret,
      status: json.status,
      amount: json.amount,
      currency: json.currency,
      requires_action: json.status === 'requires_action',
      next_action: json.next_action
    });

  } catch (err) {
    console.error('[ERROR] POST /stripe/payment-intents', err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Confirm a Payment Intent
 * POST /stripe/payment-intents/:id/confirm
 */
router.post('/payment-intents/:id/confirm', attachStripe, async (req, res) => {
  console.group(`[DEBUG] POST /stripe/payment-intents/${req.params.id}/confirm`);
  try {
    const { secretKey, baseUrl } = req.stripe;
    const { id } = req.params;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { payment_method, return_url } = req.body;

    const payload = {};
    if (payment_method) payload.payment_method = payment_method;
    if (return_url) payload.return_url = return_url;

    const url = `${baseUrl}/v1/payment_intents/${id}/confirm`;
    const { statusCode, json, body } = await httpsRequest('POST', url, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16'
      },
      body: new URLSearchParams(payload).toString()
    });

    // Update database record
    try {
      const { StripePayment } = req.models;
      await StripePayment.findOneAndUpdate(
        { stripePaymentIntentId: id, orgId: req.activeOrgId, userId },
        {
          status: json.status,
          requiresAction: json.status === 'requires_action',
          nextAction: json.next_action,
          lastPaymentError: json.last_payment_error
        }
      );
    } catch (dbError) {
      console.error('[ERROR] Failed to update payment intent in database:', dbError);
    }

    console.groupEnd();
    res.status(statusCode).json(json);

  } catch (err) {
    console.error(`[ERROR] POST /stripe/payment-intents/${req.params.id}/confirm`, err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get Payment Intent status
 * GET /stripe/payment-intents/:id
 */
router.get('/payment-intents/:id', attachStripe, async (req, res) => {
  console.group(`[DEBUG] GET /stripe/payment-intents/${req.params.id}`);
  try {
    const { secretKey, baseUrl } = req.stripe;
    const { id } = req.params;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const url = `${baseUrl}/v1/payment_intents/${id}`;
    const { statusCode, json, body } = await httpsRequest('GET', url, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': '2023-10-16'
      }
    });

    console.groupEnd();
    res.status(statusCode).json(json);

  } catch (err) {
    console.error(`[ERROR] GET /stripe/payment-intents/${req.params.id}`, err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get user's payment history
 * GET /stripe/payments
 */
router.get('/payments', attachStripe, async (req, res) => {
  console.group('[DEBUG] GET /stripe/payments');
  try {
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { StripePayment } = req.models;
    const payments = await StripePayment.find({
      orgId: req.activeOrgId,
      userId
    })
    .select('stripePaymentIntentId amount currency status description createdAt completedAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

    console.groupEnd();
    res.json(payments);

  } catch (err) {
    console.error('[ERROR] GET /stripe/payments', err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get public key for frontend
 * GET /stripe/public-key
 */
router.get('/public-key', attachStripe, async (req, res) => {
  console.group('[DEBUG] GET /stripe/public-key');
  try {
    const { publicKey, isTestMode } = req.stripe;

    console.groupEnd();
    res.json({
      public_key: publicKey,
      test_mode: isTestMode
    });

  } catch (err) {
    console.error('[ERROR] GET /stripe/public-key', err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Check Apple Pay availability
 * GET /stripe/apple-pay/availability
 */
router.get('/apple-pay/availability', attachStripe, async (req, res) => {
  console.group('[DEBUG] GET /stripe/apple-pay/availability');
  try {
    const { secretKey, baseUrl } = req.stripe;
    const { domain } = req.query;

    if (!domain) {
      return res.status(400).json({ error: 'Domain parameter is required' });
    }

    // Check if Apple Pay is available for this domain
    const url = `${baseUrl}/v1/apple_pay/domains`;
    const { statusCode, json } = await httpsRequest('GET', url, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': '2023-10-16'
      }
    });

    if (statusCode === 200) {
      const isRegistered = json.data?.some(d => d.domain_name === domain) || false;
      res.json({
        available: isRegistered,
        domain: domain,
        registered_domains: json.data?.map(d => d.domain_name) || []
      });
    } else {
      res.status(statusCode).json(json);
    }

  } catch (err) {
    console.error('[ERROR] GET /stripe/apple-pay/availability', err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
