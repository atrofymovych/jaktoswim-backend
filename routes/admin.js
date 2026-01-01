const express = require('express');
const { clerkClient } = require('@clerk/express');
const permissionCacheService = require('../services/permissionCacheService');

const router = express.Router();

router.get('/users', async (req, res) => {
  try {
    const { UserOrgBinding, OrganisationRolesMapping } = req.models;
    const bindings = await UserOrgBinding.find({ orgId: req.activeOrgId });
    const userIds = bindings.map((b) => b.userId);
    const clerkResponse = await clerkClient.users.getUserList({
      userId: userIds,
    });
    const users = clerkResponse.data;

    const roles = await OrganisationRolesMapping.find({
      organizationId: req.activeOrgId,
      userId: { $in: userIds },
    });

    const result = users.map((u) => {
      const binding = bindings.find((b) => b.userId === u.id);
      const roleRecord = roles.find((r) => r.userId === u.id);
      return {
        id: u.id,
        email: u.emailAddresses[0]?.emailAddress || null,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phoneNumbers[0]?.phoneNumber || null,
        role: roleRecord?.role || 'USER',
        joinedAt: binding?.createdAt,
      };
    });

    res.json({ users: result });
  } catch (err) {
    console.error('🛑 Failed to list users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.patch('/users/:targetUserId/role', async (req, res) => {
  const { targetUserId } = req.params;
  const { role } = req.body;

  try {
    const { OrganisationRolesMapping } = req.models;
    const updated = await OrganisationRolesMapping.findOneAndUpdate(
      { organizationId: req.activeOrgId, userId: targetUserId },
      { $set: { role } },
      { upsert: true, new: true }
    );

    // Invalidate permission cache for this user's role
    permissionCacheService.clearUserRole(targetUserId, req.activeOrgId);
    
    // Also clear all permission checks for this organization since role changes
    // affect all permission checks that depend on the role
    permissionCacheService.clearPermissions(req.activeOrgId);

    res.json({
      status: 'role_updated',
      userId: updated.userId,
      orgId: updated.organizationId,
      role: updated.role,
    });
  } catch (err) {
    console.error('🛑 Failed to set user role:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

module.exports = router;
