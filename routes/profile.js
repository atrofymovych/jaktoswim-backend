const express = require('express');
const { profileCacheMiddleware, cacheInvalidationMiddleware } = require('../middlewares/cacheMiddleware');

const router = express.Router();

router.post('/upsert-profile', cacheInvalidationMiddleware(), async (req, res) => {
  try {
    const { UserProfile } = req.models;
    const userId = req.auth()?.userId;
    const { activeOrgId } = req;

    const { data } = req.body;
    if (typeof data !== 'object' || data === null) {
      return res.status(400).json({ error: 'Field "data" must be a non-null object' });
    }

    const profile = await UserProfile.findOneAndUpdate(
      { userId, orgId: activeOrgId },
      { $set: { data: JSON.stringify(data) } },
      { upsert: true, new: true }
    );

    res.status(200).json({
      status: 'profile_upserted',
      profile: { userId: profile.userId, orgId: profile.orgId, data },
    });
  } catch (err) {
    console.error('🛑  Failed to upsert profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/get-profile', profileCacheMiddleware(), async (req, res) => {
  try {
    const { UserProfile, OrganisationRolesMapping } = req.models;
    const userId = req.auth()?.userId;
    const { activeOrgId } = req;

    const [profile, role] = await Promise.all([
      UserProfile.findOne({ userId, orgId: activeOrgId }).lean(),
      // Use cached role lookup for better performance
      (async () => {
        const permissionCacheService = require('../services/permissionCacheService');
        return await permissionCacheService.getUserRole(req.models, userId, activeOrgId);
      })(),
    ]);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    let parsedData = {};
    try {
      if (profile.data) {
        parsedData = typeof profile.data === 'string' ? JSON.parse(profile.data) : profile.data;
      }
    } catch (e) {
      console.warn('⚠️ Failed to parse profile data:', e);
    }

    // Role is already fetched above

    res.status(200).json({
      profile: { userId: profile.userId, orgId: profile.orgId, data: parsedData },
      role,
    });
  } catch (err) {
    console.error('🛑  Failed to get profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
