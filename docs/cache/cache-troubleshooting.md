# Cache Troubleshooting Guide

## Common Issues and Solutions

This guide helps diagnose and resolve common cache-related issues in the DAO application.

## Performance Issues

### Low Cache Hit Rate

#### Symptoms
- Cache hit rate below 70%
- High database load
- Slow response times
- Frequent cache misses in logs

#### Diagnosis
```bash
# Check cache statistics
curl http://localhost:8080/cache-stats

# Monitor cache hit rate
curl http://localhost:8080/metrics | grep cache_hit_rate
```

#### Common Causes

1. **Inconsistent Cache Keys**
```javascript
// Problem: Different keys for same data
const key1 = cacheService.generateKey('org', 'user123', 'org_abc', { filter: 'active' });
const key2 = cacheService.generateKey('org', 'user123', 'org_abc', { filter: 'active', extra: undefined });

// Solution: Normalize request data
function normalizeRequestData(data) {
  // Remove undefined values
  const normalized = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      normalized[key] = value;
    }
  }
  return normalized;
}
```

2. **Too Short TTL Values**
```bash
# Problem: TTL too short
CACHE_ORG_TTL=60000  # 1 minute

# Solution: Increase TTL
CACHE_ORG_TTL=7200000  # 2 hours
```

3. **Frequent Cache Invalidation**
```javascript
// Problem: Over-aggressive invalidation
if (req.path.includes('/any-update')) {
  cacheService.clearByPattern('org:*'); // Clears all org cache
}

// Solution: Targeted invalidation
if (req.path.includes('/org-update')) {
  cacheService.clearByPattern(`org:${userId}:${orgId}:*`);
}
```

#### Solutions

1. **Debug Cache Key Generation**
```javascript
// Add logging to cache key generation
const originalGenerateKey = cacheService.generateKey;
cacheService.generateKey = function(type, userId, orgId, requestData) {
  const key = originalGenerateKey.call(this, type, userId, orgId, requestData);
  console.log('Generated cache key:', key, 'for request:', requestData);
  return key;
};
```

2. **Monitor Cache Patterns**
```javascript
// Track cache access patterns
const cacheAccess = new Map();

function trackCacheAccess(key, hit) {
  if (!cacheAccess.has(key)) {
    cacheAccess.set(key, { hits: 0, misses: 0 });
  }

  const stats = cacheAccess.get(key);
  if (hit) {
    stats.hits++;
  } else {
    stats.misses++;
  }

  // Log low hit rate keys
  const total = stats.hits + stats.misses;
  if (total > 10 && stats.hits / total < 0.5) {
    console.warn(`Low hit rate for key: ${key}`, stats);
  }
}
```

3. **Optimize TTL Values**
```javascript
// Dynamic TTL based on data type
function getOptimalTTL(type, requestData) {
  const baseTTL = {
    org: 2 * 60 * 60 * 1000,    // 2 hours
    profile: 60 * 60 * 1000,    // 1 hour
    dao: 30 * 60 * 1000,        // 30 minutes
  };

  // Reduce TTL for real-time data
  if (requestData.realTime) {
    return baseTTL[type] / 4;
  }

  return baseTTL[type];
}
```

### High Memory Usage

#### Symptoms
- Node.js memory usage above 500MB
- Cache size approaching limits
- Memory warnings in logs
- Application slowdown

#### Diagnosis
```bash
# Check memory usage
curl http://localhost:8080/cache-stats | jq '.size'

# Monitor Node.js memory
node --inspect app.js
# Open chrome://inspect in browser
```

#### Common Causes

1. **Large Cache Entries**
```javascript
// Problem: Caching large objects
const largeObject = { data: 'x'.repeat(100000) }; // 100KB
cacheService.set(key, largeObject, 7200000);

// Solution: Implement size limits
function setWithSizeLimit(key, data, ttl, maxSize = 10240) { // 10KB limit
  const serialized = JSON.stringify(data);
  if (serialized.length > maxSize) {
    console.warn(`Cache entry too large: ${serialized.length} bytes`);
    return false;
  }
  cacheService.set(key, data, ttl);
  return true;
}
```

2. **Memory Leaks**
```javascript
// Problem: Cache entries not expiring
// Solution: Monitor cache growth
setInterval(() => {
  const stats = cacheService.getStats();
  const memoryUsage = process.memoryUsage();

  if (stats.size > stats.maxSize * 0.9) {
    console.warn('Cache approaching size limit');
    // Force cleanup
    cacheService.evictOldest();
  }

  if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
    console.warn('High memory usage detected');
    // Reduce cache size
    cacheService.maxSize = Math.floor(cacheService.maxSize * 0.8);
  }
}, 60000);
```

#### Solutions

1. **Implement Cache Compression**
```javascript
const zlib = require('zlib');

function compressCacheEntry(data) {
  const serialized = JSON.stringify(data);
  if (serialized.length > 1024) { // 1KB threshold
    return zlib.gzipSync(serialized);
  }
  return serialized;
}

function decompressCacheEntry(data) {
  if (Buffer.isBuffer(data)) {
    return JSON.parse(zlib.gunzipSync(data));
  }
  return JSON.parse(data);
}
```

