# Cache Performance Guide

## Performance Optimization Strategies

This guide explains how to maximize the performance benefits of the caching system for your demo and production environments.

## Cache Hit Rate Optimization

### 1. Understanding Cache Hit Rates

**Cache Hit Rate** = (Cache Hits / Total Requests) × 100%

- **90%+ Hit Rate**: Excellent performance
- **70-90% Hit Rate**: Good performance
- **50-70% Hit Rate**: Acceptable performance
- **<50% Hit Rate**: Needs optimization

### 2. Optimizing for High Hit Rates

#### Request Pattern Analysis
```javascript
// Good: Consistent request patterns
GET /auth/orgs?userId=123&orgId=org_abc
GET /profile/get-profile?userId=123&orgId=org_abc

// Bad: Unique requests (low hit rate)
GET /dao/get-objects?randomFilter=unique_value_123
```

#### Cache Key Consistency
```javascript
// Ensure consistent key generation
const keyData = {
  type: 'org',
  userId: req.auth()?.userId,
  orgId: req.activeOrgId,
  request: {
    method: req.method,
    path: req.path,
    query: req.query, // Include query parameters
    body: req.body    // Include body for POST requests
  }
};
```

### 3. TTL Optimization

#### Current TTL Settings (Optimized for Demo)
```bash
# Maximum performance TTLs
CACHE_ORG_TTL=7200000      # 2 hours - Org data changes infrequently
CACHE_PROFILE_TTL=3600000  # 1 hour - Profile updates are moderate
CACHE_DAO_TTL=1800000      # 30 minutes - DAO data changes more frequently
```

#### TTL Selection Guidelines
- **Static Data**: 2-4 hours (org configurations, permissions)
- **Semi-Static Data**: 1-2 hours (user profiles, settings)
- **Dynamic Data**: 15-30 minutes (DAO objects, real-time data)

## Performance Monitoring

### 1. Key Metrics to Monitor

#### Cache Performance Metrics
```bash
# Cache hit rate by type
dao_app_cache_hit_rate{cache_type="org"} 89.5
dao_app_cache_hit_rate{cache_type="profile"} 92.1
dao_app_cache_hit_rate{cache_type="dao"} 76.3

# Cache size monitoring
dao_app_cache_size{cache_type="org"} 1250
dao_app_cache_size{cache_type="profile"} 890
dao_app_cache_size{cache_type="dao"} 2100
```

#### Response Time Metrics
```bash
# Before caching
dao_app_http_request_duration_seconds{route="/auth/orgs"} 0.250

# After caching (cache hit)
dao_app_http_request_duration_seconds{route="/auth/orgs"} 0.015
```

### 2. Grafana Dashboard Queries

#### Cache Hit Rate Trend
```promql
rate(dao_app_cache_hits_total[5m]) /
(rate(dao_app_cache_hits_total[5m]) + rate(dao_app_cache_misses_total[5m])) * 100
```

#### Cache Size Over Time
```promql
dao_app_cache_size
```

#### Response Time Improvement
```promql
histogram_quantile(0.95, rate(dao_app_http_request_duration_seconds_bucket[5m]))
```

## Demo Performance Optimization

### 1. Pre-Warming Cache

#### Manual Cache Warming
```javascript
// Warm up frequently accessed data before demo
async function warmCache() {
  const commonQueries = [
    { endpoint: '/auth/orgs', userId: 'demo-user', orgId: 'demo-org' },
    { endpoint: '/profile/get-profile', userId: 'demo-user', orgId: 'demo-org' },
    { endpoint: '/users', orgId: 'demo-org' }
  ];

  for (const query of commonQueries) {
    await fetch(`http://localhost:8080${query.endpoint}`, {
      headers: { 'X-ORG-ID': query.orgId }
    });
  }
}
```

#### Automated Cache Warming
```javascript
// Add to application startup
app.on('ready', async () => {
  if (process.env.NODE_ENV === 'production') {
    await warmCache();
  }
});
```

### 2. Demo-Specific Optimizations

#### High-Frequency Endpoints
```javascript
// Prioritize caching for demo endpoints
const demoEndpoints = [
  '/auth/orgs',
  '/auth/active-org',
  '/profile/get-profile',
  '/users',
  '/dao/get-objects-raw'
];

// Use longer TTL for demo data
const demoTTL = {
  org: 4 * 60 * 60 * 1000,    // 4 hours for demo
  profile: 2 * 60 * 60 * 1000, // 2 hours for demo
  dao: 60 * 60 * 1000,         // 1 hour for demo
};
```

#### Cache Size for Demo
```bash
# Increase cache size for demo environment
CACHE_MAX_SIZE=20000  # 20,000 entries for demo
```

## Production Performance Tuning

### 1. Memory Management

#### Cache Size Optimization
```javascript
// Monitor memory usage
const memoryUsage = process.memoryUsage();
const cacheMemoryUsage = cacheService.getStats().size * averageEntrySize;

// Adjust cache size based on available memory
const maxCacheSize = Math.floor(availableMemory * 0.1 / averageEntrySize);
```

#### Memory Monitoring
```bash
# Monitor Node.js memory usage
node --max-old-space-size=4096 app.js

