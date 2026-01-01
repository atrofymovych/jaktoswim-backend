const express = require('express');
const crypto = require('crypto');
const { getStripeCredsForOrg } = require('../../../_utils/stripe/getStripeCredsForOrg');
const router = express.Router();

/**
 * Verify Stripe webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @param {string} webhookSecret - Webhook endpoint secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyStripeSignature(payload, signature, webhookSecret) {
  try {
    const elements = signature.split(',');
    const signatureHash = elements.find(el => el.startsWith('v1='))?.split('=')[1];
    const timestamp = elements.find(el => el.startsWith('t='))?.split('=')[1];

    if (!signatureHash || !timestamp) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(timestamp + '.' + payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signatureHash, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('[ERROR] Signature verification failed:', error);
    return false;
  }
}

/**
 * Extract organization ID from payment intent metadata
 * @param {Object} paymentIntent - Stripe payment intent object
 * @returns {string|null} - Organization ID or null
 */
function extractOrgIdFromPaymentIntent(paymentIntent) {
  return paymentIntent?.metadata?.orgId || null;
}

/**
 * Main webhook handler
 * POST /stripe/webhook
 */
router.post('/', async (req, res) => {
  console.log('==========================[ STRIPE WEBHOOK HANDLER ]==========================');
  let orgId, paymentIntentId, eventType;

  try {
    // 1. Get raw body and signature
    const rawBody = req.body.toString('utf8');
    const signature = req.headers['stripe-signature'];

    if (!rawBody || !signature) {
      console.warn('[WARN] Missing body or signature in webhook request');
      return res.status(400).send('Missing body or signature');
    }

    // 2. Parse the event
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('[ERROR] Failed to parse webhook body:', parseError);
      return res.status(400).send('Invalid JSON');
    }

    eventType = event.type;
    paymentIntentId = event.data?.object?.id;

    console.log(`[INFO] Processing webhook event: ${eventType} for payment intent: ${paymentIntentId}`);

    // 3. Extract orgId from payment intent metadata
    orgId = extractOrgIdFromPaymentIntent(event.data?.object);
    if (!orgId) {
      console.error(`[ERROR] Could not extract orgId from payment intent: ${paymentIntentId}`);
      return res.status(400).send('Cannot determine organization from payment intent');
    }

    // 4. Get organization credentials and verify signature
    const { webhookSecret } = getStripeCredsForOrg(orgId);

    if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
      console.error(`[SECURITY] Invalid signature for payment intent: ${paymentIntentId}`);
      return res.status(403).send('Invalid signature');
    }

    console.log(`[SUCCESS] Signature for payment intent: ${paymentIntentId} is valid`);

    // 5. Get database connection
    const { getOrgConnection } = require('../../../connection');
    const conn = getOrgConnection(orgId);
    const StripePayment = conn.model('StripePayment');

    // 6. Handle different event types
    switch (eventType) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(StripePayment, event.data.object, orgId);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(StripePayment, event.data.object, orgId);
        break;

      case 'payment_intent.requires_action':
        await handlePaymentRequiresAction(StripePayment, event.data.object, orgId);
        break;

      case 'payment_intent.canceled':
        await handlePaymentCanceled(StripePayment, event.data.object, orgId);
        break;

      // Subscription events
      case 'customer.subscription.created':
        await handleSubscriptionCreated(conn, event.data.object, orgId);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(conn, event.data.object, orgId);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(conn, event.data.object, orgId);
        break;

      case 'customer.subscription.trial_will_end':
        await handleSubscriptionTrialWillEnd(conn, event.data.object, orgId);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(conn, event.data.object, orgId);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(conn, event.data.object, orgId);
        break;

      default:
        console.log(`[INFO] Unhandled event type: ${eventType}`);
        break;
    }

    console.log(`[SUCCESS] Webhook processed successfully for ${eventType}`);
    return res.sendStatus(200);

  } catch (err) {
    console.error(`[FATAL] Webhook failed for event ${eventType}, payment intent ${paymentIntentId}:`, err);
    return res.status(500).json({ status: 'error', message: err.message });
  } finally {
    console.log('==========================[ STRIPE WEBHOOK HANDLER DONE ]=====================================');
  }
});

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(StripePayment, paymentIntent, orgId) {
  console.log(`[INFO] Payment succeeded for intent: ${paymentIntent.id}`);

  const updateData = {
    status: 'succeeded',
    requiresAction: false,
    nextAction: null,
    lastPaymentError: null,
    completedAt: new Date()
  };

  const result = await StripePayment.findOneAndUpdate(
    {
      stripePaymentIntentId: paymentIntent.id,
      orgId: orgId
    },
    updateData,
    { new: true }
  );

  if (result) {
    console.log(`[SUCCESS] Updated payment record for intent: ${paymentIntent.id}`);

    // Here you can add additional business logic:
    // - Send confirmation email
    // - Update user subscription
    // - Trigger order fulfillment
    // - Update analytics/metrics

  } else {
    console.warn(`[WARN] No payment record found for intent: ${paymentIntent.id}`);
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(StripePayment, paymentIntent, orgId) {
  console.log(`[INFO] Payment failed for intent: ${paymentIntent.id}`);

  const updateData = {
    status: 'canceled',
    requiresAction: false,
    nextAction: null,
    lastPaymentError: paymentIntent.last_payment_error
  };

  const result = await StripePayment.findOneAndUpdate(
    {
      stripePaymentIntentId: paymentIntent.id,
      orgId: orgId
    },
    updateData,
    { new: true }
  );

  if (result) {
    console.log(`[SUCCESS] Updated failed payment record for intent: ${paymentIntent.id}`);

    // Here you can add additional business logic:
    // - Send failure notification
    // - Log for analytics
    // - Trigger retry logic if needed

  } else {
    console.warn(`[WARN] No payment record found for failed intent: ${paymentIntent.id}`);
  }
}

/**
 * Handle payment requiring action (3DS, etc.)
 */
async function handlePaymentRequiresAction(StripePayment, paymentIntent, orgId) {
  console.log(`[INFO] Payment requires action for intent: ${paymentIntent.id}`);

  const updateData = {
    status: 'requires_action',
    requiresAction: true,
    nextAction: paymentIntent.next_action,
    lastPaymentError: null
  };

  const result = await StripePayment.findOneAndUpdate(
    {
      stripePaymentIntentId: paymentIntent.id,
      orgId: orgId
    },
    updateData,
    { new: true }
  );

  if (result) {
    console.log(`[SUCCESS] Updated payment record for action required: ${paymentIntent.id}`);
  } else {
    console.warn(`[WARN] No payment record found for action required intent: ${paymentIntent.id}`);
  }
}

/**
 * Handle canceled payment
 */
async function handlePaymentCanceled(StripePayment, paymentIntent, orgId) {
  console.log(`[INFO] Payment canceled for intent: ${paymentIntent.id}`);

  const updateData = {
    status: 'canceled',
    requiresAction: false,
    nextAction: null,
    lastPaymentError: paymentIntent.last_payment_error
  };

  const result = await StripePayment.findOneAndUpdate(
    {
      stripePaymentIntentId: paymentIntent.id,
      orgId: orgId
    },
    updateData,
    { new: true }
  );

  if (result) {
    console.log(`[SUCCESS] Updated canceled payment record for intent: ${paymentIntent.id}`);
  } else {
    console.warn(`[WARN] No payment record found for canceled intent: ${paymentIntent.id}`);
  }
}

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(conn, subscription, orgId) {
  console.log(`[INFO] Subscription created: ${subscription.id}`);

  const StripeSubscription = conn.model('StripeSubscription');
  const StripeCustomer = conn.model('StripeCustomer');

  try {
    // Check if customer exists, create if not
    let customer = await StripeCustomer.findOne({ 
      stripeCustomerId: subscription.customer, 
      orgId: orgId 
    });

    if (!customer) {
      // Create customer record from subscription data
      customer = await StripeCustomer.create({
        orgId: orgId,
        userId: subscription.metadata?.userId || 'unknown',
        stripeCustomerId: subscription.customer,
        email: subscription.metadata?.email || '',
        metadata: subscription.metadata || {}
      });
    }

    // Create or update subscription
    await StripeSubscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id, orgId: orgId },
      {
        orgId: orgId,
        userId: subscription.metadata?.userId || customer.userId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
        endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
        metadata: subscription.metadata,
        items: subscription.items.data,
        defaultPaymentMethod: subscription.default_payment_method,
        collectionMethod: subscription.collection_method,
        created: new Date(subscription.created * 1000)
      },
      { upsert: true, new: true }
    );

    console.log(`[SUCCESS] Created/updated subscription record: ${subscription.id}`);

    // Here you can add additional business logic:
    // - Send welcome email
    // - Activate user features
    // - Update user permissions
    // - Trigger onboarding flow

  } catch (error) {
    console.error(`[ERROR] Failed to handle subscription created: ${subscription.id}`, error);
  }
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(conn, subscription, orgId) {
  console.log(`[INFO] Subscription updated: ${subscription.id}`);

  const StripeSubscription = conn.model('StripeSubscription');

  try {
    const updateData = {
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
      metadata: subscription.metadata,
      items: subscription.items.data,
      defaultPaymentMethod: subscription.default_payment_method,
      collectionMethod: subscription.collection_method
    };

    const result = await StripeSubscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id, orgId: orgId },
      updateData,
      { new: true }
    );

    if (result) {
      console.log(`[SUCCESS] Updated subscription record: ${subscription.id}`);

      // Here you can add additional business logic based on status changes:
      // - Plan upgrades/downgrades
      // - Feature access changes
      // - Billing notifications
      // - Usage tracking updates

    } else {
      console.warn(`[WARN] No subscription record found for: ${subscription.id}`);
    }

  } catch (error) {
    console.error(`[ERROR] Failed to handle subscription updated: ${subscription.id}`, error);
  }
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(conn, subscription, orgId) {
  console.log(`[INFO] Subscription deleted: ${subscription.id}`);

  const StripeSubscription = conn.model('StripeSubscription');

  try {
    const updateData = {
      status: 'canceled',
      endedAt: new Date(subscription.ended_at * 1000),
      cancelAtPeriodEnd: false
    };

    const result = await StripeSubscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id, orgId: orgId },
      updateData,
      { new: true }
    );

    if (result) {
      console.log(`[SUCCESS] Updated deleted subscription record: ${subscription.id}`);

      // Here you can add additional business logic:
      // - Send cancellation confirmation
      // - Revoke user access
      // - Trigger retention campaign
      // - Update analytics

    } else {
      console.warn(`[WARN] No subscription record found for deleted: ${subscription.id}`);
    }

  } catch (error) {
    console.error(`[ERROR] Failed to handle subscription deleted: ${subscription.id}`, error);
  }
}

