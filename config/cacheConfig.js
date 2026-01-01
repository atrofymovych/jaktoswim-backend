/**
 * Cache configuration for the application
 * Provides centralized cache settings with environment variable support
 */

const cacheConfig = {
  // Cache TTL settings (in milliseconds)
  ttl: {
    org: parseInt(process.env.CACHE_ORG_TTL) || 2 * 60 * 60 * 1000, // 2 hours (increased from 30 minutes)
    profile: parseInt(process.env.CACHE_PROFILE_TTL) || 60 * 60 * 1000, // 1 hour (increased from 15 minutes)
    dao: parseInt(process.env.CACHE_DAO_TTL) || 30 * 60 * 1000, // 30 minutes (increased from 10 minutes)
    permission: parseInt(process.env.CACHE_PERMISSION_TTL) || 15 * 60 * 1000, // 15 minutes (roles/permissions change infrequently)
    ai: parseInt(process.env.CACHE_AI_TTL) || 5 * 60 * 1000, // 5 minutes (AI sessions change moderately)
  },

  // Cache size limits
  maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 10000, // Increased from 5000 to 10000

  // Cleanup interval (in milliseconds)
  cleanupInterval: parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 60000, // 1 minute

  // Metrics update interval (in milliseconds)
  metricsUpdateInterval: parseInt(process.env.CACHE_METRICS_UPDATE_INTERVAL) || 30000, // 30 seconds

  // Cache enable/disable flags
  enabled: {
    org: process.env.CACHE_ORG_ENABLED !== 'false', // Default: true
    profile: process.env.CACHE_PROFILE_ENABLED !== 'false', // Default: true
    dao: process.env.CACHE_DAO_ENABLED !== 'false', // Default: true
    permission: process.env.CACHE_PERMISSION_ENABLED !== 'false', // Default: true
    ai: process.env.CACHE_AI_ENABLED !== 'false', // Default: true
  },

  // Global cache disable flag
  disabled: process.env.DISABLE_CACHE === 'true',

  // Cache key prefix
  keyPrefix: process.env.CACHE_KEY_PREFIX || 'dao_cache',

  // Cache eviction strategy
  evictionStrategy: process.env.CACHE_EVICTION_STRATEGY || 'lru', // 'lru', 'fifo', 'ttl'

  // Cache compression
  compression: {
    enabled: process.env.CACHE_COMPRESSION_ENABLED === 'true',
    threshold: parseInt(process.env.CACHE_COMPRESSION_THRESHOLD) || 1024, // 1KB
  },

  // Cache logging
  logging: {
    enabled: process.env.CACHE_LOGGING_ENABLED === 'true',
    level: process.env.CACHE_LOGGING_LEVEL || 'info', // 'debug', 'info', 'warn', 'error'
  },

  // Cache health check
  healthCheck: {
    enabled: process.env.CACHE_HEALTH_CHECK_ENABLED !== 'false', // Default: true
    interval: parseInt(process.env.CACHE_HEALTH_CHECK_INTERVAL) || 60000, // 1 minute
  },
};

/**
 * Get cache configuration for a specific type
 * @param {string} type - Cache type (org, profile, dao)
 * @returns {Object} Configuration for the cache type
 */
function getCacheConfig(type) {
  return {
    ttl: cacheConfig.ttl[type] || cacheConfig.ttl.org,
    enabled: cacheConfig.enabled[type] !== false,
    maxSize: cacheConfig.maxSize,
    cleanupInterval: cacheConfig.cleanupInterval,
    keyPrefix: cacheConfig.keyPrefix,
    evictionStrategy: cacheConfig.evictionStrategy,
    compression: cacheConfig.compression,
    logging: cacheConfig.logging,
  };
}

/**
 * Check if caching is enabled globally
 * @returns {boolean} True if caching is enabled
 */
function isCachingEnabled() {
  return !cacheConfig.disabled;
}

/**
 * Check if caching is enabled for a specific type
 * @param {string} type - Cache type (org, profile, dao)
 * @returns {boolean} True if caching is enabled for the type
 */
function isCachingEnabledForType(type) {
  return isCachingEnabled() && cacheConfig.enabled[type] !== false;
}

/**
 * Get all cache configuration
 * @returns {Object} Complete cache configuration
 */
function getAllCacheConfig() {
  return { ...cacheConfig };
}

module.exports = {
  cacheConfig,
  getCacheConfig,
  isCachingEnabled,
  isCachingEnabledForType,
  getAllCacheConfig,
};
