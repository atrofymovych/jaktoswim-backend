const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock Clerk
jest.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req, res, next) => {
    req.auth = () => ({ userId: 'test-user-id' });
    next();
  },
  getAuth: () => ({ userId: 'test-user-id' }),
}));

// Mock cluster manager
jest.mock('../cluster_manager', () => ({
  getMongoClusterConfiguration: () => ({
    'test-org': {
      url: 'mongodb://localhost:27017/test',
      models: [
        { model_name: 'UserProfile', schema: require('../models/UserProfile') },
        { model_name: 'UserOrgBinding', schema: require('../models/UserOrgBinding') },
        { model_name: 'OrganisationRolesMapping', schema: require('../models/OrganisationRolesMapping') },
      ],
    },
  }),
}));

// Mock connection
jest.mock('../connection', () => ({
  getOrgConnection: jest.fn(() => ({
    model: jest.fn(() => ({
      findOne: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    })),
  })),
  cleanupConnections: jest.fn(),
}));

describe('Cache Middleware Tests', () => {
  let mongoServer;
  let connection;
  let app;
  let server;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    connection = await mongoose.createConnection(mongoUri);

    // Setup Express app for testing
    app = express();
    app.use(express.json());

    // Mock middleware
    app.use((req, res, next) => {
      req.activeOrgId = 'test-org';
      req.auth = () => ({ userId: 'test-user-id' });
      req.models = {
        UserProfile: connection.model('UserProfile', require('../models/UserProfile').schema),
        UserOrgBinding: connection.model('UserOrgBinding', require('../models/UserOrgBinding').schema),
        OrganisationRolesMapping: connection.model('OrganisationRolesMapping', require('../models/OrganisationRolesMapping').schema),
      };
      next();
    });

    // Mock injectOrgConnection middleware
    app.use((req, res, next) => {
      // Simulate the injectOrgConnection middleware
      next();
    });

    // Load routes with cache middleware
    app.use('/auth', require('../routes/auth'));
    app.use('/profile', require('../routes/profile'));
    app.use('/users', require('../routes/users'));

    // Start server
    server = app.listen(0);
    app = server;
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    if (connection) {
      await connection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(() => {
    // Clear cache before each test
    const cacheService = require('../services/cacheService');
    cacheService.clear();
  });

  describe('Cache Service', () => {
    test('should create cache service instance', () => {
      const cacheService = require('../services/cacheService');
      expect(cacheService).toBeDefined();
      expect(cacheService.getStats).toBeDefined();
    });

    test('should get cache statistics', () => {
      const cacheService = require('../services/cacheService');
      const stats = cacheService.getStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('sets');
      expect(stats).toHaveProperty('deletes');
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
    });

    test('should generate cache keys consistently', () => {
      const cacheService = require('../services/cacheService');
      const key1 = cacheService.generateKey('org', 'user1', 'org1', { test: 'data' });
      const key2 = cacheService.generateKey('org', 'user1', 'org1', { test: 'data' });

      expect(key1).toBe(key2);
    });

    test('should generate different keys for different data', () => {
      const cacheService = require('../services/cacheService');
      const key1 = cacheService.generateKey('org', 'user1', 'org1', { test: 'data1', id: 1 });
      const key2 = cacheService.generateKey('org', 'user1', 'org1', { test: 'data2', id: 2 });

      expect(key1).not.toBe(key2);
    });

    test('should set and get cache entries', () => {
      const cacheService = require('../services/cacheService');
      const key = 'test-key';
      const data = { test: 'data' };

      // Set cache entry
      cacheService.set(key, data, 60000);

      // Get cache entry
      const result = cacheService.get(key);

      expect(result).toEqual(data);
    });

    test('should return null for non-existent cache entries', () => {
      const cacheService = require('../services/cacheService');
      const result = cacheService.get('non-existent-key');

      expect(result).toBeNull();
    });

    test('should clear cache entries', () => {
      const cacheService = require('../services/cacheService');
      const key = 'test-key';
      const data = { test: 'data' };

      // Set cache entry
      cacheService.set(key, data, 60000);
      expect(cacheService.get(key)).toEqual(data);

      // Clear cache
      cacheService.clear();
      expect(cacheService.get(key)).toBeNull();
    });
  });

  describe('Cache Middleware Integration', () => {
    test('should not cache when DISABLE_CACHE is true', () => {
      // This test verifies that caching is disabled in test environment
      const { isCachingEnabled } = require('../config/cacheConfig');

      // In test environment, caching should be disabled
      expect(isCachingEnabled()).toBe(false);
    });

    test('should handle cache middleware creation', () => {
      // This test ensures that cache middleware can be created without errors
      const { createCacheMiddleware } = require('../middlewares/cacheMiddleware');

      const middleware = createCacheMiddleware({
        cacheType: 'org',
        skipCache: true
      });

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('Cache Configuration', () => {
    test('should load cache configuration', () => {
      const { getAllCacheConfig } = require('../config/cacheConfig');
      const config = getAllCacheConfig();

      expect(config).toHaveProperty('ttl');
      expect(config).toHaveProperty('maxSize');
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('disabled');
    });

    test('should check if caching is enabled', () => {
      const { isCachingEnabled } = require('../config/cacheConfig');

      // In test environment, caching should be disabled
      expect(isCachingEnabled()).toBe(false);
    });

    test('should get cache config for specific type', () => {
      const { getCacheConfig } = require('../config/cacheConfig');
      const orgConfig = getCacheConfig('org');

      expect(orgConfig).toHaveProperty('ttl');
      expect(orgConfig).toHaveProperty('enabled');
      expect(orgConfig).toHaveProperty('maxSize');
    });
  });

  describe('Cache Metrics Service', () => {
    test('should create cache metrics service', () => {
      const cacheMetricsService = require('../services/cacheMetricsService');
      expect(cacheMetricsService).toBeDefined();
      expect(cacheMetricsService.start).toBeDefined();
      expect(cacheMetricsService.stop).toBeDefined();
      expect(cacheMetricsService.updateMetrics).toBeDefined();
    });

    test('should get cache metrics', () => {
      const cacheMetricsService = require('../services/cacheMetricsService');
      const metrics = cacheMetricsService.getMetrics();

      expect(metrics).toHaveProperty('hits');
      expect(metrics).toHaveProperty('misses');
      expect(metrics).toHaveProperty('hitRate');
    });
  });
});