# Monitor cache memory usage
curl http://localhost:8080/cache-stats | jq '.size'
```

### 2. Cache Eviction Strategy

#### LRU (Least Recently Used) - Current
```javascript
// Evict oldest entries when cache is full
function evictOldest() {
  let oldestKey = null;
  let oldestTime = Date.now();

  for (const [key, entry] of cache.entries()) {
    if (entry.createdAt < oldestTime) {
      oldestTime = entry.createdAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    cache.delete(oldestKey);
  }
}
```

#### Alternative Eviction Strategies
```javascript
// LFU (Least Frequently Used)
function evictLeastFrequent() {
  // Track access counts and evict least accessed
}

// TTL-based eviction
function evictByTTL() {
  // Evict entries closest to expiration
}
```

### 3. Cache Compression

#### Enable Compression for Large Objects
```javascript
const zlib = require('zlib');

function compressCacheEntry(data) {
  if (JSON.stringify(data).length > 1024) { // 1KB threshold
    return zlib.gzipSync(JSON.stringify(data));
  }
  return data;
}

function decompressCacheEntry(data) {
  if (Buffer.isBuffer(data)) {
    return JSON.parse(zlib.gunzipSync(data));
  }
  return data;
}
```

## Performance Testing

### 1. Load Testing Cache Performance

#### Cache Hit Rate Test
```javascript
// Test cache hit rate under load
async function testCacheHitRate() {
  const requests = 1000;
  let hits = 0;
  let misses = 0;

  for (let i = 0; i < requests; i++) {
    const start = Date.now();
    const response = await fetch('/auth/orgs');
    const duration = Date.now() - start;

    if (duration < 50) { // Cache hit threshold
      hits++;
    } else {
      misses++;
    }
  }

  const hitRate = (hits / requests) * 100;
  console.log(`Cache hit rate: ${hitRate.toFixed(2)}%`);
}
```

#### Response Time Comparison
```javascript
// Compare response times with and without cache
async function benchmarkCache() {
  // Clear cache
  cacheService.clear();

  // Test without cache
  const start1 = Date.now();
  await fetch('/auth/orgs');
  const withoutCache = Date.now() - start1;

  // Test with cache
  const start2 = Date.now();
  await fetch('/auth/orgs');
  const withCache = Date.now() - start2;

  console.log(`Without cache: ${withoutCache}ms`);
  console.log(`With cache: ${withCache}ms`);
  console.log(`Improvement: ${(withoutCache / withCache).toFixed(2)}x faster`);
}
```

### 2. Cache Stress Testing

#### Memory Stress Test
```javascript
// Test cache behavior under memory pressure
async function stressTestCache() {
  const largeObject = { data: 'x'.repeat(10000) }; // 10KB object

  // Fill cache with large objects
  for (let i = 0; i < 1000; i++) {
    cacheService.set(`test-${i}`, largeObject, 60000);
  }

  // Monitor memory usage
  const memoryUsage = process.memoryUsage();
  console.log('Memory usage:', memoryUsage);

  // Test eviction behavior
  const stats = cacheService.getStats();
  console.log('Cache stats:', stats);
}
```

## Troubleshooting Performance Issues

### 1. Low Cache Hit Rate

#### Common Causes
- Inconsistent cache keys
- Too short TTL values
- Frequent cache invalidation
- Unique request patterns

#### Solutions
```javascript
// Debug cache key generation
function debugCacheKey(req) {
  const key = cacheService.generateKey('org', req.auth()?.userId, req.activeOrgId, req.body);
  console.log('Cache key:', key);
  console.log('Request data:', req.body);
}

// Monitor cache invalidation
function monitorInvalidation() {
  const originalClear = cacheService.clearByPattern;
  cacheService.clearByPattern = function(pattern) {
    console.log('Cache invalidation:', pattern);
    return originalClear.call(this, pattern);
  };
}
```

### 2. High Memory Usage

#### Memory Leak Detection
```javascript
// Monitor cache growth
setInterval(() => {
  const stats = cacheService.getStats();
  if (stats.size > stats.maxSize * 0.9) {
    console.warn('Cache approaching size limit:', stats);
  }
}, 60000);
```

#### Memory Optimization
```javascript
// Implement cache size monitoring
function optimizeCacheSize() {
  const stats = cacheService.getStats();
  const memoryUsage = process.memoryUsage();

  if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
    // Reduce cache size
    cacheService.maxSize = Math.floor(cacheService.maxSize * 0.8);
    console.log('Reduced cache size to:', cacheService.maxSize);
  }
}
```

### 3. Slow Cache Operations

#### Performance Profiling
```javascript
// Profile cache operations
function profileCacheOperations() {
  const originalGet = cacheService.get;
  cacheService.get = function(key) {
    const start = Date.now();
    const result = originalGet.call(this, key);
    const duration = Date.now() - start;

    if (duration > 10) { // 10ms threshold
      console.warn(`Slow cache get: ${duration}ms for key: ${key}`);
    }

    return result;
  };
}
```

## Best Practices Summary

### 1. Cache Design
- Use consistent cache keys
- Implement proper TTL values
- Monitor cache hit rates
- Plan for cache invalidation

### 2. Performance Monitoring
- Track cache metrics in Prometheus
- Set up Grafana dashboards
- Monitor memory usage
- Alert on performance degradation

### 3. Production Deployment
- Warm up cache on startup
- Monitor cache performance
- Adjust TTL based on usage patterns
- Implement cache compression for large objects

### 4. Demo Optimization
- Use longer TTL values
- Increase cache size
- Pre-warm frequently accessed data
- Monitor performance during demo

## Expected Performance Results

### Demo Environment
- **Cache Hit Rate**: 85-95%
- **Response Time Improvement**: 5-10x faster
- **Database Load Reduction**: 80-90%
- **Memory Usage**: <100MB for cache

### Production Environment
- **Cache Hit Rate**: 70-85%
- **Response Time Improvement**: 3-5x faster
- **Database Load Reduction**: 60-80%
- **Memory Usage**: <200MB for cache

This performance guide will help you maximize the benefits of the caching system for both demo and production environments.
