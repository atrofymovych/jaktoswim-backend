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

describe('CRITICAL CONTRACT TESTS - API Breaking Changes Detection', () => {
  let mongoServer;
  let connection;
  let app;
  let DAOObject;
  let DAOAiObject;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    connection = await mongoose.createConnection(mongoUri);

    // Define core schemas
    const daoObjectSchema = new mongoose.Schema(
      {
        type: { type: String, required: true },
        data: { type: mongoose.Schema.Types.Mixed, required: true },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        deleted_at: { type: Date, default: null },
        links: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DAOObject' }],
      },
      { timestamps: true }
    );

    const daoAiObjectSchema = new mongoose.Schema(
      {
        type: { type: String, required: true },
        data: { type: mongoose.Schema.Types.Mixed, required: true },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        deleted_at: { type: Date, default: null },
        links: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DAOAiObject' }],
      },
      { timestamps: true }
    );

    DAOObject = connection.model('DAOObject', daoObjectSchema);
    DAOAiObject = connection.model('DAOAiObject', daoAiObjectSchema);

    // Setup Express app for testing
    app = express();
    app.use(express.json());

    // Mock middleware
    app.use((req, res, next) => {
      req.activeOrgId = 'test-org';
      req.auth = () => ({ userId: 'test-user' });
      req.models = { DAOObject, DAOAiObject };
      next();
    });

    // Load all integrations
    app.use('/resend', require('../routes/integrations/resendIntegration'));
    app.use('/twilio', require('../routes/integrations/twilioIntegration'));
    app.use('/cloudinary', require('../routes/integrations/cloudinary'));
    app.use('/payu', require('../routes/integrations/payu/payuIntegration'));
    app.use('/vertex-ai', require('../routes/integrations/vertexAiIntegration'));
  });

  afterAll(async () => {
    // Don't close connection here - let Jest handle cleanup
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('DAO Object Contract Tests', () => {
    test('CRITICAL: DAO object must have required fields (type, data)', async () => {
      // Test that DAO object creation enforces required fields
      const validObject = new DAOObject({
        type: 'test-type',
        data: { key: 'value' },
      });

      expect(validObject.type).toBe('test-type');
      expect(validObject.data).toEqual({ key: 'value' });
      expect(validObject.metadata).toEqual({});
      expect(validObject.deleted_at).toBeNull();
      expect(validObject.links).toEqual([]);
    });

    test('CRITICAL: DAO object must have timestamps', async () => {
      const object = new DAOObject({
        type: 'test-type',
        data: { key: 'value' },
      });

      expect(object.schema.paths.createdAt).toBeDefined();
      expect(object.schema.paths.updatedAt).toBeDefined();
    });

    test('CRITICAL: DAO object must support soft delete', async () => {
      const object = new DAOObject({
        type: 'test-type',
        data: { key: 'value' },
      });

      expect(object.deleted_at).toBeNull();
      object.deleted_at = new Date();
      expect(object.deleted_at).toBeInstanceOf(Date);
    });

    test('CRITICAL: DAO object must support links to other objects', async () => {
      const object = new DAOObject({
        type: 'test-type',
        data: { key: 'value' },
        links: [new mongoose.Types.ObjectId()],
      });

      expect(object.links).toHaveLength(1);
      expect(mongoose.Types.ObjectId.isValid(object.links[0])).toBe(true);
    });
  });

  describe('Resend Integration Contract Tests', () => {
    beforeEach(() => {
      const mockResendInstance = {
        emails: {
          send: jest.fn().mockResolvedValue({ id: 'test-email-id' }),
        },
      };
      const { Resend } = require('resend');
      Resend.mockImplementation(() => mockResendInstance);
    });

    test('CRITICAL: Resend send-email endpoint must accept required fields', async () => {
      const response = await request(app)
        .post('/resend/send-email')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: 'test@example.com',
          subject: 'Test Email',
          html: '<p>Test content</p>',
          from: 'noreply@example.com',
        })
        .expect(200);

      // Contract: Response must have status and id fields
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('sent');
    });

    test('CRITICAL: Resend send-batch endpoint must return summary structure', async () => {
      const response = await request(app)
        .post('/resend/send-batch')
        .set('X-ORG-ID', 'test-org')
        .send({
          subject: 'Batch Test',
          html: '<p>Test content</p>',
          from: 'noreply@example.com',
          recipients: ['user1@example.com', 'user2@example.com'],
        })
        .expect(200);

      // Contract: Response must have summary and results structure
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('results');
      expect(response.body.summary).toHaveProperty('total');
      expect(response.body.results).toBeInstanceOf(Array);
    });

    test('CRITICAL: Resend must require X-ORG-ID header', async () => {
      await request(app)
        .post('/resend/send-email')
        .send({
          to: 'test@example.com',
          subject: 'Test Email',
          html: '<p>Test content</p>',
          from: 'noreply@example.com',
        })
        .expect(400);
    });
  });

  describe('Twilio Integration Contract Tests', () => {
    beforeEach(() => {
      const fetch = require('node-fetch');
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sid: 'test-sms-sid' }),
      });
    });

    test('CRITICAL: Twilio send-sms endpoint must accept required fields', async () => {
      const response = await request(app)
        .post('/twilio/send-sms')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: '+1234567890',
          body: 'Test SMS message',
        })
        .expect(200);

      // Contract: Response must have status and sid fields
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('sid');
      expect(response.body.status).toBe('sent');
    });

    test('CRITICAL: Twilio send-batch endpoint must return summary structure', async () => {
      const response = await request(app)
        .post('/twilio/send-batch')
        .set('X-ORG-ID', 'test-org')
        .send({
          body: 'Batch SMS message',
          recipients: ['+1234567890', '+0987654321'],
        })
        .expect(200);

      // Contract: Response must have summary and results structure
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('results');
      expect(response.body.summary).toHaveProperty('total');
      expect(response.body.results).toBeInstanceOf(Array);
    });
  });

  describe('Cloudinary Integration Contract Tests', () => {
    beforeEach(() => {
      const mockCloudinaryUtils = {
        api_sign_request: jest.fn().mockReturnValue('test-signature'),
      };
      const cloudinary = require('cloudinary');
      cloudinary.v2.utils = mockCloudinaryUtils;
    });

    test('CRITICAL: Cloudinary generate-upload-signature must return required fields', async () => {
      const response = await request(app)
        .post('/cloudinary/generate-upload-signature')
        .set('X-ORG-ID', 'test-org')
        .expect(200);

      // Contract: Response must have signature, timestamp, and apiKey
      expect(response.body).toHaveProperty('signature');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('apiKey');
      expect(typeof response.body.signature).toBe('string');
      expect(typeof response.body.timestamp).toBe('number');
      expect(typeof response.body.apiKey).toBe('string');
    });
  });

  describe('PayU Integration Contract Tests', () => {
    beforeEach(() => {
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

    test('CRITICAL: PayU token endpoint must return access_token and expires_in', async () => {
      const response = await request(app).post('/payu/token').set('X-ORG-ID', 'test-org').expect(200);

      // Contract: Response must have access_token and expires_in
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('expires_in');
      expect(typeof response.body.access_token).toBe('string');
      expect(typeof response.body.expires_in).toBe('number');
    });
  });

  describe('Vertex AI Integration Contract Tests', () => {
    test('CRITICAL: Vertex AI sessions endpoint must return session_id', async () => {
      const response = await request(app).post('/vertex-ai/sessions').send({ name: 'Test Session' }).expect(201);

      // Contract: Response must have session_id
      expect(response.body).toHaveProperty('session_id');
      expect(typeof response.body.session_id).toBe('string');
    });

    test('CRITICAL: Vertex AI messages endpoint must return message_id', async () => {
      // First create a session
      const sessionResponse = await request(app).post('/vertex-ai/sessions').send({ name: 'Test Session' });

      const sessionId = sessionResponse.body.session_id;

      // Then create a message
      const response = await request(app)
        .post(`/vertex-ai/sessions/${sessionId}/messages`)
        .send({
          role: 'user',
          content: 'Hello, AI!',
        })
        .expect(201);

      // Contract: Response must have message_id
      expect(response.body).toHaveProperty('message_id');
      expect(typeof response.body.message_id).toBe('string');
    });

    test('CRITICAL: Vertex AI ask endpoint must return message_id', async () => {
      // First create a session
      const sessionResponse = await request(app).post('/vertex-ai/sessions').send({ name: 'Test Session' });

      const sessionId = sessionResponse.body.session_id;

      // Then make an AI ask
      const response = await request(app)
        .post(`/vertex-ai/sessions/${sessionId}/ask`)
        .send({
          history: [],
          message: 'What is the capital of France?',
        })
        .expect(202);

      // Contract: Response must have message_id
      expect(response.body).toHaveProperty('message_id');
      expect(typeof response.body.message_id).toBe('string');
    });

    test('CRITICAL: Vertex AI ctx endpoint must return ctx_id', async () => {
      // First create a session
      const sessionResponse = await request(app).post('/vertex-ai/sessions').send({ name: 'Test Session' });

      const sessionId = sessionResponse.body.session_id;

      // Then create a context job
      const response = await request(app)
        .post(`/vertex-ai/sessions/${sessionId}/ctx`)
        .send({
          task: 'Summarize the conversation',
          history: [],
        })
        .expect(202);

      // Contract: Response must have ctx_id
      expect(response.body).toHaveProperty('ctx_id');
      expect(typeof response.body.ctx_id).toBe('string');
    });
  });

  describe('Error Response Contract Tests', () => {
    test('CRITICAL: All endpoints must return consistent error structure', async () => {
      // Test missing X-ORG-ID header (should return 400)
      const response = await request(app)
        .post('/resend/send-email')
        .send({
          to: 'test@example.com',
          subject: 'Test Email',
          html: '<p>Test content</p>',
          from: 'noreply@example.com',
        })
        .expect(400);

      // Contract: Error responses must have error field
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });

    test('CRITICAL: Missing required fields must return 400', async () => {
      const response = await request(app)
        .post('/resend/send-email')
        .set('X-ORG-ID', 'test-org')
        .send({
          to: 'test@example.com',
          // Missing subject, html, from
        })
        .expect(400);

      // Contract: Missing fields must return 400 with error message
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Authentication Contract Tests', () => {
    test('CRITICAL: Endpoints must require X-ORG-ID header', async () => {
      const endpoints = [
        { path: '/resend/send-email', method: 'post' },
        { path: '/twilio/send-sms', method: 'post' },
        { path: '/cloudinary/generate-upload-signature', method: 'post' },
        { path: '/payu/token', method: 'post' },
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path).send({}).expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('X-ORG-ID');
      }
    });
  });

  describe('Data Type Contract Tests', () => {
    test('CRITICAL: All timestamps must be ISO strings or Date objects', async () => {
      const object = new DAOObject({
        type: 'test-type',
        data: { key: 'value' },
      });

      // Save the object to get timestamps
      await object.save();

      // Contract: Timestamps must be Date objects
      expect(object.createdAt).toBeInstanceOf(Date);
      expect(object.updatedAt).toBeInstanceOf(Date);
    });

    test('CRITICAL: ObjectId references must be valid ObjectIds', async () => {
      const object = new DAOObject({
        type: 'test-type',
        data: { key: 'value' },
        links: [new mongoose.Types.ObjectId()],
      });

      // Contract: Links must be valid ObjectIds
      expect(mongoose.Types.ObjectId.isValid(object.links[0])).toBe(true);
    });
  });

  describe('Schema Contract Tests', () => {
    test('CRITICAL: DAO schema must have required fields', () => {
      const { schema } = DAOObject;

      // Contract: Schema must have required fields
      expect(schema.paths.type).toBeDefined();
      expect(schema.paths.data).toBeDefined();
      expect(schema.paths.metadata).toBeDefined();
      expect(schema.paths.deleted_at).toBeDefined();
      expect(schema.paths.links).toBeDefined();
    });

    test('CRITICAL: DAO schema must enforce required constraints', () => {
      const { schema } = DAOObject;

      // Contract: Type and data must be required
      expect(schema.paths.type.isRequired).toBe(true);
      expect(schema.paths.data.isRequired).toBe(true);
    });
  });
});
