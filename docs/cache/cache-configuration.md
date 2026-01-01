# Cache Configuration

This document describes the cache configuration options available for the DAO application.

## Environment Variables

### Global Cache Settings

- `DISABLE_CACHE`: Set to `true` to disable all caching (default: `false`)
- `CACHE_KEY_PREFIX`: Prefix for cache keys (default: `dao_cache`)

### Cache TTL Settings (in milliseconds)

- `CACHE_ORG_TTL`: TTL for org-related queries (default: `7200000` - 2 hours)
- `CACHE_PROFILE_TTL`: TTL for profile-related queries (default: `3600000` - 1 hour)
- `CACHE_DAO_TTL`: TTL for DAO-related queries (default: `1800000` - 30 minutes)

### Cache Size and Performance

- `CACHE_MAX_SIZE`: Maximum number of cache entries (default: `10000`)
- `CACHE_CLEANUP_INTERVAL`: Interval for cleaning expired entries (default: `60000` - 1 minute)
- `CACHE_METRICS_UPDATE_INTERVAL`: Interval for updating Prometheus metrics (default: `30000` - 30 seconds)

### Cache Type Enable/Disable

- `CACHE_ORG_ENABLED`: Enable/disable org caching (default: `true`)
- `CACHE_PROFILE_ENABLED`: Enable/disable profile caching (default: `true`)
- `CACHE_DAO_ENABLED`: Enable/disable DAO caching (default: `true`)

### Cache Strategy

- `CACHE_EVICTION_STRATEGY`: Cache eviction strategy - `lru`, `fifo`, or `ttl` (default: `lru`)

### Cache Compression

- `CACHE_COMPRESSION_ENABLED`: Enable cache compression (default: `false`)
- `CACHE_COMPRESSION_THRESHOLD`: Minimum size for compression (default: `1024` bytes)

### Cache Logging

- `CACHE_LOGGING_ENABLED`: Enable cache logging (default: `false`)
- `CACHE_LOGGING_LEVEL`: Log level - `debug`, `info`, `warn`, `error` (default: `info`)

### Cache Health Check

- `CACHE_HEALTH_CHECK_ENABLED`: Enable cache health checks (default: `true`)
- `CACHE_HEALTH_CHECK_INTERVAL`: Health check interval (default: `60000` - 1 minute)

## Example Configuration

```bash
# Cache Configuration
DISABLE_CACHE=false
CACHE_ORG_TTL=7200000      # 2 hours
CACHE_PROFILE_TTL=3600000  # 1 hour
CACHE_DAO_TTL=1800000      # 30 minutes
CACHE_MAX_SIZE=10000
CACHE_CLEANUP_INTERVAL=60000
CACHE_METRICS_UPDATE_INTERVAL=30000
CACHE_ORG_ENABLED=true
CACHE_PROFILE_ENABLED=true
CACHE_DAO_ENABLED=true
CACHE_KEY_PREFIX=dao_cache
CACHE_EVICTION_STRATEGY=lru
CACHE_COMPRESSION_ENABLED=false
CACHE_COMPRESSION_THRESHOLD=1024
CACHE_LOGGING_ENABLED=false
CACHE_LOGGING_LEVEL=info
CACHE_HEALTH_CHECK_ENABLED=true
CACHE_HEALTH_CHECK_INTERVAL=60000
```

## Cache Endpoints

- `GET /cache-stats`: Returns current cache statistics
- `GET /metrics`: Returns Prometheus metrics including cache metrics

## Cache Metrics

The following Prometheus metrics are available for monitoring cache performance:

- `dao_app_cache_hits_total`: Total cache hits by cache type and org ID
- `dao_app_cache_misses_total`: Total cache misses by cache type and org ID
- `dao_app_cache_size`: Current cache size by cache type
- `dao_app_cache_hit_rate`: Cache hit rate percentage by cache type

## Cached Endpoints

### Org-related endpoints:
- `GET /auth/orgs`: List user organizations
- `GET /auth/active-org`: Get active organization
- `POST /auth/bind-org`: Bind organization (with cache invalidation)

### Profile-related endpoints:
- `GET /profile/get-profile`: Get user profile
- `POST /profile/upsert-profile`: Upsert user profile (with cache invalidation)

### User-related endpoints:
- `GET /users`: List organization users
