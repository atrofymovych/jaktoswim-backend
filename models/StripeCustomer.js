const mongoose = require('mongoose');

const StripeCustomerSchema = new mongoose.Schema({
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
  stripeCustomerId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Customer details
  email: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String
  },
  phone: {
    type: String
  },
  description: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  address: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  shipping: {
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
StripeCustomerSchema.index({ orgId: 1, userId: 1 });
StripeCustomerSchema.index({ orgId: 1, email: 1 });
StripeCustomerSchema.index({ stripeCustomerId: 1 });
StripeCustomerSchema.index({ created: -1 });

module.exports = StripeCustomerSchema;
