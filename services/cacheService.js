const crypto = require('crypto');
const { getCacheConfig, isCachingEnabled } = require('../config/cacheConfig');

class CacheService {
  constructor(options = {}) {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      totalRequests: 0,
    };

    const config = getCacheConfig('org');
    this.config = config;

    this.defaultTTL = {
      org: options.orgTTL || config.ttl,
      profile: options.profileTTL || 2 * 60 * 1000,
      dao: options.daoTTL || 1 * 60 * 1000,
    };

    this.maxSize = options.maxSize || config.maxSize;
    this.cleanupInterval = options.cleanupInterval || config.cleanupInterval;

    if (isCachingEnabled()) {
      this.startCleanup();
    }
  }

  generateKey(type, userId, orgId, requestData = {}) {
    const keyData = {
      type,
      userId,
      orgId,
      request: requestData
    };

    // Sort keys recursively to ensure consistent key generation
    const sortedKeyData = this.sortObjectKeys(keyData);
    const keyString = JSON.stringify(sortedKeyData);
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Recursively sort object keys for consistent key generation
   * @param {Object} obj - Object to sort
   * @returns {Object} Object with sorted keys
   */
  sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      return obj;
    }

    const sorted = {};
    Object.keys(obj).sort().forEach((key) => {
      sorted[key] = this.sortObjectKeys(obj[key]);
    });
    return sorted;
  }

  /**
   * Get cached response
   * @param {string} key - Cache key
   * @returns {Object|null} Cached response or null if not found/expired
   */
  get(key) {
    this.stats.totalRequests++;

    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set cached response
   * @param {string} key - Cache key
   * @param {Object} data - Response data to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  set(key, data, ttl) {
    // Prevent cache from growing too large
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    const entry = {
      data: JSON.parse(JSON.stringify(data)), // Deep clone
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    };

    this.cache.set(key, entry);
    this.stats.sets++;
  }

  /**
   * Delete cached entry
   * @param {string} key - Cache key
   */
  delete(key) {
    if (this.cache.delete(key)) {
      this.stats.deletes++;
    }
  }

  /**
   * Clear cache entries by pattern
   * @param {string} pattern - Pattern to match (e.g., 'org:user123:*')
   */
  clearByPattern(pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    let deleted = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    this.stats.deletes += deleted;
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.stats.deletes += this.cache.size;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const hitRate = this.stats.totalRequests > 0
      ? (this.stats.hits / this.stats.totalRequests * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }

  /**
   * Evict oldest cache entry
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Start cleanup process for expired entries
   */
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.stats.deletes += cleaned;
      }
    }, this.cleanupInterval);
  }

  /**
   * Get TTL for cache type
   * @param {string} type - Cache type
   * @returns {number} TTL in milliseconds
   */
  getTTL(type) {
    return this.defaultTTL[type] || this.defaultTTL.org;
  }
}

// Singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
