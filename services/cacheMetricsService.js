const cacheService = require('./cacheService');
const { updateCacheSize, updateCacheHitRate } = require('../prometheus');

/**
 * Service to update cache metrics in Prometheus
 * Runs periodically to keep metrics up to date
 */
class CacheMetricsService {
  constructor(options = {}) {
    this.updateInterval = options.updateInterval || 30000; // 30 seconds
    this.isRunning = false;
    this.intervalId = null;
  }

  /**
   * Start the metrics update service
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.updateMetrics();
    }, this.updateInterval);

    // Update metrics immediately
    this.updateMetrics();
  }

  /**
   * Stop the metrics update service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  /**
   * Update cache metrics in Prometheus
   */
  updateMetrics() {
    try {
      const stats = cacheService.getStats();

      // Update cache size metrics for different cache types
      updateCacheSize('org', stats.size);
      updateCacheSize('profile', stats.size);
      updateCacheSize('dao', stats.size);

      // Update cache hit rate metrics
      const hitRate = parseFloat(stats.hitRate);
      updateCacheHitRate('org', hitRate);
      updateCacheHitRate('profile', hitRate);
      updateCacheHitRate('dao', hitRate);
    } catch (error) {
      console.error('Error updating cache metrics:', error);
    }
  }

  /**
   * Get current cache metrics
   */
  getMetrics() {
    return cacheService.getStats();
  }
}

// Singleton instance
const cacheMetricsService = new CacheMetricsService();

module.exports = cacheMetricsService;
