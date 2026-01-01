module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
  ],
  collectCoverageFrom: [
    'routes/**/*.js',
    'middlewares/**/*.js',
    '_utils/**/*.js',
    'models/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  verbose: false,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  forceExit: true, // Force Jest to exit after tests complete
  detectOpenHandles: false, // Detect open handles that prevent Jest from exiting
  testEnvironmentOptions: {
    teardown: {
      timeout: 5000,
    },
  },
};
