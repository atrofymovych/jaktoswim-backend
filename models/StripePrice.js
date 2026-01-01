const mongoose = require('mongoose');

const StripePriceSchema = new mongoose.Schema({
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
  stripePriceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  stripeProductId: {
    type: String,
    required: true,
    index: true
  },

  // Price details
  unitAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true,
    default: 'usd'
  },
  recurring: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  active: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  nickname: {
    type: String
  },
  billingScheme: {
    type: String,
    enum: ['per_unit', 'tiered'],
    default: 'per_unit'
  },
  taxBehavior: {
    type: String,
    enum: ['unspecified', 'inclusive', 'exclusive'],
    default: 'unspecified'
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
StripePriceSchema.index({ orgId: 1, userId: 1 });
StripePriceSchema.index({ orgId: 1, stripeProductId: 1 });
StripePriceSchema.index({ orgId: 1, active: 1 });
StripePriceSchema.index({ stripePriceId: 1 });
StripePriceSchema.index({ created: -1 });

module.exports = StripePriceSchema;
