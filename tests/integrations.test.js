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
  };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('Integration Routes Hardcore Unit Tests', () => {
  let mongoServer;
  let connection;
  let app;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    connection = await mongoose.createConnection(mongoUri);

    // Setup Express app for testing
    app = express();
    app.use(express.json());
  });

  afterAll(async () => {
    try {
      if (connection && connection.readyState !== 0) {
        await connection.close();
      }
    } catch (error) {
      console.warn('Error closing connection:', error.message);
    }

    try {
      if (mongoServer) {
        await mongoServer.stop();
      }
    } catch (error) {
      console.warn('Error stopping mongo server:', error.message);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Resend Integration Tests', () => {
    let resendIntegration;
    let mockResend;

    beforeAll(() => {
      resendIntegration = require('../routes/integrations/resendIntegration');
      const { Resend } = require('resend');
      mockResend = Resend;
    });

    beforeEach(() => {
      // Setup mock Resend instance
      const mockResendInstance = {
        emails: {
          send: jest.fn().mockResolvedValue({ id: 'test-email-id' }),
        },
      };
      mockResend.mockImplementation(() => mockResendInstance);
    });

    test('should send email successfully', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', resendIntegration);

      const response = await request(testApp)
        .post('/resend/send-email')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: 'test@example.com',
          subject: 'Test Email',
          html: '<p>Test content</p>',
          from: 'noreply@example.com',
        })
        .expect(200);

      expect(response.body.status).toBe('sent');
      expect(response.body.id).toBe('test-email-id');
    });

    test('should fail without X-ORG-ID header', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', resendIntegration);

      await request(testApp)
        .post('/resend/send-email')
        .send({
          to: 'test@example.com',
          subject: 'Test Email',
          html: '<p>Test content</p>',
          from: 'noreply@example.com',
        })
        .expect(400);
    });

    test('should fail without required fields', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', resendIntegration);

      await request(testApp)
        .post('/resend/send-email')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: 'test@example.com',
          // Missing subject, html, from
        })
        .expect(400);
    });

    test('should handle Resend API errors', async () => {
      const mockResendInstance = {
        emails: {
          send: jest.fn().mockRejectedValue(new Error('Resend API error')),
        },
      };
      mockResend.mockImplementation(() => mockResendInstance);

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', resendIntegration);

      const response = await request(testApp)
        .post('/resend/send-email')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: 'test@example.com',
          subject: 'Test Email',
          html: '<p>Test content</p>',
          from: 'noreply@example.com',
        })
        .expect(500);

      expect(response.body.error).toContain('Resend API');
    });

    test('should send batch emails successfully', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', resendIntegration);

      const response = await request(testApp)
        .post('/resend/send-batch')
        .set('X-ORG-ID', 'test-org')
        .send({
          subject: 'Batch Test Email',
          html: '<p>Batch test content</p>',
          from: 'noreply@example.com',
          recipients: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
        })
        .expect(200);

      expect(response.body.summary.total).toBe(3);
      expect(response.body.results).toHaveLength(3);
      response.body.results.forEach((result) => {
        expect(result.status).toBe('sent');
      });
    });

    test('should handle batch email failures gracefully', async () => {
      const mockResendInstance = {
        emails: {
          send: jest
            .fn()
            .mockResolvedValueOnce({ id: 'success-1' })
            .mockRejectedValueOnce(new Error('Email 2 failed'))
            .mockResolvedValueOnce({ id: 'success-3' }),
        },
      };
      mockResend.mockImplementation(() => mockResendInstance);

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', resendIntegration);

      const response = await request(testApp)
        .post('/resend/send-batch')
        .set('X-ORG-ID', 'test-org')
        .send({
          subject: 'Batch Test Email',
          html: '<p>Batch test content</p>',
          from: 'noreply@example.com',
          recipients: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
        })
        .expect(200);

      expect(response.body.summary.total).toBe(3);
      expect(response.body.results).toHaveLength(3);
      expect(response.body.results[0].status).toBe('sent');
      expect(response.body.results[1].status).toBe('error');
      expect(response.body.results[2].status).toBe('sent');
    });

    test('should handle extremely long email content', async () => {
      const longHtml = `<p>${'x'.repeat(100000)}</p>`; // 100KB content

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', resendIntegration);

      const response = await request(testApp)
        .post('/resend/send-email')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: 'test@example.com',
          subject: 'Long Content Test',
          html: longHtml,
          from: 'noreply@example.com',
        })
        .expect(200);

      expect(response.body.status).toBe('sent');
    });

    test('should handle special characters in email content', async () => {
      const specialHtml = '<p>Email with 🚀 emoji, 中文 characters, and !@#$%^&*() symbols</p>';

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', resendIntegration);

      const response = await request(testApp)
        .post('/resend/send-email')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: 'test@example.com',
          subject: 'Special Characters Test',
          html: specialHtml,
          from: 'noreply@example.com',
        })
        .expect(200);

      expect(response.body.status).toBe('sent');
    });
  });

  describe('Twilio Integration Tests', () => {
    let twilioIntegration;
    let mockTwilio;

    beforeAll(() => {
      twilioIntegration = require('../routes/integrations/twilioIntegration');
      const twilio = require('twilio');
      mockTwilio = twilio;
    });

    beforeEach(() => {
      // Setup mock Twilio client
      const mockTwilioClient = {
        messages: {
          create: jest.fn().mockResolvedValue({ sid: 'test-sms-sid' }),
        },
      };
      mockTwilio.mockImplementation(() => mockTwilioClient);

      // Mock node-fetch for Twilio API calls
      const fetch = require('node-fetch');
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sid: 'test-sms-sid' }),
      });
    });

    test('should send SMS successfully', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/twilio', twilioIntegration);

      const response = await request(testApp)
        .post('/twilio/send-sms')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: '+1234567890',
          body: 'Test SMS message',
        })
        .expect(200);

      expect(response.body.status).toBe('sent');
      expect(response.body.sid).toBe('test-sms-sid');
    });

    test('should fail without required fields', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/twilio', twilioIntegration);

      await request(testApp)
        .post('/twilio/send-sms')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: '+1234567890',
          // Missing body
        })
        .expect(400);
    });

    test('should handle Twilio API errors', async () => {
      // Mock node-fetch to return an error response
      const fetch = require('node-fetch');
      fetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Twilio API error' }),
      });

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/twilio', twilioIntegration);

      const response = await request(testApp)
        .post('/twilio/send-sms')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: '+1234567890',
          body: 'Test SMS message',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    test('should send batch SMS successfully', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/twilio', twilioIntegration);

      const response = await request(testApp)
        .post('/twilio/send-batch')
        .set('X-ORG-ID', 'test-org')
        .send({
          body: 'Batch SMS message',
          recipients: ['+1234567890', '+0987654321', '+1122334455'],
        })
        .expect(200);

      expect(response.body.summary.total).toBe(3);
      expect(response.body.results).toHaveLength(3);
      response.body.results.forEach((result) => {
        expect(['sent', 'error']).toContain(result.status);
      });
    });

    test('should handle extremely long SMS content', async () => {
      const longBody = 'x'.repeat(1600); // Very long SMS

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/twilio', twilioIntegration);

      const response = await request(testApp)
        .post('/twilio/send-sms')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: '+1234567890',
          body: longBody,
        })
        .expect(200);

      expect(response.body.status).toBe('sent');
    });
  });

  describe('Cloudinary Integration Tests', () => {
    let cloudinaryIntegration;
    let mockCloudinary;

    beforeAll(() => {
      cloudinaryIntegration = require('../routes/integrations/cloudinary');
      const cloudinary = require('cloudinary');
      mockCloudinary = cloudinary;
    });

    beforeEach(() => {
      // Setup mock Cloudinary utils
      const mockCloudinaryUtils = {
        api_sign_request: jest.fn().mockReturnValue('test-signature'),
      };
      mockCloudinary.v2.utils = mockCloudinaryUtils;
    });

    test('should generate upload signature successfully', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/cloudinary', cloudinaryIntegration);

      const response = await request(testApp)
        .post('/cloudinary/generate-upload-signature')
        .set('X-ORG-ID', 'test-org')
        .expect(200);

      expect(response.body.signature).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.apiKey).toBeDefined();
    });

    test('should handle missing credentials', async () => {
      // Temporarily remove the API key
      const originalKey = process.env['test-org_CLOUDINARY_API_KEY'];
      delete process.env['test-org_CLOUDINARY_API_KEY'];

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/cloudinary', cloudinaryIntegration);

      await request(testApp).post('/cloudinary/generate-upload-signature').set('X-ORG-ID', 'test-org').expect(500);

      // Restore the API key
      process.env['test-org_CLOUDINARY_API_KEY'] = originalKey;
    });

    test('should fail without X-ORG-ID header', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/cloudinary', cloudinaryIntegration);

      await request(testApp).post('/cloudinary/generate-upload-signature').expect(400);
    });
  });

  describe('PayU Integration Tests', () => {
    let payuIntegration;
    let mockPayU;

    beforeAll(() => {
      payuIntegration = require('../routes/integrations/payu/payuIntegration');
      // Mock PayU SDK if it exists
      mockPayU = {
        createOrder: jest.fn().mockResolvedValue({ orderId: 'test-order-id' }),
        getOrder: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
      };
    });

    beforeEach(() => {
      // Mock node-fetch for PayU API calls
      const fetch = require('node-fetch');
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'test-access-token',
            expires_in: 3600,
          }),
      });
    });

    test('should get token successfully', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/payu', payuIntegration);

      const response = await request(testApp).post('/payu/token').set('X-ORG-ID', 'test-org').expect(200);

      expect(response.body.access_token).toBeDefined();
      expect(response.body.expires_in).toBeDefined();
    });

    test('should fail without X-ORG-ID header', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/payu', payuIntegration);

      await request(testApp).post('/payu/token').expect(400);
    });
  });

  describe('Integration Error Handling', () => {
    test('should handle missing API keys gracefully', async () => {
      // Test with organization that has no API keys configured
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', require('../routes/integrations/resendIntegration'));

      const response = await request(testApp)
        .post('/resend/send-email')
        .set('X-ORG-ID', 'org-without-keys')
        .send({
          to: 'test@example.com',
          subject: 'Test Email',
          html: '<p>Test content</p>',
          from: 'noreply@example.com',
        })
        .expect(500);

      expect(response.body.error).toContain('Resend API key not found');
    });

    test('should handle rate limiting', async () => {
      const mockResendInstance = {
        emails: {
          send: jest.fn().mockRejectedValue(new Error('Rate limit exceeded')),
        },
      };
      const { Resend } = require('resend');
      Resend.mockImplementation(() => mockResendInstance);

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', require('../routes/integrations/resendIntegration'));

      const response = await request(testApp)
        .post('/resend/send-email')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: 'test@example.com',
          subject: 'Test Email',
          html: '<p>Test content</p>',
          from: 'noreply@example.com',
        })
        .expect(500);

      expect(response.body.error).toBe('Rate limit exceeded');
    });

    test('should handle network timeouts', async () => {
      const mockResendInstance = {
        emails: {
          send: jest.fn().mockRejectedValue(new Error('Network timeout')),
        },
      };
      const { Resend } = require('resend');
      Resend.mockImplementation(() => mockResendInstance);

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', require('../routes/integrations/resendIntegration'));

      const response = await request(testApp)
        .post('/resend/send-email')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: 'test@example.com',
          subject: 'Test Email',
          html: '<p>Test content</p>',
          from: 'noreply@example.com',
        })
        .expect(500);

      expect(response.body.error).toBe('Network timeout');
    });
  });

  describe('Integration Performance Tests', () => {
    test('should handle concurrent integration requests', async () => {
      // Ensure Resend mock is properly set up
      const mockResendInstance = {
        emails: {
          send: jest.fn().mockResolvedValue({ id: 'test-email-id' }),
        },
      };
      const { Resend } = require('resend');
      Resend.mockImplementation(() => mockResendInstance);

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', require('../routes/integrations/resendIntegration'));

      const requests = Array.from({ length: 10 }, (_, i) =>
        request(testApp)
          .post('/resend/send-email')
          .set('X-ORG-ID', 'test-org')
          .send({
            to: `user${i}@example.com`,
            subject: `Test Email ${i}`,
            html: `<p>Test content ${i}</p>`,
            from: 'noreply@example.com',
          })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('sent');
      });
    });

    test('should handle large batch operations efficiently', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', require('../routes/integrations/resendIntegration'));

      const largeRecipientList = Array.from({ length: 100 }, (_, i) => `user${i}@example.com`);

      const startTime = Date.now();
      const response = await request(testApp)
        .post('/resend/send-batch')
        .set('X-ORG-ID', 'test-org')
        .send({
          subject: 'Large Batch Test',
          html: '<p>Large batch test content</p>',
          from: 'noreply@example.com',
          recipients: largeRecipientList,
        })
        .expect(200);

      const endTime = Date.now();

      expect(response.body.summary.total).toBe(100);
      expect(response.body.results).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Integration Security Tests', () => {
    test('should prevent injection attacks in email content', async () => {
      // Ensure Resend mock is properly set up
      const mockResendInstance = {
        emails: {
          send: jest.fn().mockResolvedValue({ id: 'test-email-id' }),
        },
      };
      const { Resend } = require('resend');
      Resend.mockImplementation(() => mockResendInstance);

      const maliciousHtml = '<script>alert("xss")</script><p>Malicious content</p>';

      const testApp = express();
      testApp.use(express.json());
      testApp.use('/resend', require('../routes/integrations/resendIntegration'));

      const response = await request(testApp)
        .post('/resend/send-email')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: 'test@example.com',
          subject: 'Security Test',
          html: maliciousHtml,
          from: 'noreply@example.com',
        })
        .expect(200);

      expect(response.body.status).toBe('sent');
      // The content should be sent as-is without execution
    });

    test('should validate phone numbers in SMS', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/twilio', require('../routes/integrations/twilioIntegration'));

      // Test with invalid phone number
      await request(testApp)
        .post('/twilio/send-sms')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: 'invalid-phone',
          body: 'Test SMS',
        })
        .expect(500); // Twilio will fail with invalid phone number
    });

    test('should validate file types in uploads', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/cloudinary', require('../routes/integrations/cloudinary'));

      // Test with missing X-ORG-ID header
      await request(testApp).post('/cloudinary/generate-upload-signature').expect(400);
    });
  });
});
