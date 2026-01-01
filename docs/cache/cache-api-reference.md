# Cache API Reference

## Cache Service API

### Core Methods

#### `cacheService.get(key)`
Retrieves a cached response.

**Parameters:**
- `key` (string): Cache key

**Returns:**
- `Object|null`: Cached data or null if not found/expired

**Example:**
```javascript
const cachedData = cacheService.get('org:user123:org_abc:hash123');
if (cachedData) {
  return res.json(cachedData);
}
```

#### `cacheService.set(key, data, ttl)`
Stores a response in cache.

**Parameters:**
- `key` (string): Cache key
- `data` (Object): Response data to cache
- `ttl` (number): Time to live in milliseconds

**Returns:**
- `void`

**Example:**
```javascript
cacheService.set('org:user123:org_abc:hash123', responseData, 7200000); // 2 hours
```

#### `cacheService.delete(key)`
Deletes a specific cache entry.

**Parameters:**
- `key` (string): Cache key

**Returns:**
- `boolean`: True if entry was deleted

**Example:**
```javascript
const deleted = cacheService.delete('org:user123:org_abc:hash123');
```

#### `cacheService.clearByPattern(pattern)`
Clears cache entries matching a pattern.

**Parameters:**
- `pattern` (string): Pattern with wildcards (e.g., 'org:user123:*')

**Returns:**
- `number`: Number of entries deleted

**Example:**
```javascript
const deleted = cacheService.clearByPattern('org:user123:*');
console.log(`Deleted ${deleted} cache entries`);
```

#### `cacheService.clear()`
Clears all cache entries.

**Returns:**
- `void`

**Example:**
```javascript
cacheService.clear();
```

#### `cacheService.getStats()`
Returns cache statistics.

**Returns:**
- `Object`: Cache statistics

**Example:**
```javascript
const stats = cacheService.getStats();
console.log(`Hit rate: ${stats.hitRate}`);
console.log(`Cache size: ${stats.size}/${stats.maxSize}`);
```

**Response Format:**
```javascript
{
  hits: 1250,
  misses: 150,
  sets: 1400,
  deletes: 25,
  totalRequests: 1400,
  hitRate: "89.29%",
  size: 850,
  maxSize: 10000
}
```

#### `cacheService.generateKey(type, userId, orgId, requestData)`
Generates a cache key from request data.

**Parameters:**
- `type` (string): Cache type ('org', 'profile', 'dao')
- `userId` (string): User ID
- `orgId` (string): Organization ID
- `requestData` (Object): Request data

**Returns:**
- `string`: SHA-256 hash of the cache key

**Example:**
```javascript
const key = cacheService.generateKey('org', 'user123', 'org_abc', {
  method: 'GET',
  path: '/auth/orgs',
  query: {},
  body: {}
});
```

## Cache Middleware API

### `createCacheMiddleware(options)`
Creates a cache middleware with custom options.

**Parameters:**
- `options` (Object): Middleware options

**Options:**
```javascript
{
  cacheType: 'org',           // Cache type
  ttl: 7200000,              // Override TTL
  skipCache: false,          // Skip caching
  keyGenerator: null,        // Custom key generator
  shouldCache: null          // Custom cache condition
}
```

**Returns:**
- `Function`: Express middleware function

**Example:**
```javascript
const cacheMiddleware = createCacheMiddleware({
  cacheType: 'org',
  shouldCache: (req) => req.method === 'GET'
});

app.use('/api/orgs', cacheMiddleware);
```

### `orgCacheMiddleware()`
Pre-configured middleware for organization queries.

**Returns:**
- `Function`: Express middleware function

**Example:**
```javascript
router.get('/orgs', orgCacheMiddleware(), async (req, res) => {
  // Route handler
});
```

### `profileCacheMiddleware()`
Pre-configured middleware for profile queries.

**Returns:**
- `Function`: Express middleware function

**Example:**
```javascript
router.get('/get-profile', profileCacheMiddleware(), async (req, res) => {
  // Route handler
});
```

### `userCacheMiddleware()`
Pre-configured middleware for user queries.

**Returns:**
- `Function`: Express middleware function

**Example:**
```javascript
router.get('/users', userCacheMiddleware(), async (req, res) => {
  // Route handler
});
```

### `cacheInvalidationMiddleware()`
Middleware that clears cache when data is modified.

**Returns:**
- `Function`: Express middleware function

