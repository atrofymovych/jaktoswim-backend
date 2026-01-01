const mongoose = require('mongoose');

const StripeProductSchema = new mongoose.Schema({
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
  stripeProductId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Product details
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  active: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  images: [{
    type: String
  }],
  url: {
    type: String
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
StripeProductSchema.index({ orgId: 1, userId: 1 });
StripeProductSchema.index({ orgId: 1, active: 1 });
StripeProductSchema.index({ stripeProductId: 1 });
StripeProductSchema.index({ created: -1 });

module.exports = StripeProductSchema;
