const mongoose = require('mongoose');

const UserOrgBindingSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    orgId: { type: String, required: true },
    active: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

UserOrgBindingSchema.index({ userId: 1, orgId: 1 }, { unique: true });

module.exports = mongoose.model('UserOrgBinding', UserOrgBindingSchema);
