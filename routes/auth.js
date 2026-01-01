const express = require('express');
const { getAuth } = require('@clerk/express');
const { getMongoClusterConfiguration } = require('../cluster_manager');
const { getOrgConnection } = require('../connection');
const { orgCacheMiddleware, cacheInvalidationMiddleware } = require('../middlewares/cacheMiddleware');

const router = express.Router();
const clusters = getMongoClusterConfiguration();

router.post('/bind-org', cacheInvalidationMiddleware(), async (req, res) => {
  const { orgId } = req.body;
  const { userId } = getAuth(req);

  if (!orgId) {
    return res.status(400).json({ error: 'Missing orgId' });
  }
  if (!clusters[orgId]) {
    return res.status(400).json({ error: 'Invalid orgId' });
  }

  try {
    await Promise.all(
      Object.keys(clusters).map((id) => {
        const conn = getOrgConnection(id);
        return conn.model('UserOrgBinding').updateMany({ userId }, { $set: { active: false } });
      })
    );

    const targetConn = getOrgConnection(orgId);
    await targetConn
      .model('UserOrgBinding')
      .findOneAndUpdate({ userId, orgId }, { $set: { active: true } }, { upsert: true });

    await targetConn.model('OrganisationRolesMapping').findOneAndUpdate(
      { organizationId: orgId, userId },
      { $setOnInsert: { role: 'USER' } },
      { upsert: true }
    );

    res.json({ status: 'bound_and_set_active', orgId });
  } catch (err) {
    console.error('🛑  Bind-org error:', err);
    res.status(500).json({ error: 'Failed to bind org' });
  }
});

router.get('/orgs', orgCacheMiddleware(), async (req, res) => {
  const { userId } = getAuth(req);
  try {
    const orgs = await Promise.all(
      Object.entries(clusters).map(async ([id, cfg]) => {
        const binding = await getOrgConnection(id).model('UserOrgBinding').findOne({ userId }).lean();
        return binding
          ? { orgId: id, active: !!binding.active, createdAt: binding.createdAt }
          : null;
      })
    );
    res.json({ orgs: orgs.filter(Boolean) });
  } catch (err) {
    console.error('🛑  List-orgs error:', err);
    res.status(500).json({ error: 'Failed to fetch orgs' });
  }
});

router.get('/active-org', orgCacheMiddleware(), async (req, res) => {
  const { userId } = getAuth(req);
  try {
    for (const id of Object.keys(clusters)) {
      const binding = await getOrgConnection(id).model('UserOrgBinding').findOne({ userId, active: true }).lean();
      if (binding) return res.json({ activeOrg: id });
    }
    res.json({ activeOrg: null });
  } catch (err) {
    console.error('🛑  Active-org error:', err);
    res.status(500).json({ error: 'Failed to fetch active org' });
  }
});

module.exports = router;
