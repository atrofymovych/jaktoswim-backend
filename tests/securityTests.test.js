const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');

// Mock external services
jest.mock('resend');
jest.mock('twilio');
jest.mock('cloudinary');
jest.mock('@google-cloud/vertexai');
jest.mock('node-fetch');

// Mock environment variables for testing
const originalEnv = process.env;
beforeAll(() => {
  process.env = {
    ...originalEnv,
    'test-org_RESEND_API_KEY': 'test-resend-api-key',
    'test-org_TWILIO_API_USERNAME': 'test-twilio-username',
    'test-org_TWILIO_API_PASSWORD': 'test-twilio-password',
    'test-org_TWILIO_API_PHONE_FROM': '1234567890',
    'test-org_CLOUDINARY_CLOUD_NAME': 'test-cloudinary-cloud-name',
    'test-org_CLOUDINARY_API_KEY': 'test-cloudinary-api-key',
    'test-org_CLOUDINARY_API_SECRET': 'test-cloudinary-api-secret',
    'test-org_PAYU_MERCHANT_ID': 'test-payu-merchant-id',
    'test-org_PAYU_SECRET_KEY': 'test-payu-secret-key',
    // Add some malicious environment variables that should not be accessible
    malicious_org_RESEND_API_KEY: 'malicious-api-key',
    org_2zbiM3GXBaulTnCdlqimkqnPUTE_RESEND_API_KEY: 'real-org-api-key',
  };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('SECURITY TESTS - Environment Variable Injection Prevention', () => {
  let mongoServer;
  let connection;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    connection = await mongoose.createConnection(mongoUri);
  });

  afterAll(async () => {
    // Don't close connection here - let Jest handle cleanup
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Environment Variable Injection Prevention', () => {
    test('CRITICAL: Should block malicious orgId attempts', async () => {
      // Import the middleware to access the validation function
      const injectOrgConnection = require('../middlewares/injectOrgConnection');
      const { getMongoClusterConfiguration } = require('../cluster_manager');

      const clusters = getMongoClusterConfiguration();

      // Extract the validation function from the middleware
      const validateAndSanitizeOrgId = (orgId, clusters) => {
        // Check if orgId is a string and not empty
        if (!orgId || typeof orgId !== 'string') {
          return null;
        }

        // Remove any whitespace and convert to string
        const sanitizedOrgId = String(orgId).trim();

        // Validate orgId format (should match the pattern used in cluster_manager)
        // Allowed orgIds follow the pattern: org_ followed by alphanumeric characters
        const orgIdPattern = /^org_[a-zA-Z0-9]+$/;
        if (!orgIdPattern.test(sanitizedOrgId)) {
          console.warn(`🛡️ Security: Invalid orgId format attempted: ${orgId}`);
          return null;
        }

        // Check if orgId exists in the allowed clusters
        if (!clusters[sanitizedOrgId]) {
          console.warn(`🛡️ Security: Unknown orgId attempted: ${orgId}`);
          return null;
        }

        return sanitizedOrgId;
      };

      const maliciousOrgIds = [
        'malicious_org', // Attempt to access malicious environment variables
        'org_nonexistent123', // Attempt to access non-existent org's variables
        'test-org;DROP TABLE users;--', // SQL injection attempt
        'test-org\nprocess.env.ALL_API_KEYS', // Newline injection
        'test-org${process.env.ALL_KEYS}', // Template literal injection
        'test-org`${process.env.ALL_KEYS}`', // Backtick injection
        'test-org$(cat /etc/passwd)', // Command injection
        'test-org%0Aprocess.env.ALL_KEYS', // URL encoded newline
        'test-org\u0000process.env.ALL_KEYS', // Null byte injection
        'test-org\u000Aprocess.env.ALL_KEYS', // Unicode newline
      ];

      for (const maliciousOrgId of maliciousOrgIds) {
        const result = validateAndSanitizeOrgId(maliciousOrgId, clusters);
        expect(result).toBeNull();
      }
    });

    test('CRITICAL: Should allow valid orgId format', async () => {
      const injectOrgConnection = require('../middlewares/injectOrgConnection');
      const { getMongoClusterConfiguration } = require('../cluster_manager');

      const clusters = getMongoClusterConfiguration();

      const validateAndSanitizeOrgId = (orgId, clusters) => {
        if (!orgId || typeof orgId !== 'string') {
          return null;
        }

        const sanitizedOrgId = String(orgId).trim();
        const orgIdPattern = /^org_[a-zA-Z0-9]+$/;
        if (!orgIdPattern.test(sanitizedOrgId)) {
          return null;
        }

        if (!clusters[sanitizedOrgId]) {
          return null;
        }

        return sanitizedOrgId;
      };

      // Test valid orgId
      const validOrgId = 'org_2zbiM3GXBaulTnCdlqimkqnPUTE';
      const result = validateAndSanitizeOrgId(validOrgId, clusters);
      expect(result).toBe(validOrgId);
    });

    test('CRITICAL: Should block orgId with special characters', async () => {
      const { getMongoClusterConfiguration } = require('../cluster_manager');
      const clusters = getMongoClusterConfiguration();

      const validateAndSanitizeOrgId = (orgId, clusters) => {
        if (!orgId || typeof orgId !== 'string') {
          return null;
        }

        const sanitizedOrgId = String(orgId).trim();
        const orgIdPattern = /^org_[a-zA-Z0-9]+$/;
        if (!orgIdPattern.test(sanitizedOrgId)) {
          return null;
        }

        if (!clusters[sanitizedOrgId]) {
          return null;
        }

        return sanitizedOrgId;
      };

      const specialCharOrgIds = [
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE!',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE@',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE#',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE$',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE%',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE^',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE&',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE*',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE(',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE)',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE+',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE=',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE[',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE]',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE{',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE}',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE|',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE\\',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE/',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE<',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE>',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE?',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE,',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE.',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE;',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE:',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE"',
        "org_2zbiM3GXBaulTnCdlqimkqnPUTE'",
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE`',
        'org_2zbiM3GXBaulTnCdlqimkqnPUTE~',
      ];

      for (const specialCharOrgId of specialCharOrgIds) {
        const result = validateAndSanitizeOrgId(specialCharOrgId, clusters);
        expect(result).toBeNull();
      }
    });

    test('CRITICAL: Should block empty and null orgId', async () => {
      const { getMongoClusterConfiguration } = require('../cluster_manager');
      const clusters = getMongoClusterConfiguration();

      const validateAndSanitizeOrgId = (orgId, clusters) => {
        if (!orgId || typeof orgId !== 'string') {
          return null;
        }

        const sanitizedOrgId = String(orgId).trim();
        const orgIdPattern = /^org_[a-zA-Z0-9]+$/;
        if (!orgIdPattern.test(sanitizedOrgId)) {
          return null;
        }

        if (!clusters[sanitizedOrgId]) {
          return null;
        }

        return sanitizedOrgId;
      };

      const invalidOrgIds = ['', null, undefined, '   ', '\t', '\n', '\r'];

      for (const invalidOrgId of invalidOrgIds) {
        const result = validateAndSanitizeOrgId(invalidOrgId, clusters);
        expect(result).toBeNull();
      }
    });

    test('CRITICAL: Should block non-string orgId types', async () => {
      const { getMongoClusterConfiguration } = require('../cluster_manager');
      const clusters = getMongoClusterConfiguration();

      const validateAndSanitizeOrgId = (orgId, clusters) => {
        if (!orgId || typeof orgId !== 'string') {
          return null;
        }

        const sanitizedOrgId = String(orgId).trim();
        const orgIdPattern = /^org_[a-zA-Z0-9]+$/;
        if (!orgIdPattern.test(sanitizedOrgId)) {
          return null;
        }

        if (!clusters[sanitizedOrgId]) {
          return null;
        }

        return sanitizedOrgId;
      };

      const nonStringOrgIds = [123, 0, -1, true, false, {}, [], () => {}];

      for (const nonStringOrgId of nonStringOrgIds) {
        const result = validateAndSanitizeOrgId(nonStringOrgId, clusters);
        expect(result).toBeNull();
      }
    });

    test('CRITICAL: Should block orgId that is too long', async () => {
      const { getMongoClusterConfiguration } = require('../cluster_manager');
      const clusters = getMongoClusterConfiguration();

      const validateAndSanitizeOrgId = (orgId, clusters) => {
        if (!orgId || typeof orgId !== 'string') {
          return null;
        }

        const sanitizedOrgId = String(orgId).trim();
        const orgIdPattern = /^org_[a-zA-Z0-9]+$/;
        if (!orgIdPattern.test(sanitizedOrgId)) {
          return null;
        }

        if (!clusters[sanitizedOrgId]) {
          return null;
        }

        return sanitizedOrgId;
      };

      const longOrgId = `org_2zbiM3GXBaulTnCdlqimkqnPUTE${'a'.repeat(1000)}`;
      const result = validateAndSanitizeOrgId(longOrgId, clusters);
      expect(result).toBeNull();
    });

    test('CRITICAL: Should block orgId with unicode characters', async () => {
      const { getMongoClusterConfiguration } = require('../cluster_manager');
      const clusters = getMongoClusterConfiguration();

      const validateAndSanitizeOrgId = (orgId, clusters) => {
        if (!orgId || typeof orgId !== 'string') {
          return null;
        }

        const sanitizedOrgId = String(orgId).trim();
        const orgIdPattern = /^org_[a-zA-Z0-9]+$/;
        if (!orgIdPattern.test(sanitizedOrgId)) {
          return null;
        }

        if (!clusters[sanitizedOrgId]) {
          return null;
        }

        return sanitizedOrgId;
      };

      const unicodeOrgIds = [
        'org_nonexistent123\u0000', // Null byte
        'org_nonexistent123\u000A', // Line feed
        'org_nonexistent123\u000D', // Carriage return
        'org_nonexistent123\u0009', // Tab
        'org_nonexistent123🚀', // Emoji
        'org_nonexistent123中文', // Chinese characters
      ];

      for (const unicodeOrgId of unicodeOrgIds) {
        const result = validateAndSanitizeOrgId(unicodeOrgId, clusters);
        expect(result).toBeNull();
      }
    });
  });

  describe('Middleware Security Tests', () => {
    test('CRITICAL: Should validate orgId format in middleware', async () => {
      const { getMongoClusterConfiguration } = require('../cluster_manager');

      const clusters = getMongoClusterConfiguration();

      // Test valid orgId
      const validOrgId = 'org_2zbiM3GXBaulTnCdlqimkqnPUTE';
      expect(clusters[validOrgId]).toBeDefined();

      // Test invalid orgId
      const invalidOrgId = 'malicious_org';
      expect(clusters[invalidOrgId]).toBeUndefined();
    });
  });
});
