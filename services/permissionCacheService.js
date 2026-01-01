/**
 * Permission caching service
 * Caches role lookups and permission checks to avoid repeated database queries
 */

const cacheService = require('./cacheService');
const { getCacheConfig, isCachingEnabledForType } = require('../config/cacheConfig');

class PermissionCacheService {
  constructor() {
    this.config = getCacheConfig('permission');
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
    };
  }

  /**
   * Get user role with caching
   * @param {Object} models - Database models
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID
   * @returns {Promise<string|null>} User role or null
   */
  async getUserRole(models, userId, organizationId) {
    if (!isCachingEnabledForType('permission')) {
      const mapping = await models.OrganisationRolesMapping.findOne({
        userId,
        organizationId,
      }).lean();
      return mapping?.role || null;
    }

    const cacheKey = this.generateRoleKey(userId, organizationId);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      this.stats.hits++;
      return cached.role;
    }

    // Cache miss - fetch from database
    this.stats.misses++;
    const mapping = await models.OrganisationRolesMapping.findOne({
      userId,
      organizationId,
    }).lean();

    const role = mapping?.role || null;

    // Cache the result
    this.cache.set(cacheKey, {
      role,
      expiresAt: Date.now() + this.config.ttl,
    });
    this.stats.sets++;

    return role;
  }

  /**
   * Check object permission with caching
   * @param {Object} models - Database models
   * @param {string} organizationId - Organization ID
   * @param {string} objectType - Object type
   * @param {string} role - User role
   * @param {string} action - Action to check
   * @returns {Promise<boolean>} True if permission is allowed
   */
  async checkObjectPermission(models, organizationId, objectType, role, action) {
    if (!isCachingEnabledForType('permission')) {
      const perm = await models.ObjectPermission.findOne({
        organizationId,
        objectType,
        role,
        action,
      }).lean();
      return !(perm && perm.allow === false);
    }

    const cacheKey = this.generatePermissionKey(organizationId, objectType, role, action);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      this.stats.hits++;
      return cached.allowed;
    }

    // Cache miss - fetch from database
    this.stats.misses++;
    const perm = await models.ObjectPermission.findOne({
      organizationId,
      objectType,
      role,
      action,
    }).lean();

    const allowed = !(perm && perm.allow === false);

    // Cache the result
    this.cache.set(cacheKey, {
      allowed,
      expiresAt: Date.now() + this.config.ttl,
    });
    this.stats.sets++;

    return allowed;
  }

  /**
   * Clear role cache for a user
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID (optional)
   */
  clearUserRole(userId, organizationId = null) {
    if (organizationId) {
      const key = this.generateRoleKey(userId, organizationId);
      this.cache.delete(key);
    } else {
      // Clear all role entries for this user
      for (const [key] of this.cache.entries()) {
        if (key.startsWith(`role:${userId}:`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Clear permission cache for an organization
   * @param {string} organizationId - Organization ID
   * @param {string} objectType - Object type (optional)
   */
  clearPermissions(organizationId, objectType = null) {
    if (objectType) {
      // Clear specific object type permissions
      for (const [key] of this.cache.entries()) {
        if (key.startsWith(`perm:${organizationId}:${objectType}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all permissions for this organization
      for (const [key] of this.cache.entries()) {
        if (key.startsWith(`perm:${organizationId}:`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Clear all permission cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? `${((this.stats.hits / total) * 100).toFixed(2)}%` : '0%',
      size: this.cache.size,
    };
  }

  /**
   * Generate cache key for role lookup
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID
   * @returns {string} Cache key
   */
  generateRoleKey(userId, organizationId) {
    return `role:${userId}:${organizationId}`;
  }

  /**
   * Generate cache key for permission check
   * @param {string} organizationId - Organization ID
   * @param {string} objectType - Object type
   * @param {string} role - User role
   * @param {string} action - Action
   * @returns {string} Cache key
   */
  generatePermissionKey(organizationId, objectType, role, action) {
    return `perm:${organizationId}:${objectType}:${role}:${action}`;
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    if (!isCachingEnabledForType('permission')) return;

    setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }
}

// Create singleton instance
const permissionCacheService = new PermissionCacheService();

// Start cleanup if caching is enabled
if (isCachingEnabledForType('permission')) {
  permissionCacheService.startCleanup();
}

module.exports = permissionCacheService;
