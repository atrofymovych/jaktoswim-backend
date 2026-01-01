const {
  trackIntegrationUsage,
  trackDaoObjectOperation,
  trackDaoCommandOperation,
  trackDaoCommandExecution,
  trackAiSession,
  trackAiMessage,
  trackAiResponseTime,
  trackDaoObjectSize,
  trackDaoCommandSize,
} = require('../prometheus');

/**
 * Enhanced metrics middleware for comprehensive SRE monitoring
 * Tracks integration usage, endpoint usage, DAO operations, and business metrics
 */
const enhancedMetricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;
  const originalJson = res.json;

  // Track integration usage based on route
  const trackIntegrationMetrics = () => {
    try {
      const route = req.route?.path || req.path;
      const orgId = req.get('X-ORG-ID') || req.headers['x-org-id'] || req.body?.orgId || req.activeOrgId || 'unknown';
      const userId = (typeof req.auth === 'function' ? req.auth()?.userId : req.auth?.userId) || req.body?.userId || 'unknown';
      const duration = (Date.now() - startTime) / 1000;

      // Track AI integrations
      if (route.includes('/vertex-ai') || route.includes('/openai') || route.includes('/gemini') || route.includes('/deepseek')) {
        const provider = route.includes('/vertex-ai') ? 'vertex' : route.includes('/openai') ? 'openai' : route.includes('/gemini') ? 'gemini' : 'deepseek';

        if (route.includes('/sessions')) {
          trackAiSession(orgId, provider, 'session_operation', res.statusCode < 400 ? 'success' : 'error');
        } else if (route.includes('/messages')) {
          trackAiMessage(orgId, provider, 'user', req.params.sessionId || 'unknown');
        } else if (route.includes('/ask') || route.includes('/ctx')) {
          trackAiResponseTime(orgId, provider, 'default', duration);
        }

        trackIntegrationUsage('ai', orgId, req.method, res.statusCode < 400 ? 'success' : 'error', provider, duration);
      }

      // Track DAO operations
      if (route.includes('/dao')) {
        const operation = req.method.toLowerCase();
        const objectType = req.body?.type || 'unknown';

        trackDaoObjectOperation(operation, orgId, objectType, res.statusCode < 400 ? 'success' : 'error', userId);

        // Track object size if it's a write operation
        if (['post', 'put', 'patch'].includes(operation) && req.body?.data) {
          const sizeBytes = Buffer.byteLength(JSON.stringify(req.body.data), 'utf8');
          trackDaoObjectSize(orgId, objectType, sizeBytes);
        }
      }

      // Track DAO commands
      if (route.includes('/dao-commands')) {
        const operation = req.method.toLowerCase();
        const action = req.body?.action || 'unknown';

        trackDaoCommandOperation(operation, orgId, action, res.statusCode < 400 ? 'success' : 'error', userId);

        // Track command size if it's a write operation
        if (['post', 'put', 'patch'].includes(operation) && req.body?.command) {
          const sizeBytes = Buffer.byteLength(req.body.command, 'utf8');
          trackDaoCommandSize(orgId, action, sizeBytes);
        }
      }

      // Track other integrations
      if (route.includes('/resend')) {
        trackIntegrationUsage(
          'email',
          orgId,
          req.method,
          res.statusCode < 400 ? 'success' : 'error',
          'resend',
          duration
        );
      } else if (route.includes('/twilio')) {
        trackIntegrationUsage('sms', orgId, req.method, res.statusCode < 400 ? 'success' : 'error', 'twilio', duration);
      } else if (route.includes('/payu')) {
        trackIntegrationUsage(
          'payment',
          orgId,
          req.method,
          res.statusCode < 400 ? 'success' : 'error',
          'payu',
          duration
        );
      } else if (route.includes('/files') || route.includes('/cloudinary')) {
        trackIntegrationUsage(
          'file_upload',
          orgId,
          req.method,
          res.statusCode < 400 ? 'success' : 'error',
          'cloudinary',
          duration
        );
      } else if (route.includes('/gcs-buckets')) {
        trackIntegrationUsage(
          'storage',
          orgId,
          req.method,
          res.statusCode < 400 ? 'success' : 'error',
          'gcs',
          duration
        );
      }
    } catch (error) {
      console.error('Error in trackIntegrationMetrics:', error.message);
      // Don't let metrics errors break the response
    }
  };

  // Override res.send to track metrics
  res.send = function (data) {
    trackIntegrationMetrics();
    return originalSend.call(this, data);
  };

  // Override res.json to track metrics
  res.json = function (data) {
    trackIntegrationMetrics();
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Middleware to track DAO command execution metrics
 */
const trackDaoCommandExecutionMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;
  const originalJson = res.json;

  const trackExecution = () => {
    const orgId = req.get('X-ORG-ID') || req.headers['x-org-id'] || req.body?.orgId || req.activeOrgId || 'unknown';
    const duration = (Date.now() - startTime) / 1000;
    const status = res.statusCode < 400 ? 'success' : 'error';
    const errorType = res.statusCode >= 400 ? 'http_error' : null;

    // Extract entities affected from response if available
    let entitiesAffected = null;
    if (res.locals.entitiesAffected) {
      entitiesAffected = res.locals.entitiesAffected;
    }

    trackDaoCommandExecution(orgId, status, 'execution', errorType, duration, entitiesAffected);
  };

  res.send = function (data) {
    trackExecution();
    return originalSend.call(this, data);
  };

  res.json = function (data) {
    trackExecution();
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Middleware to track AI response times
 */
const trackAiResponseTimeMiddleware = (provider) => (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;
  const originalJson = res.json;

  const trackResponse = () => {
    const orgId = req.get('X-ORG-ID') || req.headers['x-org-id'] || req.body?.orgId || req.activeOrgId || 'unknown';
    const duration = (Date.now() - startTime) / 1000;
    const model = req.body?.model || 'default';

    trackAiResponseTime(orgId, provider, model, duration);
  };

  res.send = function (data) {
    trackResponse();
    return originalSend.call(this, data);
  };

  res.json = function (data) {
    trackResponse();
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Middleware to track business metrics
 */
const trackBusinessMetricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;
  const originalJson = res.json;

  const trackBusinessMetrics = () => {
    const route = req.route?.path || req.path;
    const orgId = req.get('X-ORG-ID') || req.headers['x-org-id'] || req.body?.orgId || req.activeOrgId || 'unknown';
    const userId = req.auth?.userId || req.body?.userId || 'unknown';

    // Track user activity
    if (userId !== 'unknown') {
      // This would typically update a user activity tracking system
      // For now, we'll just log it
    }

    // Track data volume for write operations
    if (['post', 'put', 'patch'].includes(req.method.toLowerCase()) && req.body) {
      const dataSize = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
    }
  };

  res.send = function (data) {
    trackBusinessMetrics();
    return originalSend.call(this, data);
  };

  res.json = function (data) {
    trackBusinessMetrics();
    return originalJson.call(this, data);
  };

  next();
};

module.exports = {
  enhancedMetricsMiddleware,
  trackDaoCommandExecutionMiddleware,
  trackAiResponseTimeMiddleware,
  trackBusinessMetricsMiddleware,
};
