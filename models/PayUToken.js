const mongoose = require('mongoose');

const PayUTokenSchema = new mongoose.Schema(
  {
    orgId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'EXPIRED', 'PENDING_3DS'],
      default: 'ACTIVE',
      index: true,
    },

    maskedPan: {
      type: String,
      required: true,
      trim: true,
    },
    expiryMonth: {
      type: Number,
      min: 1,
      max: 12,
      required: true,
    },
    expiryYear: {
      type: Number,
      required: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    threeDsProtocolVersion: {
      type: String,
      trim: true,
    },
    redirectUri: {
      type: String,
      trim: true,
    },
    lastStatusCode: {
      type: String,
      trim: true,
    },
    lastStatusSeverity: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  }
);

module.exports = mongoose.model('PayUToken', PayUTokenSchema);