**Example:**
```javascript
router.post('/update-profile', cacheInvalidationMiddleware(), async (req, res) => {
  // Route handler that modifies data
});
```

## Cache Configuration API

### `getCacheConfig(type)`
Gets cache configuration for a specific type.

**Parameters:**
- `type` (string): Cache type ('org', 'profile', 'dao')

**Returns:**
- `Object`: Configuration object

**Example:**
```javascript
const config = getCacheConfig('org');
console.log(`TTL: ${config.ttl}ms`);
console.log(`Enabled: ${config.enabled}`);
```

**Response Format:**
```javascript
{
  ttl: 7200000,
  enabled: true,
  maxSize: 10000,
  cleanupInterval: 60000,
  keyPrefix: 'dao_cache',
  evictionStrategy: 'lru'
}
```

### `isCachingEnabled()`
Checks if caching is enabled globally.

**Returns:**
- `boolean`: True if caching is enabled

**Example:**
```javascript
if (isCachingEnabled()) {
  console.log('Caching is enabled');
}
```

### `isCachingEnabledForType(type)`
Checks if caching is enabled for a specific type.

**Parameters:**
- `type` (string): Cache type

**Returns:**
- `boolean`: True if caching is enabled for the type

**Example:**
```javascript
if (isCachingEnabledForType('org')) {
  console.log('Org caching is enabled');
}
```

### `getAllCacheConfig()`
Gets all cache configuration.

**Returns:**
- `Object`: Complete configuration object

**Example:**
```javascript
const config = getAllCacheConfig();
console.log('Cache configuration:', config);
```

## Cache Metrics Service API

### `cacheMetricsService.start()`
Starts the cache metrics collection service.

**Returns:**
- `void`

**Example:**
```javascript
cacheMetricsService.start();
```

### `cacheMetricsService.stop()`
Stops the cache metrics collection service.

**Returns:**
- `void`

**Example:**
```javascript
cacheMetricsService.stop();
```

### `cacheMetricsService.updateMetrics()`
Manually updates cache metrics in Prometheus.

**Returns:**
- `void`

**Example:**
```javascript
cacheMetricsService.updateMetrics();
```

### `cacheMetricsService.getMetrics()`
Gets current cache metrics.

**Returns:**
- `Object`: Cache metrics

**Example:**
```javascript
const metrics = cacheMetricsService.getMetrics();
console.log('Cache metrics:', metrics);
```

## Prometheus Metrics API

### Cache Hit Counter
```javascript
trackCacheHit(cacheType, orgId, endpoint)
```

**Parameters:**
- `cacheType` (string): Cache type
- `orgId` (string): Organization ID
- `endpoint` (string): Endpoint path

**Example:**
```javascript
trackCacheHit('org', 'org_abc', '/auth/orgs');
```

### Cache Miss Counter
```javascript
trackCacheMiss(cacheType, orgId, endpoint)
```

**Parameters:**
- `cacheType` (string): Cache type
- `orgId` (string): Organization ID
- `endpoint` (string): Endpoint path

**Example:**
```javascript
trackCacheMiss('org', 'org_abc', '/auth/orgs');
```

### Cache Size Gauge
```javascript
updateCacheSize(cacheType, size)
```

**Parameters:**
- `cacheType` (string): Cache type
- `size` (number): Current cache size

**Example:**
```javascript
updateCacheSize('org', 1250);
```

### Cache Hit Rate Gauge
```javascript
updateCacheHitRate(cacheType, hitRate)
```

**Parameters:**
- `cacheType` (string): Cache type
- `hitRate` (number): Hit rate percentage

**Example:**
```javascript
updateCacheHitRate('org', 89.5);
```

## HTTP Endpoints

### `GET /cache-stats`
Returns current cache statistics.

**Response:**
```json
{
  "hits": 1250,
  "misses": 150,
  "sets": 1400,
  "deletes": 25,
  "totalRequests": 1400,
  "hitRate": "89.29%",
  "size": 850,
  "maxSize": 10000
}
```

**Example:**
```bash
curl http://localhost:8080/cache-stats
```

### `GET /metrics`
Returns Prometheus metrics including cache metrics.

