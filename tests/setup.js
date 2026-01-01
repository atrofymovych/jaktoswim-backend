// Global test setup
require('dotenv').config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
// Disable background processes during tests
process.env.COMMAND_POLL_INTERVAL_MS = '0'; // Disable polling
process.env.DISABLE_METRICS = 'true'; // Disable metrics collection
process.env.DISABLE_CACHE = 'true'; // Disable caching during tests

// Increase timeout for all tests
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  // Helper to create test data
  createTestData: (model, data) => model.create(data),

  // Helper to clean up test data
  cleanupTestData: async (models) => {
    for (const model of Object.values(models)) {
      await model.deleteMany({});
    }
  },

  // Helper to generate test IDs
  generateTestId: () => new require('mongoose').Types.ObjectId(),

  // Helper to wait for async operations
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

  // Helper to create mock request
  createMockRequest: (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    auth: () => ({ userId: 'test-user-id' }),
    activeOrgId: 'test-org',
    models: {},
    ...overrides,
  }),

  // Helper to create mock response
  createMockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.end = jest.fn().mockReturnValue(res);
    return res;
  },
};

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
};

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions in tests
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Global cleanup to prevent Jest from hanging
let cleanupHandlers = [];

// Register cleanup handlers
global.registerCleanup = (handler) => {
  cleanupHandlers.push(handler);
};

// Register built-in cleanup handlers
const { cleanupConnections } = require('../connection');
const { cleanupMetrics } = require('../prometheus');

global.registerCleanup(cleanupConnections);
global.registerCleanup(cleanupMetrics);

// Cleanup cache service
global.registerCleanup(() => {
  const cacheService = require('../services/cacheService');
  cacheService.clear();
});

// Cleanup cache metrics service
global.registerCleanup(() => {
  const cacheMetricsService = require('../services/cacheMetricsService');
  cacheMetricsService.stop();
});

// Global teardown - runs after all tests complete
afterAll(async () => {
  // Run all registered cleanup handlers
  for (const handler of cleanupHandlers) {
    try {
      await handler();
    } catch (error) {
      console.error('Cleanup handler failed:', error);
    }
  }

  // Clear the handlers array
  cleanupHandlers = [];

  // Force close any remaining connections
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Stop any remaining timers
  jest.clearAllTimers();
}, 10000); // 10 second timeout for cleanup
