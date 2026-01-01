const MetricsCollector = require('./metricsCollector');

/**
 * Safe metrics collector startup
 * This function can be called from the main application to start metrics collection
 * It's designed to be fail-safe and won't break the application if metrics fail
 */
function startMetricsCollector(options = {}) {
  try {
    const {
      intervalMs = 5 * 60 * 1000, // 5 minutes default
      enabled = process.env.METRICS_COLLECTION_ENABLED !== 'false',
    } = options;

    if (!enabled) {
      return null;
    }

    const collector = new MetricsCollector();

    // Start collection with error handling
    try {
      collector.startCollection(intervalMs);
      return collector;
    } catch (error) {
      console.error('Failed to start metrics collector:', error.message);
      return null;
    }
  } catch (error) {
    console.error('Error initializing metrics collector:', error.message);
    return null;
  }
}

/**
 * Stop metrics collector safely
 */
function stopMetricsCollector(collector) {
  try {
    if (collector && typeof collector.stopCollection === 'function') {
      collector.stopCollection();
    }
  } catch (error) {
    console.error('Error stopping metrics collector:', error.message);
  }
}

module.exports = {
  startMetricsCollector,
  stopMetricsCollector,
};
