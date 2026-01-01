const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProxyConfigSchema = new Schema(
  {
    organizationId: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    isPublic: { type: Boolean, default: false },
    enabledMethods: {
      type: [String],
      default: ['GET'],
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  }
);

// Уникальный индекс на комбинацию organizationId + type
ProxyConfigSchema.index({ organizationId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('ProxyConfig', ProxyConfigSchema);

