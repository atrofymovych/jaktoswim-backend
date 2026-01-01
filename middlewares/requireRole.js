/**
 * Middleware factory to enforce a specific role (or roles) in the active organization.
 * @param {string|string[]} requiredRoles - single role or array of roles to allow
 */
function requireRole(requiredRoles) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return async (req, res, next) => {
    try {
      // Only support function-style req.auth(); do not use object or external fallbacks
      let extractedAuth;
      if (req && typeof req.auth === 'function') {
        try {
          extractedAuth = req.auth();
        } catch (e) {
          extractedAuth = undefined;
        }
      }
      const userId = extractedAuth?.userId || null;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { OrganisationRolesMapping } = req.models;

      const mapping = await OrganisationRolesMapping.findOne({
        userId,
        organizationId: req.activeOrgId,
      }).lean();

      if (!mapping || !roles.includes(mapping.role)) {
        return res.status(403).json({
          error: `Forbidden: Requires role ${roles.join(' or ')}`,
        });
      }

      req.role = mapping.role;
      next();
    } catch (err) {
      console.error('🛑 Role check failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = requireRole;
