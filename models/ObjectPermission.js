const mongoose = require('mongoose');
const { Schema } = mongoose;

const ObjectPermissionSchema = new Schema(
  {
    organizationId: { type: String, required: true, index: true },
    objectType: { type: String, required: true, index: true },
    role: { type: String, required: true, index: true },
    action: { type: String, required: true, enum: ['CREATE', 'GET', 'UPDATE', 'ARCHIVE'], index: true },
    allow: { type: Boolean, required: true },
  },
  {
    timestamps: true,
  }
);

ObjectPermissionSchema.index({ organizationId: 1, objectType: 1, role: 1, action: 1 }, { unique: true });

module.exports = mongoose.model('ObjectPermission', ObjectPermissionSchema);
