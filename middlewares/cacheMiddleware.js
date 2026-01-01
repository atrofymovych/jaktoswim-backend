const cacheService = require('../services/cacheService');
const { trackCacheHit, trackCacheMiss, updateCacheSize, updateCacheHitRate } = require('../prometheus');
const { isCachingEnabledForType } = require('../config/cacheConfig');

/**
 * Cache middleware for org and profile related queries
 * Caches responses based on request body and user context
 */
function createCacheMiddleware(options = {}) {
  const {
    cacheType = 'org', // 'org', 'profile', 'dao'
    ttl = null, // Override default TTL
    skipCache = false, // Skip caching entirely
    keyGenerator = null, // Custom key generator function
    shouldCache = null, // Custom function to determine if request should be cached
  } = options;

  return async (req, res, next) => {
    // Skip caching if disabled
    if (skipCache || !isCachingEnabledForType(cacheType)) {
      return next();
    }

    // Skip caching for non-GET requests (except specific POST endpoints)
    const allowedMethods = ['GET'];
    const allowedPostEndpoints = ['/auth/bind-org', '/profile/upsert-profile'];
    const isAllowedPost = req.method === 'POST' && allowedPostEndpoints.includes(req.path);

    if (!allowedMethods.includes(req.method) && !isAllowedPost) {
      return next();
    }

    // Skip caching for certain endpoints
    const skipEndpoints = ['/metrics', '/health', '/auth/logout'];
    if (skipEndpoints.some((endpoint) => req.path.includes(endpoint))) {
      return next();
    }

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
      const userId = extractedAuth?.userId || req.body?.userId || 'anonymous';
      const orgId = req.activeOrgId || req.body?.orgId || 'unknown';

      // Generate cache key
      let cacheKey;
      if (keyGenerator) {
        cacheKey = keyGenerator(req, userId, orgId);
      } else {
        const requestData = {
          method: req.method,
          path: req.path,
          query: req.query,
          body: req.body,
          headers: {
            'x-org-id': req.get('X-ORG-ID'),
            'x-source': req.get('X-SOURCE')
          }
        };
        cacheKey = cacheService.generateKey(cacheType, userId, orgId, requestData);
      }

      // Check if request should be cached
      if (shouldCache && !shouldCache(req)) {
        return next();
      }

      // Try to get from cache
      const cachedResponse = cacheService.get(cacheKey);

      if (cachedResponse) {
        // Cache hit
        trackCacheHit(cacheType, orgId, req.path);

        // Update cache metrics
        const stats = cacheService.getStats();
        updateCacheSize(cacheType, stats.size);
        updateCacheHitRate(cacheType, parseFloat(stats.hitRate));

        return res.json(cachedResponse);
      }

      // Cache miss - continue to next middleware
      trackCacheMiss(cacheType, orgId, req.path);

      // Store original res.json to intercept response
      const originalJson = res.json.bind(res);
      res.json = function (data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const cacheTTL = ttl || cacheService.getTTL(cacheType);
          cacheService.set(cacheKey, data, cacheTTL);

          // Update cache metrics
          const stats = cacheService.getStats();
          updateCacheSize(cacheType, stats.size);
          updateCacheHitRate(cacheType, parseFloat(stats.hitRate));
        }

        // Call original json method
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      // Don't let cache errors break the request
      next();
    }
  };
}

/**
 * Specific cache middleware for org-related queries
 */
function orgCacheMiddleware() {
  return createCacheMiddleware({
    cacheType: 'org',
    shouldCache: (req) =>
      // Cache org binding, org listing, and active org queries
      ['/auth/bind-org', '/auth/orgs', '/auth/active-org'].includes(req.path)

  });
}

/**
 * Specific cache middleware for profile-related queries
 */
function profileCacheMiddleware() {
  return createCacheMiddleware({
    cacheType: 'profile',
    shouldCache: (req) =>
      // Cache profile get and upsert operations
      ['/profile/get-profile', '/profile/upsert-profile'].includes(req.path)

  });
}

/**
 * Specific cache middleware for user-related queries
 */
function userCacheMiddleware() {
  return createCacheMiddleware({
    cacheType: 'org',
    shouldCache: (req) =>
      // Cache user listing queries
      req.path === '/users' && req.method === 'GET'

  });
}

/**
 * Cache invalidation middleware
 * Clears cache when data is modified
 */
function cacheInvalidationMiddleware() {
  return async (req, res, next) => {
    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);

    res.json = function (data) {
      // Invalidate cache for successful modifications
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.auth()?.userId || req.body?.userId || 'anonymous';
        const orgId = req.activeOrgId || req.body?.orgId || 'unknown';

        // Clear cache based on the type of operation
        if (req.path.includes('/profile/upsert-profile')) {
          // Clear profile cache for this user/org
          const profilePattern = `profile:${userId}:${orgId}:*`;
          cacheService.clearByPattern(profilePattern);
        } else if (req.path.includes('/auth/bind-org')) {
          // Clear org cache for this user
          const orgPattern = `org:${userId}:*`;
          cacheService.clearByPattern(orgPattern);
        } else if (req.path.includes('/users') && req.method !== 'GET') {
          // Clear user cache for this org
          const userPattern = `org:${orgId}:*`;
          cacheService.clearByPattern(userPattern);
        } else if (req.path.includes('/dao/') && ['add-object', 'update-object', 'add-object-bulk'].some((op) => req.path.includes(op))) {
          // Clear DAO cache for this org
          const daoPattern = `dao:${orgId}:*`;
          cacheService.clearByPattern(daoPattern);
        } else if (req.path.includes('/admin/') && req.path.includes('/role')) {
          // Clear permission cache when roles are updated
          const permissionCacheService = require('../services/permissionCacheService');
          permissionCacheService.clearPermissions(orgId);
        } else if (req.path.includes('/ai/') && ['sessions', 'messages'].some((endpoint) => req.path.includes(endpoint))) {
          // Clear AI cache when sessions or messages are modified
          const aiPattern = `ai:${orgId}:*`;
          cacheService.clearByPattern(aiPattern);
        }
      }

      return originalJson(data);
    };

    next();
  };
}

module.exports = {
  createCacheMiddleware,
  orgCacheMiddleware,
  profileCacheMiddleware,
  userCacheMiddleware,
  cacheInvalidationMiddleware
};
