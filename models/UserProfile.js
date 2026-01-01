const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserProfileSchema = new Schema(
  {
    userId: { type: String, required: true },
    orgId: { type: String, required: true },
    data: { type: String, default: '{}' },
  },
  {
    timestamps: true,
  }
);

UserProfileSchema.index({ userId: 1, orgId: 1 }, { unique: true });

module.exports = mongoose.model('UserProfile', UserProfileSchema);
