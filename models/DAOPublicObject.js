const mongoose = require('mongoose');
const { Schema } = mongoose;

const DAOPublicObjectSchema = new Schema(
  {
    type: { type: String, required: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
    deleted_at: { type: Date, default: null, index: true },
    metadata: { type: Schema.Types.Mixed, required: true },
    links: {
      type: [Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

DAOPublicObjectSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('DAOPublicObject', DAOPublicObjectSchema);
