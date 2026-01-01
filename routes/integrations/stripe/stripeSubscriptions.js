const express = require('express');
const { httpsRequest } = require('../../../_utils/network/httpReq');
const { getStripeCredsForOrg } = require('../../../_utils/stripe/getStripeCredsForOrg');
const requireRole = require('../../../middlewares/requireRole');
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
 * Create a Product
 * POST /stripe/subscriptions/products
 */
router.post('/products', attachStripe, requireRole(['ADMIN', 'SUB_ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  console.group('[DEBUG] POST /stripe/subscriptions/products');
  try {
    const { secretKey, baseUrl } = req.stripe;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const {
      name,
      description,
      metadata = {},
      images = [],
      url,
      active = true
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const payload = {
      name,
      description,
      metadata: {
        ...metadata,
        orgId: req.activeOrgId,
        createdBy: userId
      },
      active
    };

    if (images.length > 0) payload.images = images;
    if (url) payload.url = url;

    const url_endpoint = `${baseUrl}/v1/products`;
    const { statusCode, json, body } = await httpsRequest('POST', url_endpoint, {
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
        error: 'Failed to create product',
        details: json
      });
    }

    // Save product to database
    try {
      const { StripeProduct } = req.models;
      await StripeProduct.create({
        orgId: req.activeOrgId,
        userId,
        stripeProductId: json.id,
        name: json.name,
        description: json.description,
        active: json.active,
        metadata: json.metadata,
        images: json.images,
        url: json.url,
        created: new Date(json.created * 1000)
      });
    } catch (dbError) {
      console.error('[ERROR] Failed to save product to database:', dbError);
    }

    console.groupEnd();
    res.status(200).json(json);

  } catch (err) {
    console.error('[ERROR] POST /stripe/subscriptions/products', err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a Price for a Product
 * POST /stripe/subscriptions/prices
 */
router.post('/prices', attachStripe, requireRole(['ADMIN', 'SUB_ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  console.group('[DEBUG] POST /stripe/subscriptions/prices');
  try {
    const { secretKey, baseUrl } = req.stripe;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const {
      product_id,
      unit_amount,
      currency = 'usd',
      recurring = {},
      metadata = {},
      active = true,
      nickname,
      billing_scheme = 'per_unit',
      tax_behavior = 'unspecified'
    } = req.body;

    if (!product_id || !unit_amount) {
      return res.status(400).json({ error: 'Product ID and unit amount are required' });
    }

    const payload = {
      product: product_id,
      unit_amount: Math.round(unit_amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: {
        ...metadata,
        orgId: req.activeOrgId,
        createdBy: userId
      },
      active,
      billing_scheme,
      tax_behavior
    };

    if (Object.keys(recurring).length > 0) {
      payload.recurring = recurring;
    }
    if (nickname) payload.nickname = nickname;

    const url_endpoint = `${baseUrl}/v1/prices`;
    const { statusCode, json, body } = await httpsRequest('POST', url_endpoint, {
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
        error: 'Failed to create price',
        details: json
      });
    }

    // Save price to database
    try {
      const { StripePrice } = req.models;
      await StripePrice.create({
        orgId: req.activeOrgId,
        userId,
        stripePriceId: json.id,
        stripeProductId: json.product,
        unitAmount: json.unit_amount,
        currency: json.currency,
        recurring: json.recurring,
        active: json.active,
        metadata: json.metadata,
        nickname: json.nickname,
        billingScheme: json.billing_scheme,
        taxBehavior: json.tax_behavior,
        created: new Date(json.created * 1000)
      });
    } catch (dbError) {
      console.error('[ERROR] Failed to save price to database:', dbError);
    }

    console.groupEnd();
    res.status(200).json(json);

  } catch (err) {
    console.error('[ERROR] POST /stripe/subscriptions/prices', err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a Customer
 * POST /stripe/subscriptions/customers
 */
router.post('/customers', attachStripe, requireRole(['ADMIN', 'SUB_ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  console.group('[DEBUG] POST /stripe/subscriptions/customers');
  try {
    const { secretKey, baseUrl } = req.stripe;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const {
      email,
      name,
      phone,
      description,
      metadata = {},
      address = {},
      shipping = {}
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const payload = {
      email,
      metadata: {
        ...metadata,
        orgId: req.activeOrgId,
        userId: userId
      }
    };

    if (name) payload.name = name;
    if (phone) payload.phone = phone;
    if (description) payload.description = description;
    if (Object.keys(address).length > 0) payload.address = address;
    if (Object.keys(shipping).length > 0) payload.shipping = shipping;

    const url_endpoint = `${baseUrl}/v1/customers`;
    const { statusCode, json, body } = await httpsRequest('POST', url_endpoint, {
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
        error: 'Failed to create customer',
        details: json
      });
    }

    // Save customer to database
    try {
      const { StripeCustomer } = req.models;
      await StripeCustomer.create({
        orgId: req.activeOrgId,
        userId,
        stripeCustomerId: json.id,
        email: json.email,
        name: json.name,
        phone: json.phone,
        description: json.description,
        metadata: json.metadata,
        address: json.address,
        shipping: json.shipping,
        created: new Date(json.created * 1000)
      });
    } catch (dbError) {
      console.error('[ERROR] Failed to save customer to database:', dbError);
    }

    console.groupEnd();
    res.status(200).json(json);

  } catch (err) {
    console.error('[ERROR] POST /stripe/subscriptions/customers', err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a Subscription
 * POST /stripe/subscriptions
 */
router.post('/', attachStripe, requireRole(['ADMIN', 'SUB_ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  console.group('[DEBUG] POST /stripe/subscriptions');
  try {
    const { secretKey, baseUrl } = req.stripe;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const {
      customer_id,
      items = [],
      default_payment_method,
      trial_period_days,
      coupon,
      metadata = {},
      collection_method = 'charge_automatically',
      proration_behavior = 'create_prorations'
    } = req.body;

    if (!customer_id || items.length === 0) {
      return res.status(400).json({ error: 'Customer ID and items are required' });
    }

    const payload = {
      customer: customer_id,
      items: items.map(item => ({
        price: item.price_id,
        quantity: item.quantity || 1
      })),
      metadata: {
        ...metadata,
        orgId: req.activeOrgId,
        userId: userId
      },
      collection_method,
      proration_behavior
    };

    if (default_payment_method) payload.default_payment_method = default_payment_method;
    if (trial_period_days) payload.trial_period_days = trial_period_days;
    if (coupon) payload.coupon = coupon;

    const url_endpoint = `${baseUrl}/v1/subscriptions`;
    const { statusCode, json, body } = await httpsRequest('POST', url_endpoint, {
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
        error: 'Failed to create subscription',
        details: json
      });
    }

    // Save subscription to database
    try {
      const { StripeSubscription } = req.models;
      await StripeSubscription.create({
        orgId: req.activeOrgId,
        userId,
        stripeSubscriptionId: json.id,
        stripeCustomerId: json.customer,
        status: json.status,
        currentPeriodStart: new Date(json.current_period_start * 1000),
        currentPeriodEnd: new Date(json.current_period_end * 1000),
        trialStart: json.trial_start ? new Date(json.trial_start * 1000) : null,
        trialEnd: json.trial_end ? new Date(json.trial_end * 1000) : null,
        cancelAtPeriodEnd: json.cancel_at_period_end,
        canceledAt: json.canceled_at ? new Date(json.canceled_at * 1000) : null,
        endedAt: json.ended_at ? new Date(json.ended_at * 1000) : null,
        metadata: json.metadata,
        items: json.items.data,
        defaultPaymentMethod: json.default_payment_method,
        collectionMethod: json.collection_method,
        created: new Date(json.created * 1000)
      });
    } catch (dbError) {
      console.error('[ERROR] Failed to save subscription to database:', dbError);
    }

    console.groupEnd();
    res.status(200).json(json);

  } catch (err) {
    console.error('[ERROR] POST /stripe/subscriptions', err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get Subscription Details
 * GET /stripe/subscriptions/:id
 */
router.get('/:id', attachStripe, requireRole(['ADMIN', 'SUB_ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  console.group(`[DEBUG] GET /stripe/subscriptions/${req.params.id}`);
  try {
    const { secretKey, baseUrl } = req.stripe;
    const { id } = req.params;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const url_endpoint = `${baseUrl}/v1/subscriptions/${id}`;
    const { statusCode, json, body } = await httpsRequest('GET', url_endpoint, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': '2023-10-16'
      }
    });

    console.groupEnd();
    res.status(statusCode).json(json);

  } catch (err) {
    console.error(`[ERROR] GET /stripe/subscriptions/${req.params.id}`, err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update Subscription
 * PUT /stripe/subscriptions/:id
 */
router.put('/:id', attachStripe, requireRole(['ADMIN', 'SUB_ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  console.group(`[DEBUG] PUT /stripe/subscriptions/${req.params.id}`);
  try {
    const { secretKey, baseUrl } = req.stripe;
    const { id } = req.params;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const {
      items = [],
      default_payment_method,
      coupon,
      metadata = {},
      proration_behavior = 'create_prorations',
      cancel_at_period_end
    } = req.body;

    const payload = {
      metadata: {
        ...metadata,
        orgId: req.activeOrgId,
        userId: userId
      },
      proration_behavior
    };

    if (items.length > 0) {
      payload.items = items.map(item => ({
        id: item.id,
        price: item.price_id,
        quantity: item.quantity || 1
      }));
    }
    if (default_payment_method) payload.default_payment_method = default_payment_method;
    if (coupon) payload.coupon = coupon;
    if (cancel_at_period_end !== undefined) payload.cancel_at_period_end = cancel_at_period_end;

    const url_endpoint = `${baseUrl}/v1/subscriptions/${id}`;
    const { statusCode, json, body } = await httpsRequest('POST', url_endpoint, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16'
      },
      body: new URLSearchParams(payload).toString()
    });

    // Update database record
    try {
      const { StripeSubscription } = req.models;
      await StripeSubscription.findOneAndUpdate(
        { stripeSubscriptionId: id, orgId: req.activeOrgId },
        {
          status: json.status,
          currentPeriodStart: new Date(json.current_period_start * 1000),
          currentPeriodEnd: new Date(json.current_period_end * 1000),
          cancelAtPeriodEnd: json.cancel_at_period_end,
          canceledAt: json.canceled_at ? new Date(json.canceled_at * 1000) : null,
          endedAt: json.ended_at ? new Date(json.ended_at * 1000) : null,
          metadata: json.metadata,
          items: json.items.data,
          defaultPaymentMethod: json.default_payment_method,
          collectionMethod: json.collection_method
        }
      );
    } catch (dbError) {
      console.error('[ERROR] Failed to update subscription in database:', dbError);
    }

    console.groupEnd();
    res.status(statusCode).json(json);

  } catch (err) {
    console.error(`[ERROR] PUT /stripe/subscriptions/${req.params.id}`, err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Cancel Subscription
 * DELETE /stripe/subscriptions/:id
 */
router.delete('/:id', attachStripe, requireRole(['ADMIN', 'SUB_ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  console.group(`[DEBUG] DELETE /stripe/subscriptions/${req.params.id}`);
  try {
    const { secretKey, baseUrl } = req.stripe;
    const { id } = req.params;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { cancel_at_period_end = true, prorate = false } = req.query;

    const payload = {
      cancel_at_period_end: cancel_at_period_end === 'true',
      prorate: prorate === 'true'
    };

    const url_endpoint = `${baseUrl}/v1/subscriptions/${id}`;
    const { statusCode, json, body } = await httpsRequest('DELETE', url_endpoint, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16'
      },
      body: new URLSearchParams(payload).toString()
    });

    // Update database record
    try {
      const { StripeSubscription } = req.models;
      await StripeSubscription.findOneAndUpdate(
        { stripeSubscriptionId: id, orgId: req.activeOrgId },
        {
          status: json.status,
          cancelAtPeriodEnd: json.cancel_at_period_end,
          canceledAt: json.canceled_at ? new Date(json.canceled_at * 1000) : null,
          endedAt: json.ended_at ? new Date(json.ended_at * 1000) : null
        }
      );
    } catch (dbError) {
      console.error('[ERROR] Failed to update subscription in database:', dbError);
    }

    console.groupEnd();
    res.status(statusCode).json(json);

  } catch (err) {
    console.error(`[ERROR] DELETE /stripe/subscriptions/${req.params.id}`, err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get Customer's Subscriptions
 * GET /stripe/subscriptions/customer/:customer_id
 */
router.get('/customer/:customer_id', attachStripe, requireRole(['ADMIN', 'SUB_ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  console.group(`[DEBUG] GET /stripe/subscriptions/customer/${req.params.customer_id}`);
  try {
    const { secretKey, baseUrl } = req.stripe;
    const { customer_id } = req.params;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { status = 'all', limit = 10 } = req.query;

    const url_endpoint = `${baseUrl}/v1/subscriptions?customer=${customer_id}&status=${status}&limit=${limit}`;
    const { statusCode, json, body } = await httpsRequest('GET', url_endpoint, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': '2023-10-16'
      }
    });

    console.groupEnd();
    res.status(statusCode).json(json);

  } catch (err) {
    console.error(`[ERROR] GET /stripe/subscriptions/customer/${req.params.customer_id}`, err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get All Products
 * GET /stripe/subscriptions/products
 */
router.get('/products', attachStripe, requireRole(['ADMIN', 'SUB_ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  console.group('[DEBUG] GET /stripe/subscriptions/products');
  try {
    const { secretKey, baseUrl } = req.stripe;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { active = true, limit = 10 } = req.query;

    const url_endpoint = `${baseUrl}/v1/products?active=${active}&limit=${limit}`;
    const { statusCode, json, body } = await httpsRequest('GET', url_endpoint, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': '2023-10-16'
      }
    });

    console.groupEnd();
    res.status(statusCode).json(json);

  } catch (err) {
    console.error('[ERROR] GET /stripe/subscriptions/products', err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get Prices for a Product
 * GET /stripe/subscriptions/products/:product_id/prices
 */
router.get('/products/:product_id/prices', attachStripe, requireRole(['ADMIN', 'SUB_ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  console.group(`[DEBUG] GET /stripe/subscriptions/products/${req.params.product_id}/prices`);
  try {
    const { secretKey, baseUrl } = req.stripe;
    const { product_id } = req.params;
    const userId = req.auth()?.userId;

    if (!userId) {
      console.groupEnd();
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { active = true, limit = 10 } = req.query;

    const url_endpoint = `${baseUrl}/v1/prices?product=${product_id}&active=${active}&limit=${limit}`;
    const { statusCode, json, body } = await httpsRequest('GET', url_endpoint, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': '2023-10-16'
      }
    });

    console.groupEnd();
    res.status(statusCode).json(json);

  } catch (err) {
    console.error(`[ERROR] GET /stripe/subscriptions/products/${req.params.product_id}/prices`, err);
    console.groupEnd();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
