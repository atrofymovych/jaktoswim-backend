const mongoose = require('mongoose');
const { Schema } = mongoose;

const DAOAiObjectSchema = new Schema(
  {
    type: { type: String, required: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
    deleted_at: { type: Date, default: null, index: true },
    metadata: {
      userId: {
        type: String,
        required: true,
      },
      orgId: {
        type: String,
        required: true,
      },
      source: {
        type: String,
        required: true,
      },
    },
    links: {
      type: [Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

DAOAiObjectSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('DAOAiObject', DAOAiObjectSchema);
