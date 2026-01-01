const mongoose = require('mongoose');

const StripeSubscriptionSchema = new mongoose.Schema({
  // Organization and User identification
  orgId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },

  // Stripe-specific identifiers
  stripeSubscriptionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  stripeCustomerId: {
    type: String,
    required: true,
    index: true
  },

  // Subscription details
  status: {
    type: String,
    required: true,
    enum: [
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    ],
    default: 'incomplete'
  },

  // Billing periods
  currentPeriodStart: {
    type: Date,
    required: true
  },
  currentPeriodEnd: {
    type: Date,
    required: true
  },

  // Trial information
  trialStart: {
    type: Date
  },
  trialEnd: {
    type: Date
  },

  // Cancellation information
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  canceledAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },

  // Subscription items (products/prices)
  items: [{
    type: mongoose.Schema.Types.Mixed
  }],

  // Payment information
  defaultPaymentMethod: {
    type: String
  },
  collectionMethod: {
    type: String,
    enum: ['charge_automatically', 'send_invoice'],
    default: 'charge_automatically'
  },

  // Metadata and additional info
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Timestamps
  created: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
StripeSubscriptionSchema.index({ orgId: 1, userId: 1 });
StripeSubscriptionSchema.index({ orgId: 1, stripeCustomerId: 1 });
StripeSubscriptionSchema.index({ orgId: 1, status: 1 });
StripeSubscriptionSchema.index({ stripeSubscriptionId: 1 });
StripeSubscriptionSchema.index({ currentPeriodEnd: 1 });
StripeSubscriptionSchema.index({ created: -1 });

// Compound indexes for common queries
StripeSubscriptionSchema.index({ orgId: 1, status: 1, currentPeriodEnd: 1 });
StripeSubscriptionSchema.index({ orgId: 1, userId: 1, status: 1 });

module.exports = StripeSubscriptionSchema;
