const { getOrgConnection } = require('../connection');
const { getMongoClusterConfiguration } = require('./../cluster_manager');

function validateAndSanitizeOrgId(orgId, clusters) {
  if (!orgId || typeof orgId !== 'string') {
    return null;
  }

  const sanitizedOrgId = String(orgId).trim();
  const orgIdPattern = /^org_[a-zA-Z0-9_]+$/;

  if (!orgIdPattern.test(sanitizedOrgId)) {
    console.warn(`🛡️ Security: Invalid orgId format attempted: ${orgId}`);
    return null;
  }

  if (!clusters[sanitizedOrgId]) {
    console.warn(`🛡️ Security: Unknown orgId attempted: ${orgId}`);
    return null;
  }

  return sanitizedOrgId;
}

async function injectOrgConnection(req, res, next) {
  try {
    let payUWebhookUserId;
    let payUWebhookOrgId;
    if (req.path.includes('/notify')) {
      const body = req.body.order?.extOrderId?.split('-');
      payUWebhookUserId = body?.[1];
      payUWebhookOrgId = body?.[2];
    }

    const isDaoPublic = req.originalUrl && req.originalUrl.startsWith('/public/dao');
    const isPublicPayu = req.originalUrl && req.originalUrl.startsWith('/public/payu');
    const isProxyPublic = req.originalUrl && req.originalUrl.startsWith('/public/proxy');
    let extractedAuth;
    if (req && typeof req.auth === 'function') {
      try {
        extractedAuth = req.auth();
      } catch (e) {
        extractedAuth = undefined;
      }
    }
    const userId = extractedAuth?.userId || payUWebhookUserId;
    if (!userId && !isDaoPublic && !isPublicPayu && !isProxyPublic) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const clusters = getMongoClusterConfiguration();

    const isOrgBindingRoute =
      (req.method === 'POST' && ['/bind-org'].includes(req.path)) ||
      (req.method === 'GET' && ['/orgs', '/active-org'].includes(req.path)) ||
      isDaoPublic ||
      isPublicPayu ||
      isProxyPublic;

    if (isOrgBindingRoute) {
      const rawOrgId = req.body.orgId || req.get('X-ORG-ID') || payUWebhookOrgId;
      const source = String(req.get('X-SOURCE'));

      if (!rawOrgId) {
        return res.status(400).json({ error: 'X-ORG-ID header is required' });
      }

      const orgId = validateAndSanitizeOrgId(rawOrgId, clusters);
      if (!orgId) {
        console.warn(
          `🛡️ Security: Environment variable injection attempt blocked. Raw orgId: ${rawOrgId}`
        );
        return res.status(400).json({ error: 'Invalid organization ID' });
      }

      if (!source) {
        return res.status(403).json({ error: 'X-SOURCE header required' });
      }
      if (source.length > 200 || source.length < 6) {
        return res.status(400).json({ error: 'Source is not correct. Must be from 6 to 200 symbols' });
      }
      req.source = source;

      if (orgId && clusters[orgId]) {
        const conn = getOrgConnection(orgId);
        req.activeOrgId = orgId;
        req.orgConn = conn;
        req.models = {};
        for (const { model_name } of clusters[orgId].models) {
          req.models[model_name] = conn.model(model_name);
        }
      }
      return next();
    }

    let activeOrgId = null;
    let orgConn = null;
    let activeBinding = null;

    for (const orgId of Object.keys(clusters)) {
      const conn = getOrgConnection(orgId);
      const UserOrgBinding = conn.model('UserOrgBinding');
      activeBinding = await UserOrgBinding.findOne({ userId, active: true }).lean();
      if (activeBinding) {
        activeOrgId = activeBinding.orgId;
        orgConn = conn;
        break;
      }
    }

    if (!activeOrgId || !orgConn) {
      return res.status(403).json({ error: 'No active organization found' });
    }

    const validatedActiveOrgId = validateAndSanitizeOrgId(activeOrgId, clusters);
    if (!validatedActiveOrgId) {
      console.error(`🛡️ Security: Invalid active orgId found in database: ${activeOrgId}`);
      return res.status(500).json({ error: 'Internal server error' });
    }

    req.activeOrgId = validatedActiveOrgId || payUWebhookOrgId;
    req.orgConn = orgConn;

    req.models = {};
    for (const { model_name } of clusters[validatedActiveOrgId].models) {
      req.models[model_name] = orgConn.model(model_name);
    }

    next();
  } catch (err) {
    console.error('🛑 injectOrgConnection failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = injectOrgConnection;
