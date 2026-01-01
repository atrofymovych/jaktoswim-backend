![DAO Framework Logo](../DAOLogo.png)

# DAO Application Documentation

## Overview

The DAO (Data Access Object) application is a comprehensive CRM-as-a-Service platform built with Node.js, Express, MongoDB, and modern caching technologies. This documentation provides comprehensive guides for understanding, implementing, and optimizing the application.

## 📚 Documentation Index

### Core System Documentation

1. **[Caching System](./caching-system.md)** - Complete guide to the caching architecture
   - How caching works
   - Cache types and TTL settings
   - Invalidation strategies
   - Performance optimizations

2. **[Cache Performance Guide](./cache-performance-guide.md)** - Performance optimization strategies
   - Cache hit rate optimization
   - Performance monitoring
   - Demo and production tuning
   - Load testing and benchmarking

3. **[Cache API Reference](./cache-api-reference.md)** - Complete API documentation
   - Cache service methods
   - Middleware configuration
   - Prometheus metrics
   - Environment variables

4. **[Cache Troubleshooting](./cache-troubleshooting.md)** - Issue diagnosis and resolution
   - Common performance issues
   - Data consistency problems
   - Configuration issues
   - Debug commands and monitoring

5. **[Cache Configuration](./cache-configuration.md)** - Configuration options and examples
   - Environment variables
   - TTL settings
   - Cache endpoints
   - Monitoring setup

## 🚀 Quick Start

### Cache System Overview

The application implements a sophisticated in-memory caching system with the following features:

- **Smart Caching**: Automatic caching of org, profile, and DAO queries
- **Intelligent Invalidation**: Cache cleared when data changes
- **Performance Monitoring**: Prometheus metrics and Grafana dashboards
- **Configurable TTL**: Optimized cache expiration times

### Key Performance Features

- **2-hour TTL** for org queries (with instant invalidation)
- **1-hour TTL** for profile queries (with instant invalidation)
- **30-minute TTL** for DAO queries (with instant invalidation)
- **10,000 entry cache** with LRU eviction
- **Parallel query processing** for optimal performance

### Cached Endpoints

| Endpoint | Cache Type | TTL | Invalidation |
|----------|------------|-----|--------------|
| `GET /auth/orgs` | org | 2 hours | `POST /auth/bind-org` |
| `GET /auth/active-org` | org | 2 hours | `POST /auth/bind-org` |
| `GET /profile/get-profile` | profile | 1 hour | `POST /profile/upsert-profile` |
| `GET /users` | org | 2 hours | User modifications |
| `POST /dao/get-objects-raw` | dao | 30 minutes | `POST /dao/add-object` |
| `POST /dao/get-objects-parsed` | dao | 30 minutes | `POST /dao/update-object` |

## 📊 Performance Metrics

### Expected Performance Improvements

- **User listing**: 3x faster response times
- **DAO queries**: 10x faster with cache hits, 5-10x faster without cache
- **Profile operations**: 4x faster
- **Overall system**: Significantly reduced database load and latency

### Cache Hit Rate Targets

- **Org queries**: 85-95% hit rate
- **Profile queries**: 80-90% hit rate
- **DAO queries**: 70-85% hit rate

## 🔧 Configuration

### Environment Variables

```bash
# Cache TTL Settings (milliseconds)
CACHE_ORG_TTL=7200000      # 2 hours
CACHE_PROFILE_TTL=3600000  # 1 hour
CACHE_DAO_TTL=1800000      # 30 minutes

# Cache Size and Performance
CACHE_MAX_SIZE=10000       # Maximum cache entries
CACHE_CLEANUP_INTERVAL=60000  # Cleanup interval (1 minute)

# Cache Control
DISABLE_CACHE=false        # Global cache disable
CACHE_ORG_ENABLED=true     # Enable org caching
CACHE_PROFILE_ENABLED=true # Enable profile caching
CACHE_DAO_ENABLED=true     # Enable DAO caching
```

### Monitoring Endpoints

- `GET /cache-stats` - Current cache statistics
- `GET /metrics` - Prometheus metrics including cache metrics