2. **Optimize Cache Size**
```javascript
// Dynamic cache size based on available memory
function optimizeCacheSize() {
  const memoryUsage = process.memoryUsage();
  const availableMemory = memoryUsage.heapTotal - memoryUsage.heapUsed;

  // Use 10% of available memory for cache
  const targetCacheMemory = availableMemory * 0.1;
  const averageEntrySize = 1024; // 1KB average
  const optimalSize = Math.floor(targetCacheMemory / averageEntrySize);

  cacheService.maxSize = Math.min(optimalSize, 20000); // Max 20K entries
}
```

### Slow Cache Operations

#### Symptoms
- Cache get/set operations taking >10ms
- High CPU usage
- Slow response times even with cache hits

#### Diagnosis
```javascript
// Profile cache operations
const originalGet = cacheService.get;
cacheService.get = function(key) {
  const start = Date.now();
  const result = originalGet.call(this, key);
  const duration = Date.now() - start;

  if (duration > 10) {
    console.warn(`Slow cache get: ${duration}ms for key: ${key}`);
  }

  return result;
};
```

#### Common Causes

1. **Inefficient Key Generation**
```javascript
// Problem: Complex key generation
function generateComplexKey(data) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(data, null, 2)) // Pretty printing
    .digest('hex');
}

// Solution: Optimize key generation
function generateOptimizedKey(data) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(data)) // No pretty printing
    .digest('hex');
}
```

2. **Large Cache Entries**
```javascript
// Problem: Caching large objects
const largeObject = { data: Array(10000).fill('x') };
cacheService.set(key, largeObject, ttl);

// Solution: Cache only essential data
const essentialData = {
  id: largeObject.id,
  name: largeObject.name,
  // Don't cache large arrays
};
cacheService.set(key, essentialData, ttl);
```

#### Solutions

1. **Optimize Cache Operations**
```javascript
// Use Map for better performance
class OptimizedCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, value, ttl) {
    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttl
    });
  }
}
```

2. **Implement Cache Warming**
```javascript
// Pre-warm frequently accessed data
async function warmCache() {
  const commonQueries = [
    { endpoint: '/auth/orgs', userId: 'common-user' },
    { endpoint: '/profile/get-profile', userId: 'common-user' }
  ];

  for (const query of commonQueries) {
    try {
      await fetch(`http://localhost:8080${query.endpoint}`);
    } catch (error) {
      console.error('Cache warming failed:', error);
    }
  }
}
```

## Data Consistency Issues

### Stale Data

#### Symptoms
- Users see outdated information
- Data changes not reflected immediately
- Cache invalidation not working

#### Diagnosis
```javascript
// Check cache invalidation patterns
function debugInvalidation() {
  const originalClear = cacheService.clearByPattern;
  cacheService.clearByPattern = function(pattern) {
    console.log('Cache invalidation triggered:', pattern);
    return originalClear.call(this, pattern);
  };
}
```

#### Common Causes

1. **Incorrect Invalidation Patterns**
```javascript
// Problem: Wrong pattern
cacheService.clearByPattern(`org:${userId}:*`); // Missing orgId

// Solution: Correct pattern
cacheService.clearByPattern(`org:${userId}:${orgId}:*`);
```

2. **Missing Invalidation Triggers**
```javascript
// Problem: Data updated but cache not cleared
await updateUserProfile(userId, newData);
// Missing: cacheService.clearByPattern(`profile:${userId}:*`);

// Solution: Add invalidation
await updateUserProfile(userId, newData);
cacheService.clearByPattern(`profile:${userId}:*`);
```

#### Solutions

1. **Implement Comprehensive Invalidation**
```javascript
// Centralized invalidation service
class CacheInvalidationService {
  static invalidateUserData(userId, orgId) {
    const patterns = [
      `org:${userId}:*`,
      `profile:${userId}:${orgId}:*`,
      `dao:${orgId}:*`
    ];

    patterns.forEach(pattern => {
      cacheService.clearByPattern(pattern);
    });
  }

  static invalidateOrgData(orgId) {
    cacheService.clearByPattern(`org:*:${orgId}:*`);
    cacheService.clearByPattern(`dao:${orgId}:*`);
  }
}
```

2. **Add Invalidation Logging**
```javascript
// Log all cache invalidations
function logInvalidation(pattern, reason) {
  console.log(`Cache invalidation: ${pattern} (reason: ${reason})`);
  cacheService.clearByPattern(pattern);
}

