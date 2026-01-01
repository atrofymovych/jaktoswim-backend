const mongoose = require('mongoose');
const { Schema } = mongoose;

const OrganisationRolesMappingSchema = new Schema(
  {
    organizationId: { type: String, required: true },
    userId: { type: String, required: true },
    role: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'organisation_roles_mapping',
  }
);

OrganisationRolesMappingSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('OrganisationRolesMapping', OrganisationRolesMappingSchema);