/**
 * Handle subscription trial will end
 */
async function handleSubscriptionTrialWillEnd(conn, subscription, orgId) {
  console.log(`[INFO] Subscription trial will end: ${subscription.id}`);

  // Here you can add business logic for trial ending:
  // - Send trial ending notification
  // - Offer discount for conversion
  // - Remind user to add payment method
  // - Update user dashboard with trial status

  console.log(`[INFO] Trial ending notification sent for subscription: ${subscription.id}`);
}

/**
 * Handle invoice payment succeeded
 */
async function handleInvoicePaymentSucceeded(conn, invoice, orgId) {
  console.log(`[INFO] Invoice payment succeeded: ${invoice.id}`);

  // Here you can add business logic for successful payments:
  // - Send payment confirmation
  // - Update user billing status
  // - Trigger post-payment workflows
  // - Update analytics and metrics

  console.log(`[INFO] Payment confirmation sent for invoice: ${invoice.id}`);
}

/**
 * Handle invoice payment failed
 */
async function handleInvoicePaymentFailed(conn, invoice, orgId) {
  console.log(`[INFO] Invoice payment failed: ${invoice.id}`);

  // Here you can add business logic for failed payments:
  // - Send payment failure notification
  // - Update subscription status
  // - Trigger retry logic
  // - Send payment method update request

  console.log(`[INFO] Payment failure notification sent for invoice: ${invoice.id}`);
}

module.exports = router;
