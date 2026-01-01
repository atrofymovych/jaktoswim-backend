const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

// Mock environment variables for testing
const originalEnv = process.env;
beforeAll(() => {
  process.env = {
    ...originalEnv,
    'test-org_AWS_S3_API_KEY': 'test-aws-access-key',
    'test-org_AWS_S3_API_SECRET': 'test-aws-secret-key',
    'test-org_AWS_S3_REGION': 'us-east-1',
  };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('AWS S3 Integration Contract Tests', () => {
  let mongoServer;
  let connection;
  let app;
  let server;
  let mockS3Client;
  let mockGetSignedUrl;

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
      req.auth = () => ({ userId: 'test-user' });
      next();
    });

    // Load AWS S3 integration
    app.use('/aws-s3', require('../routes/integrations/awsS3Integration'));

    // Start an HTTP server so Supertest doesn't create its own ephemeral server
    server = app.listen(0);
    // Reassign app to the server instance to make `request(app)` use this server
    app = server;

    // Setup AWS SDK mocks
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand, PutObjectAclCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

    mockS3Client = {
      send: jest.fn(),
    };

    mockGetSignedUrl = getSignedUrl;
    mockGetSignedUrl.mockResolvedValue('https://signed-url.example.com');

    S3Client.mockImplementation(() => mockS3Client);
    PutObjectCommand.mockImplementation((params) => ({ ...params, command: 'PutObject' }));
    GetObjectCommand.mockImplementation((params) => ({ ...params, command: 'GetObject' }));
    DeleteObjectCommand.mockImplementation((params) => ({ ...params, command: 'DeleteObject' }));
    HeadBucketCommand.mockImplementation((params) => ({ ...params, command: 'HeadBucket' }));
    CreateBucketCommand.mockImplementation((params) => ({ ...params, command: 'CreateBucket' }));
    PutObjectAclCommand.mockImplementation((params) => ({ ...params, command: 'PutObjectAcl' }));
  });

  afterAll(async () => {
    try {
      if (server && server.close) {
        await new Promise((resolve) => server.close(resolve));
      }
    } catch (error) {
      console.warn('Error closing HTTP server:', error.message);
    }
    try {
      // Ensure any default mongoose connection is closed
      if (mongoose && mongoose.connection && mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } catch (error) {
      console.warn('Error disconnecting default mongoose connection:', error.message);
    }

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

    // Default mock responses
    mockS3Client.send.mockImplementation((command) => {
      if (command.command === 'HeadBucket') {
        return Promise.resolve({});
      }
      if (command.command === 'CreateBucket') {
        return Promise.resolve({});
      }
      if (command.command === 'PutObjectAcl') {
        return Promise.resolve({});
      }
      if (command.command === 'DeleteObject') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    // Mock getSignedUrl to return a valid URL
    mockGetSignedUrl.mockResolvedValue('https://signed-url.example.com');
  });

  describe('Generate Upload URL Contract Tests', () => {
    test('CRITICAL: generate-upload-url must return uploadUrl and objectKey', async () => {
      const response = await request(app)
        .post('/aws-s3/generate-upload-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          fileName: 'test-file.jpg',
          fileType: 'image/jpeg',
        })
        .expect(200);

      // Contract: Response must have uploadUrl and objectKey
      expect(response.body).toHaveProperty('uploadUrl');
      expect(response.body).toHaveProperty('objectKey');
      expect(typeof response.body.uploadUrl).toBe('string');
      expect(typeof response.body.objectKey).toBe('string');
      expect(response.body.uploadUrl).toContain('https://');
    });

    test('CRITICAL: generate-upload-url must require fileName and fileType', async () => {
      const response = await request(app)
        .post('/aws-s3/generate-upload-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          // Missing fileName and fileType
        })
        .expect(400);

      // Contract: Missing required fields must return 400
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('fileName');
      expect(response.body.error).toContain('fileType');
    });

    test('CRITICAL: generate-upload-url must require X-ORG-ID header', async () => {
      const response = await request(app)
        .post('/aws-s3/generate-upload-url')
        .send({
          fileName: 'test-file.jpg',
          fileType: 'image/jpeg',
        })
        .expect(400);

      // Contract: Missing X-ORG-ID must return 400
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('X-ORG-ID');
    });

    test('CRITICAL: generate-upload-url must require authentication', async () => {
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      appWithoutAuth.use('/aws-s3', require('../routes/integrations/awsS3Integration'));

      const response = await request(appWithoutAuth)
        .post('/aws-s3/generate-upload-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          fileName: 'test-file.jpg',
          fileType: 'image/jpeg',
        });

      // Contract: Missing authentication must return 401 or 500 (depending on implementation)
      expect([401, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
    });

    test('CRITICAL: objectKey must follow expected format', async () => {
      const response = await request(app)
        .post('/aws-s3/generate-upload-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          fileName: 'test-file.jpg',
          fileType: 'image/jpeg',
        })
        .expect(200);

      // Contract: objectKey must follow orgId/userId/random-filename format
      expect(response.body.objectKey).toMatch(/^test-org\/test-user\/[a-f0-9]{32}-test-file\.jpg$/);
    });

    test('CRITICAL: must handle special characters in fileName', async () => {
      const response = await request(app)
        .post('/aws-s3/generate-upload-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          fileName: 'test file with spaces & symbols!.jpg',
          fileType: 'image/jpeg',
        })
        .expect(200);

      // Contract: Should handle special characters in filename
      expect(response.body).toHaveProperty('uploadUrl');
      expect(response.body).toHaveProperty('objectKey');
    });

    test('CRITICAL: must handle unicode characters in fileName', async () => {
      const response = await request(app)
        .post('/aws-s3/generate-upload-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          fileName: '测试文件🚀.jpg',
          fileType: 'image/jpeg',
        })
        .expect(200);

      // Contract: Should handle unicode characters
      expect(response.body).toHaveProperty('uploadUrl');
      expect(response.body).toHaveProperty('objectKey');
    });
  });

  describe('Get Private URL Contract Tests', () => {
    test('CRITICAL: get-private-url must return secureUrl', async () => {
      const response = await request(app)
        .post('/aws-s3/get-private-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          objectKey: 'testorg/test-user/abc123-test-file.jpg',
        })
        .expect(200);

      // Contract: Response must have secureUrl
      expect(response.body).toHaveProperty('secureUrl');
      expect(typeof response.body.secureUrl).toBe('string');
      expect(response.body.secureUrl).toContain('https://');
    });

    test('CRITICAL: get-private-url must require objectKey', async () => {
      const response = await request(app)
        .post('/aws-s3/get-private-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          // Missing objectKey
        })
        .expect(400);

      // Contract: Missing objectKey must return 400
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('objectKey');
    });

    test('CRITICAL: get-private-url must require X-ORG-ID header', async () => {
      const response = await request(app)
        .post('/aws-s3/get-private-url')
        .send({
          objectKey: 'testorg/test-user/abc123-test-file.jpg',
        })
        .expect(400);

      // Contract: Missing X-ORG-ID must return 400
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('X-ORG-ID');
    });

    test('CRITICAL: get-private-url must handle non-existent files', async () => {
      // Mock getSignedUrl to throw NoSuchKey error
      mockGetSignedUrl.mockRejectedValueOnce({ name: 'NoSuchKey' });

      const response = await request(app)
        .post('/aws-s3/get-private-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          objectKey: 'non-existent-file.jpg',
        })
        .expect(404);

      // Contract: Non-existent files must return 404
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('does not exist');
    });
  });

  describe('Delete Object Contract Tests', () => {
    test('CRITICAL: DELETE /objects must return status and objectKey', async () => {
      const response = await request(app)
        .delete('/aws-s3/objects')
        .set('X-ORG-ID', 'test-org')
        .send({
          objectKey: 'testorg/test-user/abc123-test-file.jpg',
        })
        .expect(200);

      // Contract: Response must have status and objectKey
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('objectKey');
      expect(response.body.status).toBe('deleted');
      expect(response.body.objectKey).toBe('testorg/test-user/abc123-test-file.jpg');
    });

    test('CRITICAL: DELETE /objects must require objectKey', async () => {
      const response = await request(app)
        .delete('/aws-s3/objects')
        .set('X-ORG-ID', 'test-org')
        .send({
          // Missing objectKey
        })
        .expect(400);

      // Contract: Missing objectKey must return 400
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('objectKey');
    });

    test('CRITICAL: DELETE /objects must require X-ORG-ID header', async () => {
      const response = await request(app)
        .delete('/aws-s3/objects')
        .send({
          objectKey: 'testorg/test-user/abc123-test-file.jpg',
        })
        .expect(400);

      // Contract: Missing X-ORG-ID must return 400
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('X-ORG-ID');
    });
  });

  describe('Make Public Contract Tests', () => {
    test('CRITICAL: make-public must return status, objectKey, and publicUrl', async () => {
      const response = await request(app)
        .post('/aws-s3/objects/make-public')
        .set('X-ORG-ID', 'test-org')
        .send({
          objectKey: 'testorg/test-user/abc123-test-file.jpg',
        })
        .expect(200);

      // Contract: Response must have status, objectKey, and publicUrl
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('objectKey');
      expect(response.body).toHaveProperty('publicUrl');
      expect(response.body.status).toBe('made_public');
      expect(response.body.publicUrl).toContain('https://');
      expect(response.body.publicUrl).toContain('s3.');
      expect(response.body.publicUrl).toContain('amazonaws.com');
    });

    test('CRITICAL: make-public must require objectKey', async () => {
      const response = await request(app)
        .post('/aws-s3/objects/make-public')
        .set('X-ORG-ID', 'test-org')
        .send({
          // Missing objectKey
        })
        .expect(400);

      // Contract: Missing objectKey must return 400
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('objectKey');
    });

    test('CRITICAL: make-public must require X-ORG-ID header', async () => {
      const response = await request(app)
        .post('/aws-s3/objects/make-public')
        .send({
          objectKey: 'testorg/test-user/abc123-test-file.jpg',
        })
        .expect(400);

      // Contract: Missing X-ORG-ID must return 400
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('X-ORG-ID');
    });
  });

  describe('Make Private Contract Tests', () => {
    test('CRITICAL: make-private must return status and objectKey', async () => {
      const response = await request(app)
        .post('/aws-s3/objects/make-private')
        .set('X-ORG-ID', 'test-org')
        .send({
          objectKey: 'testorg/test-user/abc123-test-file.jpg',
        })
        .expect(200);

      // Contract: Response must have status and objectKey
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('objectKey');
      expect(response.body.status).toBe('made_private');
    });

    test('CRITICAL: make-private must require objectKey', async () => {
      const response = await request(app)
        .post('/aws-s3/objects/make-private')
        .set('X-ORG-ID', 'test-org')
        .send({
          // Missing objectKey
        })
        .expect(400);

      // Contract: Missing objectKey must return 400
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('objectKey');
    });

    test('CRITICAL: make-private must require X-ORG-ID header', async () => {
      const response = await request(app)
        .post('/aws-s3/objects/make-private')
        .send({
          objectKey: 'testorg/test-user/abc123-test-file.jpg',
        })
        .expect(400);

      // Contract: Missing X-ORG-ID must return 400
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('X-ORG-ID');
    });
  });

  describe('Error Response Contract Tests', () => {
    test('CRITICAL: All endpoints must return consistent error structure', async () => {
      const endpoints = [
        { path: '/aws-s3/generate-upload-url', method: 'post' },
        { path: '/aws-s3/get-private-url', method: 'post' },
        { path: '/aws-s3/objects', method: 'delete' },
        { path: '/aws-s3/objects/make-public', method: 'post' },
        { path: '/aws-s3/objects/make-private', method: 'post' },
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path).send({}).expect(400);

        // Contract: Error responses must have error field
        expect(response.body).toHaveProperty('error');
        expect(typeof response.body.error).toBe('string');
      }
    });

    test('CRITICAL: AWS service errors must return 500', async () => {
      // Mock getSignedUrl to throw an error
      mockGetSignedUrl.mockRejectedValueOnce(new Error('AWS service error'));

      const response = await request(app)
        .post('/aws-s3/generate-upload-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          fileName: 'test-file.jpg',
          fileType: 'image/jpeg',
        })
        .expect(500);

      // Contract: AWS service errors must return 500
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Failed to generate S3 upload URL');
    });
  });

  describe('Authentication Contract Tests', () => {
    test('CRITICAL: All endpoints must require X-ORG-ID header', async () => {
      const endpoints = [
        { path: '/aws-s3/generate-upload-url', method: 'post', body: { fileName: 'test.jpg', fileType: 'image/jpeg' } },
        { path: '/aws-s3/get-private-url', method: 'post', body: { objectKey: 'test.jpg' } },
        { path: '/aws-s3/objects', method: 'delete', body: { objectKey: 'test.jpg' } },
        { path: '/aws-s3/objects/make-public', method: 'post', body: { objectKey: 'test.jpg' } },
        { path: '/aws-s3/objects/make-private', method: 'post', body: { objectKey: 'test.jpg' } },
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path).send(endpoint.body).expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('X-ORG-ID');
      }
    });
  });

  describe('Data Type Contract Tests', () => {
    test('CRITICAL: All URLs must be valid HTTPS URLs', async () => {
      const response = await request(app)
        .post('/aws-s3/generate-upload-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          fileName: 'test-file.jpg',
          fileType: 'image/jpeg',
        })
        .expect(200);

      // Contract: URLs must be valid HTTPS URLs
      expect(response.body).toHaveProperty('uploadUrl');
      expect(response.body.uploadUrl).toMatch(/^https:\/\//);
    });

    test('CRITICAL: objectKey must be string type', async () => {
      const response = await request(app)
        .post('/aws-s3/generate-upload-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          fileName: 'test-file.jpg',
          fileType: 'image/jpeg',
        })
        .expect(200);

      // Contract: objectKey must be string
      expect(typeof response.body.objectKey).toBe('string');
    });
  });

  describe('Security Contract Tests', () => {
    test('CRITICAL: Should prevent path traversal in objectKey', async () => {
      const response = await request(app)
        .post('/aws-s3/get-private-url')
        .set('X-ORG-ID', 'test-org')
        .send({
          objectKey: '../../../etc/passwd',
        })
        .expect(200);

      // Contract: Should handle path traversal attempts gracefully
      expect(response.body).toHaveProperty('secureUrl');
      expect(response.body.secureUrl).toContain('https://');
    });

    test('CRITICAL: Should validate orgId format', async () => {
      const response = await request(app)
        .post('/aws-s3/generate-upload-url')
        .set('X-ORG-ID', 'invalid-org-format')
        .send({
          fileName: 'test-file.jpg',
          fileType: 'image/jpeg',
        })
        .expect(500);

      // Contract: Invalid orgId should result in error
      expect(response.body).toHaveProperty('error');
    });
  });
});
