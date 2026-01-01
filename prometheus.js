const client = require('prom-client');

const register = new client.Registry();

const collectDefaultMetrics = client.collectDefaultMetrics;
let metricsCollector = null;

// Only start metrics collection if not in test mode
if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_METRICS !== 'true') {
  metricsCollector = collectDefaultMetrics({ register, prefix: 'dao_app_' });
}

// ==================== EXISTING METRICS ====================
const httpRequestCounter = new client.Counter({
  name: 'dao_app_http_requests_total',
  help: 'Total number of HTTP requests for the DAO app',
  labelNames: ['method', 'route', 'code', 'org_id', 'source', 'ip'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'dao_app_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds for the DAO app',
  labelNames: ['method', 'route', 'code', 'org_id', 'source', 'ip'],
  buckets: [0.1, 0.3, 0.5, 1, 1.5, 3, 5],
  registers: [register],
});

// ==================== INTEGRATION USAGE STATS BY ORG ID ====================
const integrationUsageCounter = new client.Counter({
  name: 'dao_app_integration_usage_total',
  help: 'Total usage of integrations by org ID',
  labelNames: ['integration', 'org_id', 'operation', 'status', 'provider'],
  registers: [register],
});

const integrationUsageDuration = new client.Histogram({
  name: 'dao_app_integration_usage_duration_seconds',
  help: 'Duration of integration operations by org ID',
  labelNames: ['integration', 'org_id', 'operation', 'status', 'provider'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// ==================== ENDPOINTS USAGE STATS BY ORG ID ====================
const endpointUsageCounter = new client.Counter({
  name: 'dao_app_endpoint_usage_total',
  help: 'Total usage of endpoints by org ID',
  labelNames: ['endpoint', 'method', 'org_id', 'status', 'user_id', 'source'],
  registers: [register],
});

// ==================== DAILY.CO VIDEO CALL METRICS ====================
const videoCallCreationCounter = new client.Counter({
  name: 'dao_app_video_call_creation_total',
  help: 'Total number of video call rooms created',
  labelNames: ['org_id', 'room_type', 'status'],
  registers: [register],
});

const videoCallEventCounter = new client.Counter({
  name: 'dao_app_video_call_events_total',
  help: 'Total number of video call events',
  labelNames: ['org_id', 'event_type', 'room_name'],
  registers: [register],
});

const videoCallDuration = new client.Histogram({
  name: 'dao_app_video_call_duration_seconds',
  help: 'Duration of video calls in seconds',
  labelNames: ['org_id', 'room_name'],
  buckets: [60, 300, 600, 1800, 3600, 7200, 14400], // 1min, 5min, 10min, 30min, 1h, 2h, 4h
  registers: [register],
});

const videoCallParticipants = new client.Gauge({
  name: 'dao_app_video_call_participants_current',
  help: 'Current number of participants in video calls',
  labelNames: ['org_id', 'room_name'],
  registers: [register],
});

const endpointUsageDuration = new client.Histogram({
  name: 'dao_app_endpoint_usage_duration_seconds',
  help: 'Duration of endpoint operations by org ID',
  labelNames: ['endpoint', 'method', 'org_id', 'status', 'user_id', 'source'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2],
  registers: [register],
});

// ==================== DAO OBJECT STATS BY ORG ID ====================
const daoObjectCounter = new client.Counter({
  name: 'dao_app_dao_objects_total',
  help: 'Total DAO objects by org ID',
  labelNames: ['operation', 'org_id', 'object_type', 'status', 'user_id'],
  registers: [register],
});

const daoObjectGauge = new client.Gauge({
  name: 'dao_app_dao_objects_current',
  help: 'Current number of DAO objects by org ID',
  labelNames: ['org_id', 'object_type', 'status'],
  registers: [register],
});

const daoObjectSizeHistogram = new client.Histogram({
  name: 'dao_app_dao_object_size_bytes',
  help: 'Size of DAO objects in bytes by org ID',
  labelNames: ['org_id', 'object_type'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000],
  registers: [register],
});

// ==================== DAO COMMANDS STATS BY ORG ID ====================
const daoCommandCounter = new client.Counter({
  name: 'dao_app_dao_commands_total',
  help: 'Total DAO commands by org ID',
  labelNames: ['operation', 'org_id', 'action', 'status', 'user_id'],
  registers: [register],
});

const daoCommandGauge = new client.Gauge({
  name: 'dao_app_dao_commands_current',
  help: 'Current number of DAO commands by org ID',
  labelNames: ['org_id', 'status', 'action'],
  registers: [register],
});

const daoCommandExecutionCounter = new client.Counter({
  name: 'dao_app_dao_command_executions_total',
  help: 'Total DAO command executions by org ID',
  labelNames: ['org_id', 'status', 'action', 'error_type'],
  registers: [register],
});

const daoCommandExecutionDuration = new client.Histogram({
  name: 'dao_app_dao_command_execution_duration_seconds',
  help: 'Duration of DAO command executions by org ID',
  labelNames: ['org_id', 'status', 'action'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

const daoCommandSizeHistogram = new client.Histogram({
  name: 'dao_app_dao_command_size_bytes',
  help: 'Size of DAO commands in bytes by org ID',
  labelNames: ['org_id', 'action'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000],
  registers: [register],
});

const daoCommandEntitiesAffected = new client.Histogram({
  name: 'dao_app_dao_command_entities_affected',
  help: 'Number of entities affected by DAO commands by org ID',
  labelNames: ['org_id', 'action', 'entity_type'],
  buckets: [1, 5, 10, 50, 100, 500, 1000],
  registers: [register],
});

// ==================== AI SESSION STATS BY ORG ID ====================
const aiSessionCounter = new client.Counter({
  name: 'dao_app_ai_sessions_total',
  help: 'Total AI sessions by org ID',
  labelNames: ['org_id', 'provider', 'operation', 'status'],
  registers: [register],
});

const aiMessageCounter = new client.Counter({
  name: 'dao_app_ai_messages_total',
  help: 'Total AI messages by org ID',
  labelNames: ['org_id', 'provider', 'role', 'session_id'],
  registers: [register],
});

const aiResponseTime = new client.Histogram({
  name: 'dao_app_ai_response_time_seconds',
  help: 'AI response time by org ID',
  labelNames: ['org_id', 'provider', 'model'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// ==================== BUSINESS METRICS BY ORG ID ====================
const userActivityGauge = new client.Gauge({
  name: 'dao_app_active_users',
  help: 'Number of active users by org ID',
  labelNames: ['org_id', 'time_window'],
  registers: [register],
});

const dataVolumeGauge = new client.Gauge({
  name: 'dao_app_data_volume_bytes',
  help: 'Total data volume by org ID',
  labelNames: ['org_id', 'data_type'],
  registers: [register],
});

const errorRateGauge = new client.Gauge({
  name: 'dao_app_error_rate',
  help: 'Error rate by org ID',
  labelNames: ['org_id', 'error_type', 'component'],
  registers: [register],
});

// ==================== CACHE STATS ====================
const cacheHitCounter = new client.Counter({
  name: 'dao_app_cache_hits_total',
  help: 'Total cache hits by cache type and org ID',
  labelNames: ['cache_type', 'org_id', 'endpoint'],
  registers: [register],
});

const cacheMissCounter = new client.Counter({
  name: 'dao_app_cache_misses_total',
  help: 'Total cache misses by cache type and org ID',
  labelNames: ['cache_type', 'org_id', 'endpoint'],
  registers: [register],
});

const cacheSizeGauge = new client.Gauge({
  name: 'dao_app_cache_size',
  help: 'Current cache size by cache type',
  labelNames: ['cache_type'],
  registers: [register],
});

const cacheHitRateGauge = new client.Gauge({
  name: 'dao_app_cache_hit_rate',
  help: 'Cache hit rate percentage by cache type',
  labelNames: ['cache_type'],
  registers: [register],
});

// ==================== MIDDLEWARE ====================
const metricsMiddleware = (req, res, next) => {
  if (req.method === 'OPTIONS' || req.path === '/metrics') {
    return next();
  }

  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    try {
      const route = req.route ? req.route.path : 'unknown_route';
      const orgId = req.get('X-ORG-ID') || req.headers['x-org-id'] || req.body?.orgId || req.activeOrgId || 'unknown';
      const userId = (typeof req.auth === 'function' ? req.auth()?.userId : req.auth?.userId) || req.body?.userId || 'unknown';
      const source = req.get('X-SOURCE') || req.headers['x-source'] || 'unknown';

      const labels = {
        method: req.method,
        route: route,
        code: res.statusCode,
        org_id: orgId,
        source: source,
        ip: req.ip || 'unknown',
      };

      // Safe metric operations
      safeMetricOperation(() => {
        httpRequestCounter.labels(labels).inc();
        end(labels);
      });

      // Track endpoint usage safely
      safeMetricOperation(() => {
        endpointUsageCounter.labels(route, req.method, orgId, res.statusCode.toString(), userId, source).inc();
      });

      safeMetricOperation(() => {
        endpointUsageDuration
          .labels(route, req.method, orgId, res.statusCode.toString(), userId, source)
          .observe(end());
      });
    } catch (error) {
      console.error('Metrics middleware error:', error.message);
      // Don't let metrics errors break the response
    }
  });

  next();
};

// ==================== UTILITY FUNCTIONS ====================
const safeMetricOperation = (operation, fallback = () => {}) => {
  try {
    return operation();
  } catch (error) {
    console.error('Metrics operation failed:', error.message);
    fallback();
    return null;
  }
};

const trackIntegrationUsage = (integration, orgId, operation, status, provider, duration = null) => {
  safeMetricOperation(() => {
    integrationUsageCounter.labels(integration, orgId, operation, status, provider).inc();
    if (duration !== null) {
      integrationUsageDuration.labels(integration, orgId, operation, status, provider).observe(duration);
    }
  });
};

const trackDaoObjectOperation = (operation, orgId, objectType, status, userId) => {
  safeMetricOperation(() => {
    daoObjectCounter.labels(operation, orgId, objectType, status, userId).inc();
  });
};

const trackDaoCommandOperation = (operation, orgId, action, status, userId) => {
  safeMetricOperation(() => {
    daoCommandCounter.labels(operation, orgId, action, status, userId).inc();
  });
};

const trackDaoCommandExecution = (
  orgId,
  status,
  action,
  errorType = null,
  duration = null,
  entitiesAffected = null
) => {
  safeMetricOperation(() => {
    daoCommandExecutionCounter.labels(orgId, status, action, errorType || 'none').inc();
    if (duration !== null) {
      daoCommandExecutionDuration.labels(orgId, status, action).observe(duration);
    }
    if (entitiesAffected !== null) {
      daoCommandEntitiesAffected.labels(orgId, action, 'objects').observe(entitiesAffected);
    }
  });
};

const trackAiSession = (orgId, provider, operation, status) => {
  safeMetricOperation(() => {
    aiSessionCounter.labels(orgId, provider, operation, status).inc();
  });
};

const trackAiMessage = (orgId, provider, role, sessionId) => {
  safeMetricOperation(() => {
    aiMessageCounter.labels(orgId, provider, role, sessionId).inc();
  });
};

const trackAiResponseTime = (orgId, provider, model, duration) => {
  safeMetricOperation(() => {
    aiResponseTime.labels(orgId, provider, model).observe(duration);
  });
};

const updateDaoObjectGauge = (orgId, objectType, status, count) => {
  safeMetricOperation(() => {
    daoObjectGauge.labels(orgId, objectType, status).set(count);
  });
};

const updateDaoCommandGauge = (orgId, status, action, count) => {
  safeMetricOperation(() => {
    daoCommandGauge.labels(orgId, status, action).set(count);
  });
};

const updateUserActivityGauge = (orgId, timeWindow, count) => {
  safeMetricOperation(() => {
    userActivityGauge.labels(orgId, timeWindow).set(count);
  });
};

const updateDataVolumeGauge = (orgId, dataType, bytes) => {
  safeMetricOperation(() => {
    dataVolumeGauge.labels(orgId, dataType).set(bytes);
  });
};

const updateErrorRateGauge = (orgId, errorType, component, rate) => {
  safeMetricOperation(() => {
    errorRateGauge.labels(orgId, errorType, component).set(rate);
  });
};

const trackDaoObjectSize = (orgId, objectType, sizeBytes) => {
  safeMetricOperation(() => {
    daoObjectSizeHistogram.labels(orgId, objectType).observe(sizeBytes);
  });
};

const trackDaoCommandSize = (orgId, action, sizeBytes) => {
  safeMetricOperation(() => {
    daoCommandSizeHistogram.labels(orgId, action).observe(sizeBytes);
  });
};

// ==================== CACHE TRACKING FUNCTIONS ====================
const trackCacheHit = (cacheType, orgId, endpoint) => {
  safeMetricOperation(() => {
    cacheHitCounter.labels(cacheType, orgId, endpoint).inc();
  });
};

const trackCacheMiss = (cacheType, orgId, endpoint) => {
  safeMetricOperation(() => {
    cacheMissCounter.labels(cacheType, orgId, endpoint).inc();
  });
};

const updateCacheSize = (cacheType, size) => {
  safeMetricOperation(() => {
    cacheSizeGauge.labels(cacheType).set(size);
  });
};

const updateCacheHitRate = (cacheType, hitRate) => {
  safeMetricOperation(() => {
    cacheHitRateGauge.labels(cacheType).set(hitRate);
  });
};

// ==================== DAILY.CO VIDEO CALL METRICS FUNCTIONS ====================
const trackVideoCallCreation = (orgId, roomType = 'standard', status = 'success') => {
  safeMetricOperation(() => {
    videoCallCreationCounter.labels(orgId, roomType, status).inc();
  });
};

const trackVideoCallEvent = (orgId, eventType, roomName) => {
  safeMetricOperation(() => {
    videoCallEventCounter.labels(orgId, eventType, roomName).inc();
  });
};

const trackVideoCallDuration = (orgId, roomName, durationSeconds) => {
  safeMetricOperation(() => {
    videoCallDuration.labels(orgId, roomName).observe(durationSeconds);
  });
};

const updateVideoCallParticipants = (orgId, roomName, participantCount) => {
  safeMetricOperation(() => {
    videoCallParticipants.labels(orgId, roomName).set(participantCount);
  });
};

const metricsEndpoint = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    console.error('Metrics endpoint error:', ex);
    res.status(500).end('Metrics collection failed');
  }
};

// Cleanup function for tests
function cleanupMetrics() {
  if (metricsCollector && typeof metricsCollector.stop === 'function') {
    metricsCollector.stop();
  }
}

module.exports = {
  metricsMiddleware,
  metricsEndpoint,
  trackIntegrationUsage,
  trackDaoObjectOperation,
  trackDaoCommandOperation,
  trackDaoCommandExecution,
  trackAiSession,
  trackAiMessage,
  trackAiResponseTime,
  updateDaoObjectGauge,
  updateDaoCommandGauge,
  updateUserActivityGauge,
  updateDataVolumeGauge,
  updateErrorRateGauge,
  trackDaoObjectSize,
  trackDaoCommandSize,
  trackCacheHit,
  trackCacheMiss,
  updateCacheSize,
  updateCacheHitRate,
  trackVideoCallCreation,
  trackVideoCallEvent,
  trackVideoCallDuration,
  updateVideoCallParticipants,
  register,
  cleanupMetrics,
};