## 🎯 Demo Optimization

For demo environments, the system is optimized for maximum performance:

- **Extended TTL values** for stable demo data
- **Increased cache size** (10,000 entries)
- **Parallel query processing** for faster responses
- **Database-level optimizations** for large datasets

## 🔍 Monitoring

### Prometheus Metrics

- `dao_app_cache_hits_total` - Total cache hits by type and org
- `dao_app_cache_misses_total` - Total cache misses by type and org
- `dao_app_cache_size` - Current cache size by type
- `dao_app_cache_hit_rate` - Cache hit rate percentage by type

### Grafana Dashboards

The cache metrics are automatically available in Prometheus and can be visualized in Grafana for:
- Cache hit rate trends
- Cache size monitoring
- Performance impact analysis
- System health monitoring

## 🛠️ Development

### Testing

The caching system includes comprehensive test coverage:

```bash
# Run cache tests
npm test -- tests/cache.test.js

# Run all tests
npm test
```

### Cache Disabled in Tests

Caching is automatically disabled during tests to ensure consistent test results:

```bash
# Test environment
NODE_ENV=test
DISABLE_CACHE=true
```

## 📈 Performance Optimization

### Database Optimizations

- **Parallel query processing** using `Promise.all`
- **Database-level sorting and pagination** for large datasets
- **Aggregation pipeline optimization** for complex queries
- **Smart caching** with intelligent invalidation

### Cache Optimizations

- **LRU eviction** for memory efficiency
- **Automatic cleanup** of expired entries
- **Pattern-based invalidation** for targeted cache clearing
- **Deep cloning** to prevent data mutations

## 🔒 Data Consistency

### Cache Invalidation

The system ensures data consistency through intelligent cache invalidation:

- **Automatic invalidation** when data changes
- **Pattern-based clearing** for targeted cache management
- **TTL fallback** for data freshness
- **Error handling** to prevent cache failures from breaking requests

### Safety Mechanisms

- **Success-only invalidation** (only clear cache on successful operations)
- **Graceful degradation** (cache errors don't break requests)
- **Test environment isolation** (caching disabled during tests)

## 🚨 Troubleshooting

### Common Issues

1. **Low cache hit rate** - Check TTL values and cache key consistency
2. **High memory usage** - Monitor cache size and implement compression
3. **Stale data** - Verify cache invalidation patterns
4. **Slow cache operations** - Optimize cache key generation and entry sizes

### Debug Commands

```bash
# Check cache statistics
curl http://localhost:8080/cache-stats

# View Prometheus metrics
curl http://localhost:8080/metrics | grep cache

# Disable cache for debugging
export DISABLE_CACHE=true
```

## 📋 Best Practices

### Cache Design
- Use consistent cache keys
- Implement proper TTL values
- Monitor cache hit rates
- Plan for cache invalidation

### Performance Monitoring
- Track cache metrics in Prometheus
- Set up Grafana dashboards
- Monitor memory usage
- Alert on performance degradation

### Production Deployment
- Warm up cache on startup
- Monitor cache performance
- Adjust TTL based on usage patterns
- Implement cache compression for large objects

## 🔮 Future Enhancements

1. **Redis Integration** - Distributed caching for multi-instance deployments
2. **Cache Warming** - Pre-populate frequently accessed data
3. **Advanced Eviction** - More sophisticated cache replacement policies
4. **Cache Compression** - Reduce memory usage for large objects
5. **Cache Analytics** - Detailed performance analysis and insights

## 📞 Support

For issues related to the caching system:

1. Check the [Troubleshooting Guide](./cache-troubleshooting.md)
2. Review the [Performance Guide](./cache-performance-guide.md)
3. Consult the [API Reference](./cache-api-reference.md)
4. Monitor cache metrics via `/cache-stats` and `/metrics` endpoints

## 📄 License

This documentation is part of the DAO application and follows the same licensing terms as the main project.

---

*Last updated: 2024 - Cache System Documentation v1.0*

---

**© 2023-2024 DAO.Framework. All rights reserved.**