// Usage
logInvalidation(`profile:${userId}:*`, 'profile updated');
```

### Cache Corruption

#### Symptoms
- JSON parsing errors
- Invalid cache entries
- Application crashes

#### Diagnosis
```javascript
// Validate cache entries
function validateCacheEntry(entry) {
  try {
    if (entry.data && typeof entry.data === 'string') {
      JSON.parse(entry.data);
    }
    return true;
  } catch (error) {
    console.error('Invalid cache entry:', error);
    return false;
  }
}
```

#### Solutions

1. **Implement Cache Validation**
```javascript
// Validate cache entries on retrieval
const originalGet = cacheService.get;
cacheService.get = function(key) {
  const entry = originalGet.call(this, key);

  if (entry && !validateCacheEntry(entry)) {
    console.warn(`Removing corrupted cache entry: ${key}`);
    this.delete(key);
    return null;
  }

  return entry;
};
```

2. **Add Cache Health Checks**
```javascript
// Periodic cache health check
setInterval(() => {
  let corruptedEntries = 0;

  for (const [key, entry] of cacheService.cache.entries()) {
    if (!validateCacheEntry(entry)) {
      cacheService.delete(key);
      corruptedEntries++;
    }
  }

  if (corruptedEntries > 0) {
    console.warn(`Removed ${corruptedEntries} corrupted cache entries`);
  }
}, 300000); // Every 5 minutes
```

## Configuration Issues

### Cache Not Working

#### Symptoms
- No cache hits
- Cache statistics show zero activity
- All requests go to database

#### Diagnosis
```bash
# Check if caching is enabled
curl http://localhost:8080/cache-stats

# Check environment variables
echo $DISABLE_CACHE
echo $CACHE_ORG_ENABLED
```

#### Common Causes

1. **Caching Disabled**
```bash
# Problem: Caching disabled
DISABLE_CACHE=true

# Solution: Enable caching
DISABLE_CACHE=false
```

2. **Wrong Environment**
```bash
# Problem: Test environment
NODE_ENV=test  # Caching disabled in tests

# Solution: Use production environment
NODE_ENV=production
```

#### Solutions

1. **Verify Configuration**
```javascript
// Check cache configuration
const config = getAllCacheConfig();
console.log('Cache configuration:', config);

if (!isCachingEnabled()) {
  console.error('Caching is disabled globally');
}

if (!isCachingEnabledForType('org')) {
  console.error('Org caching is disabled');
}
```

2. **Enable Debug Logging**
```bash
# Enable cache logging
CACHE_LOGGING_ENABLED=true
CACHE_LOGGING_LEVEL=debug
```

### Incorrect TTL Values

#### Symptoms
- Data expires too quickly
- Cache hit rate lower than expected
- Frequent cache misses

#### Diagnosis
```javascript
// Check TTL configuration
const orgConfig = getCacheConfig('org');
console.log('Org TTL:', orgConfig.ttl);
```

#### Solutions

1. **Optimize TTL Values**
```bash
# Increase TTL for stable data
CACHE_ORG_TTL=7200000      # 2 hours
CACHE_PROFILE_TTL=3600000  # 1 hour
CACHE_DAO_TTL=1800000      # 30 minutes
```

2. **Dynamic TTL Based on Data**
```javascript
// Adjust TTL based on data characteristics
function getDynamicTTL(type, data) {
  const baseTTL = getCacheConfig(type).ttl;

  // Reduce TTL for frequently changing data
  if (data.lastModified && Date.now() - data.lastModified < 300000) { // 5 minutes
    return baseTTL / 2;
  }

  return baseTTL;
}
```

## Monitoring and Alerting

### Cache Metrics Monitoring

#### Key Metrics to Monitor
```bash
# Cache hit rate
dao_app_cache_hit_rate{cache_type="org"} < 70

# Cache size
dao_app_cache_size{cache_type="org"} > 8000

# Memory usage
nodejs_heap_size_used_bytes > 500000000
```

#### Grafana Alerts
```yaml
# Low cache hit rate alert
- alert: LowCacheHitRate
  expr: dao_app_cache_hit_rate < 70
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Cache hit rate is below 70%"

# High memory usage alert
- alert: HighMemoryUsage
  expr: nodejs_heap_size_used_bytes > 500000000
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "High memory usage detected"
```

### Health Checks

#### Cache Health Endpoint
```javascript
// Add cache health check
app.get('/health/cache', (req, res) => {
  const stats = cacheService.getStats();
  const health = {
    status: 'healthy',
    hitRate: parseFloat(stats.hitRate),
    size: stats.size,
    maxSize: stats.maxSize
  };

  if (health.hitRate < 50) {
    health.status = 'degraded';
  }

  if (health.size > health.maxSize * 0.95) {
    health.status = 'critical';
  }

  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

## Debug Commands

### Cache Statistics
```bash
# Get cache statistics
curl http://localhost:8080/cache-stats | jq '.'

# Get Prometheus metrics
curl http://localhost:8080/metrics | grep cache

# Check cache configuration
node -e "console.log(require('./config/cacheConfig').getAllCacheConfig())"
```

### Cache Operations
```bash
# Clear all cache
curl -X POST http://localhost:8080/admin/clear-cache

# Clear specific cache type
curl -X POST http://localhost:8080/admin/clear-cache/org

# Disable cache temporarily
export DISABLE_CACHE=true
```

### Performance Testing
```bash
# Test cache performance
node -e "
const cacheService = require('./services/cacheService');
const start = Date.now();
for (let i = 0; i < 1000; i++) {
  cacheService.set('test-' + i, {data: 'test'}, 60000);
}
console.log('Set 1000 entries in', Date.now() - start, 'ms');
"
```

This troubleshooting guide provides comprehensive solutions for common cache-related issues in the DAO application.