**Response:**
```
# HELP dao_app_cache_hits_total Total cache hits by cache type and org ID
# TYPE dao_app_cache_hits_total counter
dao_app_cache_hits_total{cache_type="org",org_id="org_abc",endpoint="/auth/orgs"} 1250

# HELP dao_app_cache_misses_total Total cache misses by cache type and org ID
# TYPE dao_app_cache_misses_total counter
dao_app_cache_misses_total{cache_type="org",org_id="org_abc",endpoint="/auth/orgs"} 150

# HELP dao_app_cache_size Current cache size by cache type
# TYPE dao_app_cache_size gauge
dao_app_cache_size{cache_type="org"} 850

# HELP dao_app_cache_hit_rate Cache hit rate percentage by cache type
# TYPE dao_app_cache_hit_rate gauge
dao_app_cache_hit_rate{cache_type="org"} 89.29
```

**Example:**
```bash
curl http://localhost:8080/metrics | grep cache
```

## Environment Variables

### Cache TTL Settings
```bash
CACHE_ORG_TTL=7200000      # 2 hours
CACHE_PROFILE_TTL=3600000  # 1 hour
CACHE_DAO_TTL=1800000      # 30 minutes
```

### Cache Size and Performance
```bash
CACHE_MAX_SIZE=10000       # Maximum cache entries
CACHE_CLEANUP_INTERVAL=60000  # Cleanup interval (1 minute)
CACHE_METRICS_UPDATE_INTERVAL=30000  # Metrics update interval (30 seconds)
```

### Cache Control
```bash
DISABLE_CACHE=false        # Global cache disable
CACHE_ORG_ENABLED=true     # Enable org caching
CACHE_PROFILE_ENABLED=true # Enable profile caching
CACHE_DAO_ENABLED=true     # Enable DAO caching
```

### Cache Configuration
```bash
CACHE_KEY_PREFIX=dao_cache # Cache key prefix
CACHE_EVICTION_STRATEGY=lru # Eviction strategy
CACHE_COMPRESSION_ENABLED=false # Enable compression
CACHE_COMPRESSION_THRESHOLD=1024 # Compression threshold
```

### Cache Logging
```bash
CACHE_LOGGING_ENABLED=false # Enable cache logging
CACHE_LOGGING_LEVEL=info    # Log level
```

### Cache Health Check
```bash
CACHE_HEALTH_CHECK_ENABLED=true # Enable health checks
CACHE_HEALTH_CHECK_INTERVAL=60000 # Health check interval
```

## Error Handling

### Cache Service Errors
```javascript
try {
  const cachedData = cacheService.get(key);
  if (cachedData) {
    return res.json(cachedData);
  }
} catch (error) {
  console.error('Cache error:', error);
  // Continue without cache
}
```

### Middleware Error Handling
```javascript
const cacheMiddleware = createCacheMiddleware({
  cacheType: 'org',
  onError: (error, req, res, next) => {
    console.error('Cache middleware error:', error);
    // Continue to next middleware
    next();
  }
});
```

### Configuration Validation
```javascript
function validateCacheConfig(config) {
  if (config.ttl < 0) {
    throw new Error('TTL must be positive');
  }
  if (config.maxSize < 1) {
    throw new Error('Max size must be at least 1');
  }
}
```

## Usage Examples

### Basic Caching
```javascript
const express = require('express');
const { createCacheMiddleware } = require('./middlewares/cacheMiddleware');

const app = express();

// Cache GET requests
app.get('/api/data', createCacheMiddleware({
  cacheType: 'dao',
  shouldCache: (req) => req.method === 'GET'
}), (req, res) => {
  // Route handler
});

// Invalidate cache on data changes
app.post('/api/data', cacheInvalidationMiddleware(), (req, res) => {
  // Route handler that modifies data
});
```

### Custom Cache Key Generation
```javascript
const customCacheMiddleware = createCacheMiddleware({
  cacheType: 'org',
  keyGenerator: (req, userId, orgId) => {
    return `custom:${userId}:${orgId}:${req.query.filter}`;
  }
});
```

### Conditional Caching
```javascript
const conditionalCacheMiddleware = createCacheMiddleware({
  cacheType: 'dao',
  shouldCache: (req) => {
    // Only cache if no real-time filters
    return !req.body.realTimeFilter;
  }
});
```

### Cache Statistics Monitoring
```javascript
setInterval(() => {
  const stats = cacheService.getStats();
  if (parseFloat(stats.hitRate) < 70) {
    console.warn('Low cache hit rate:', stats.hitRate);
  }
}, 60000); // Check every minute
```

This API reference provides comprehensive documentation for all cache-related functionality in the system.
