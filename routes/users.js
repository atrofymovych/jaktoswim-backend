const express = require('express');
const { clerkClient } = require('@clerk/express');
const { userCacheMiddleware, cacheInvalidationMiddleware } = require('../middlewares/cacheMiddleware');

const router = express.Router();

router.get('/', userCacheMiddleware(), async (req, res) => {
  try {
    const { UserOrgBinding, OrganisationRolesMapping } = req.models;

    const [bindings, roles] = await Promise.all([
      UserOrgBinding.find({ orgId: req.activeOrgId }),
      OrganisationRolesMapping.find({ organizationId: req.activeOrgId }),
    ]);

    const userIds = bindings.map((b) => b.userId);

    const [clerkResponse] = await Promise.all([
      clerkClient.users.getUserList({
        userId: userIds,
        limit: 500,
      }),
    ]);
    const users = clerkResponse.data;

    const bindingMap = new Map(bindings.map((b) => [b.userId, b]));
    const roleMap = new Map(roles.map((r) => [r.userId, r]));

    const result = users.map((u) => {
      const binding = bindingMap.get(u.id);
      const roleRecord = roleMap.get(u.id);
      return {
        id: u.id,
        email: u.emailAddresses[0]?.emailAddress || null,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phoneNumbers[0]?.phoneNumber || null,
        avatarUrl: u.avatarUrl,
        role: roleRecord?.role || 'USER',
        joinedAt: binding?.createdAt,
      };
    });

    res.json({ users: result });
  } catch (err) {
    console.error('🛑  Failed to list users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

module.exports = router;
