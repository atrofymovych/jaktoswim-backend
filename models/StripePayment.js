const mongoose = require('mongoose');

const StripePaymentSchema = new mongoose.Schema({
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
  stripePaymentIntentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  stripeCustomerId: {
    type: String,
    index: true
  },
  stripePaymentMethodId: {
    type: String,
    index: true
  },

  // Payment details
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true,
    default: 'usd'
  },
  status: {
    type: String,
    required: true,
    enum: ['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'succeeded', 'canceled'],
    default: 'requires_payment_method'
  },

  // Order/Transaction details
  description: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Client secret for frontend confirmation
  clientSecret: {
    type: String,
    required: true
  },

  // 3DS authentication
  requiresAction: {
    type: Boolean,
    default: false
  },
  nextAction: {
    type: mongoose.Schema.Types.Mixed
  },

  // Error handling
  lastPaymentError: {
    type: mongoose.Schema.Types.Mixed
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
StripePaymentSchema.index({ orgId: 1, userId: 1 });
StripePaymentSchema.index({ orgId: 1, status: 1 });
StripePaymentSchema.index({ stripePaymentIntentId: 1 });
StripePaymentSchema.index({ createdAt: -1 });

// Update the updatedAt field before saving
StripePaymentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = StripePaymentSchema;
