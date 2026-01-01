const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');

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
    test_org: {
      models: [
        { model_name: 'DAOObject' },
        { model_name: 'ProxyConfig' },
        { model_name: 'ObjectPermission' },
        { model_name: 'OrganisationRolesMapping' },
        { model_name: 'UserOrgBinding' },
      ],
    },
  }),
}));

// Mock connection
jest.mock('../connection', () => ({
  getOrgConnection: jest.fn(),
}));

describe('Proxy Endpoints Unit Tests', () => {
  let mongoServer;
  let connection;
  let app;
  let DAOObject;
  let ProxyConfig;
  let ObjectPermission;
  let OrganisationRolesMapping;
  let UserOrgBinding;
  let getOrgConnection;

  const testOrgId = 'test_org';
  const testUserId = 'test-user-id';

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    connection = await mongoose.createConnection(mongoUri);

    // Define schemas
    const daoObjectSchema = new mongoose.Schema(
      {
        type: { type: String, required: true, index: true },
        data: { type: String, required: true },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        deleted_at: { type: Date, default: null },
      },
      { timestamps: true }
    );

    const proxyConfigSchema = new mongoose.Schema(
      {
        organizationId: { type: String, required: true, index: true },
        type: { type: String, required: true, index: true },
        isPublic: { type: Boolean, default: false },
        enabledMethods: { type: [String], default: ['GET'] },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
      { timestamps: true }
    );
    proxyConfigSchema.index({ organizationId: 1, type: 1 }, { unique: true });

    const objectPermissionSchema = new mongoose.Schema({
      organizationId: { type: String, required: true, index: true },
      objectType: { type: String, required: true, index: true },
      role: { type: String, required: true, index: true },
      action: { type: String, required: true, enum: ['CREATE', 'GET', 'UPDATE', 'ARCHIVE'], index: true },
      allow: { type: Boolean, required: true },
    });
    objectPermissionSchema.index({ organizationId: 1, objectType: 1, role: 1, action: 1 }, { unique: true });

    const organisationRolesMappingSchema = new mongoose.Schema({
      userId: { type: String, required: true },
      organizationId: { type: String, required: true },
      role: { type: String, required: true },
    });
    organisationRolesMappingSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

    const userOrgBindingSchema = new mongoose.Schema({
      userId: { type: String, required: true },
      orgId: { type: String, required: true },
      active: { type: Boolean, default: false },
    });

    // Create models
    DAOObject = connection.model('DAOObject', daoObjectSchema);
    ProxyConfig = connection.model('ProxyConfig', proxyConfigSchema);
    ObjectPermission = connection.model('ObjectPermission', objectPermissionSchema);
    OrganisationRolesMapping = connection.model('OrganisationRolesMapping', organisationRolesMappingSchema);
    UserOrgBinding = connection.model('UserOrgBinding', userOrgBindingSchema);

    // Ensure indexes are created (especially unique indexes)
    await ProxyConfig.createIndexes();
    await ObjectPermission.createIndexes();
    await OrganisationRolesMapping.createIndexes();

    // Get the mocked function
    getOrgConnection = require('../connection').getOrgConnection;

    // Setup Express app
    app = express();
    app.use(express.json());

    // Mock injectOrgConnection middleware
    const injectOrgConnection = (req, res, next) => {
      req.activeOrgId = testOrgId;
      req.models = {
        DAOObject,
        ProxyConfig,
        ObjectPermission,
        OrganisationRolesMapping,
        UserOrgBinding,
      };
      req.auth = () => ({ userId: testUserId });
      req.source = 'test';
      // Initialize params if not exists
      if (!req.params) {
        req.params = {};
      }
      // In supertest, when using app.use('/proxy/:type', router), Express should set req.params.type
      // But it doesn't work in tests, so we need to extract it manually in ensureTypeParam
      // However, we can try to set it here if Express has already processed it
      // Ensure originalUrl is set for ensureTypeParam to work
      if (!req.originalUrl) {
        req.originalUrl = req.url || req.path;
      }
      if (!req.path && req.url) {
        // Remove query string from path
        req.path = req.url.split('?')[0];
      }
      next();
    };

    // Create a wrapper middleware to ensure req.params.type is set
    // In Express, when using app.use('/proxy/:type', router), req.params.type should be set automatically
    // But in tests with supertest, Express doesn't populate req.params from the mount path
    // So we need to extract it manually from the URL
    const ensureTypeParam = (req, res, next) => {
      // Initialize params if not exists
      if (!req.params) {
        req.params = {};
      }
      // Express should set req.params.type from app.use('/proxy/:type', ...), but in tests it doesn't
      // So we extract from originalUrl or url which contains the full path
      if (!req.params.type) {
        // In supertest, when using app.use('/proxy/:type', router), Express doesn't populate req.params.type
        // from the mount path. The req.url will be '/proxy/gdpr-consent' or '/proxy/gdpr-consent/123'
        // We need to extract the type manually from the URL
        const urlToCheck = req.originalUrl || req.url || req.path || '';
        const urlStr = String(urlToCheck);
        // Match /proxy/:type or /public/proxy/:type, extract type (before query string ? or next segment like /:id)
        // Example: /proxy/gdpr-consent -> gdpr-consent
        // Example: /proxy/gdpr-consent/123 -> gdpr-consent (first segment after /proxy/)
        // Example: /public/proxy/gdpr-consent -> gdpr-consent
        // Example: /proxy/gdpr-consent?limit=1 -> gdpr-consent
        const match = urlStr.match(/\/(?:public\/)?proxy\/([^\/\?]+)/);
        if (match && match[1]) {
          req.params.type = match[1];
        }
      }
      next();
    };

    // Mock validateProxyType middleware
    const validateProxyType = require('../middlewares/validateProxyType');

    // Import proxy routes
    const proxyRoutes = require('../routes/proxy');

    // Setup routes - order matters: more specific routes first
    // Add ensureTypeParam before validateProxyType to set req.params.type
    // In supertest, Express doesn't populate req.params from mount path, so we need ensureTypeParam
    app.use('/public/proxy/:type', injectOrgConnection, ensureTypeParam, validateProxyType, proxyRoutes);
    app.use('/proxy/:type', injectOrgConnection, ensureTypeParam, validateProxyType, proxyRoutes);
  });

  afterAll(async () => {
    await connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections before each test
    await DAOObject.deleteMany({});
    await ProxyConfig.deleteMany({});
    await ObjectPermission.deleteMany({});
    await OrganisationRolesMapping.deleteMany({});
    await UserOrgBinding.deleteMany({});
    jest.clearAllMocks();
  });

  describe('ProxyConfig Setup', () => {
    test('should create proxy config for private endpoint', async () => {
      const config = await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'gdpr-consent',
        isPublic: false,
        enabledMethods: ['GET', 'POST'],
      });

      expect(config._id).toBeDefined();
      expect(config.organizationId).toBe(testOrgId);
      expect(config.type).toBe('gdpr-consent');
      expect(config.isPublic).toBe(false);
      expect(config.enabledMethods).toEqual(['GET', 'POST']);
    });

    test('should create proxy config for public endpoint', async () => {
      const config = await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'privacy-policy',
        isPublic: true,
        enabledMethods: ['GET'],
      });

      expect(config.isPublic).toBe(true);
    });

    test('should enforce unique constraint on organizationId + type', async () => {
      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'test-type',
        isPublic: false,
      });

      // Try to create duplicate - should fail with duplicate key error
      await expect(
        ProxyConfig.create({
          organizationId: testOrgId,
          type: 'test-type',
          isPublic: true,
        })
      ).rejects.toThrow();
    });
  });

  describe('GET /proxy/:type - List objects', () => {
    beforeEach(async () => {
      // Create proxy config
      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'gdpr-consent',
        isPublic: false,
        enabledMethods: ['GET'],
      });

      // Create test objects
      await DAOObject.create({
        type: 'gdpr-consent',
        data: JSON.stringify({ hwid: 'hwid1', accepted: true }),
        metadata: { orgId: testOrgId },
      });
      await DAOObject.create({
        type: 'gdpr-consent',
        data: JSON.stringify({ hwid: 'hwid2', accepted: false }),
        metadata: { orgId: testOrgId },
      });
      await DAOObject.create({
        type: 'other-type',
        data: JSON.stringify({ value: 'test' }),
        metadata: { orgId: testOrgId },
      });
    });

    test('should return all objects of specified type', async () => {
      // Verify objects exist in DB using the same model that will be used in the route
      const dbCount = await DAOObject.countDocuments({ type: 'gdpr-consent' });
      expect(dbCount).toBe(2);

      // Verify ProxyConfig exists
      const config = await ProxyConfig.findOne({ organizationId: testOrgId, type: 'gdpr-consent' });
      expect(config).toBeDefined();

      // Make request and check response
      const response = await request(app).get('/proxy/gdpr-consent');


      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('objects');
      expect(Array.isArray(response.body.objects)).toBe(true);
      expect(response.body.objects).toHaveLength(2);
      expect(response.body.objects[0].type).toBe('gdpr-consent');
      expect(response.body.objects[0].data).toHaveProperty('hwid');
    });

    test('should support limit query parameter', async () => {
      const response = await request(app).get('/proxy/gdpr-consent?limit=1');

      expect(response.status).toBe(200);
      expect(response.body.objects).toHaveLength(1);
    });

    test('should support skip query parameter', async () => {
      const response = await request(app).get('/proxy/gdpr-consent?skip=1');

      expect(response.status).toBe(200);
      expect(response.body.objects).toHaveLength(1);
    });

    test('should support dataFilter query parameter', async () => {
      const dataFilter = JSON.stringify({ accepted: true });
      const response = await request(app).get(`/proxy/gdpr-consent?dataFilter=${encodeURIComponent(dataFilter)}`);

      expect(response.status).toBe(200);
      expect(response.body.objects).toHaveLength(1);
      expect(response.body.objects[0].data.accepted).toBe(true);
    });

    test('should return 404 if type not configured', async () => {
      const response = await request(app).get('/proxy/non-existent-type');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Type is not allowed or does not exist');
    });

    test('should return 404 if method not enabled', async () => {
      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'read-only-type',
        isPublic: false,
        enabledMethods: ['POST'], // GET not enabled
      });

      const response = await request(app).get('/proxy/read-only-type');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Type is not allowed or does not exist');
    });
  });

  describe('POST /proxy/:type - Create object', () => {
    beforeEach(async () => {
      // Create proxy config
      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'gdpr-consent',
        isPublic: false,
        enabledMethods: ['GET', 'POST'],
      });

      // Setup permissions
      await OrganisationRolesMapping.create({
        userId: testUserId,
        organizationId: testOrgId,
        role: 'USER',
      });

      await ObjectPermission.create({
        organizationId: testOrgId,
        objectType: 'gdpr-consent',
        role: 'USER',
        action: 'CREATE',
        allow: true,
      });
    });

    test('should create new object', async () => {
      const response = await request(app)
        .post('/proxy/gdpr-consent')
        .send({
          data: { hwid: 'hwid123', accepted: true, language: 'en' },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('object_added');
      expect(response.body.object.data).toHaveProperty('hwid', 'hwid123');
      expect(response.body.object.type).toBe('gdpr-consent');

      // Verify object was saved
      const saved = await DAOObject.findOne({ type: 'gdpr-consent' });
      expect(saved).toBeDefined();
      expect(JSON.parse(saved.data).hwid).toBe('hwid123');
    });

    test('should return 400 if data is missing', async () => {
      const response = await request(app).post('/proxy/gdpr-consent').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('data');
    });

    test('should return 400 if data is not an object', async () => {
      const response = await request(app)
        .post('/proxy/gdpr-consent')
        .send({ data: 'not-an-object' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('data');
    });

    test('should return 403 if permission denied', async () => {
      await ObjectPermission.updateOne(
        { organizationId: testOrgId, objectType: 'gdpr-consent', role: 'USER', action: 'CREATE' },
        { allow: false }
      );

      const response = await request(app)
        .post('/proxy/gdpr-consent')
        .send({
          data: { hwid: 'hwid123', accepted: true },
        });

      expect(response.status).toBe(403);
    });

    test('should allow public POST without authentication', async () => {
      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'public-consent',
        isPublic: true,
        enabledMethods: ['GET', 'POST'],
      });

      const response = await request(app)
        .post('/public/proxy/public-consent')
        .send({
          data: { hwid: 'hwid456', accepted: true },
        });

      expect(response.status).toBe(200);
      expect(response.body.object.data).toHaveProperty('hwid', 'hwid456');
    });
  });

  describe('GET /proxy/:type/:id - Get object by ID', () => {
    let testObjectId;

    beforeEach(async () => {
      // Create proxy config
      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'gdpr-consent',
        isPublic: false,
        enabledMethods: ['GET'],
      });

      // Create test object
      const obj = await DAOObject.create({
        type: 'gdpr-consent',
        data: JSON.stringify({ hwid: 'hwid789', accepted: true }),
        metadata: { orgId: testOrgId },
      });
      testObjectId = obj._id.toString();
    });

    test('should return object by ID', async () => {
      const response = await request(app).get(`/proxy/gdpr-consent/${testObjectId}`);

      expect(response.status).toBe(200);
      expect(response.body.object._id).toBe(testObjectId);
      expect(response.body.object.data).toHaveProperty('hwid', 'hwid789');
    });

    test('should return 404 if object not found', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app).get(`/proxy/gdpr-consent/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    test('should return 404 if object type mismatch', async () => {
      const otherObj = await DAOObject.create({
        type: 'other-type',
        data: JSON.stringify({ value: 'test' }),
        metadata: { orgId: testOrgId },
      });

      const response = await request(app).get(`/proxy/gdpr-consent/${otherObj._id}`);

      expect(response.status).toBe(404);
    });

    test('should return 400 for invalid ObjectId', async () => {
      const response = await request(app).get('/proxy/gdpr-consent/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid ObjectId');
    });
  });

  describe('PUT /proxy/:type/:id - Update object', () => {
    let testObjectId;

    beforeEach(async () => {
      // Create proxy config
      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'gdpr-consent',
        isPublic: false,
        enabledMethods: ['GET', 'PUT'],
      });

      // Setup permissions
      await OrganisationRolesMapping.create({
        userId: testUserId,
        organizationId: testOrgId,
        role: 'USER',
      });

      await ObjectPermission.create({
        organizationId: testOrgId,
        objectType: 'gdpr-consent',
        role: 'USER',
        action: 'UPDATE',
        allow: true,
      });

      // Create test object
      const obj = await DAOObject.create({
        type: 'gdpr-consent',
        data: JSON.stringify({ hwid: 'hwid999', accepted: false }),
        metadata: { orgId: testOrgId },
      });
      testObjectId = obj._id.toString();
    });

    test('should update object', async () => {
      const response = await request(app)
        .put(`/proxy/gdpr-consent/${testObjectId}`)
        .send({
          data: { hwid: 'hwid999', accepted: true, updated: true },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('object_updated');
      expect(response.body.object.data.accepted).toBe(true);
      expect(response.body.object.data.updated).toBe(true);

      // Verify update
      const updated = await DAOObject.findById(testObjectId);
      const parsedData = JSON.parse(updated.data);
      expect(parsedData.accepted).toBe(true);
    });

    test('should return 400 if data is missing', async () => {
      const response = await request(app).put(`/proxy/gdpr-consent/${testObjectId}`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('data');
    });

    test('should return 404 if object not found', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .put(`/proxy/gdpr-consent/${fakeId}`)
        .send({
          data: { hwid: 'hwid999', accepted: true },
        });

      expect(response.status).toBe(404);
    });

    test('should return 403 if permission denied', async () => {
      await ObjectPermission.updateOne(
        { organizationId: testOrgId, objectType: 'gdpr-consent', role: 'USER', action: 'UPDATE' },
        { allow: false }
      );

      const response = await request(app)
        .put(`/proxy/gdpr-consent/${testObjectId}`)
        .send({
          data: { hwid: 'hwid999', accepted: true },
        });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /proxy/:type/:id - Delete object', () => {
    let testObjectId;

    beforeEach(async () => {
      // Create proxy config
      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'gdpr-consent',
        isPublic: false,
        enabledMethods: ['GET', 'DELETE'],
      });

      // Setup permissions
      await OrganisationRolesMapping.create({
        userId: testUserId,
        organizationId: testOrgId,
        role: 'USER',
      });

      await ObjectPermission.create({
        organizationId: testOrgId,
        objectType: 'gdpr-consent',
        role: 'USER',
        action: 'ARCHIVE',
        allow: true,
      });

      // Create test object
      const obj = await DAOObject.create({
        type: 'gdpr-consent',
        data: JSON.stringify({ hwid: 'hwid-delete', accepted: true }),
        metadata: { orgId: testOrgId },
      });
      testObjectId = obj._id.toString();
    });

    test('should soft delete object', async () => {
      const response = await request(app).delete(`/proxy/gdpr-consent/${testObjectId}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('object_deleted');
      expect(response.body.object.deleted_at).toBeDefined();

      // Verify soft delete
      const deleted = await DAOObject.findById(testObjectId);
      expect(deleted.deleted_at).toBeDefined();

      // Verify object is not returned in GET requests
      const getResponse = await request(app).get(`/proxy/gdpr-consent/${testObjectId}`);
      expect(getResponse.status).toBe(404);
    });

    test('should return 404 if object not found', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app).delete(`/proxy/gdpr-consent/${fakeId}`);

      expect(response.status).toBe(404);
    });

    test('should return 403 if permission denied', async () => {
      await ObjectPermission.updateOne(
        { organizationId: testOrgId, objectType: 'gdpr-consent', role: 'USER', action: 'ARCHIVE' },
        { allow: false }
      );

      const response = await request(app).delete(`/proxy/gdpr-consent/${testObjectId}`);

      expect(response.status).toBe(403);
    });
  });

  describe('Public vs Private Access', () => {
    beforeEach(async () => {
      // Create both public and private configs
      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'public-type',
        isPublic: true,
        enabledMethods: ['GET', 'POST'],
      });

      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'private-type',
        isPublic: false,
        enabledMethods: ['GET', 'POST'],
      });
    });

    test('should allow public access to public type', async () => {
      const obj = await DAOObject.create({
        type: 'public-type',
        data: JSON.stringify({ value: 'public' }),
        metadata: { orgId: testOrgId },
      });

      // Verify object was created
      expect(obj).toBeDefined();

      const response = await request(app).get('/public/proxy/public-type');

      expect(response.status).toBe(200);
      expect(response.body.objects).toHaveLength(1);
    });

    test('should deny public access to private type', async () => {
      const response = await request(app).get('/public/proxy/private-type');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Type is not allowed or does not exist');
    });

    test('should allow private access to both types', async () => {
      await DAOObject.create({
        type: 'private-type',
        data: JSON.stringify({ value: 'private' }),
        metadata: { orgId: testOrgId },
      });

      const response = await request(app).get('/proxy/private-type');

      expect(response.status).toBe(200);
    });
  });

  describe('Batch Operations', () => {
    beforeEach(async () => {
      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'batch-type',
        isPublic: false,
        enabledMethods: ['GET', 'POST'],
      });

      await OrganisationRolesMapping.create({
        userId: testUserId,
        organizationId: testOrgId,
        role: 'USER',
      });

      await ObjectPermission.create({
        organizationId: testOrgId,
        objectType: 'batch-type',
        role: 'USER',
        action: 'CREATE',
        allow: true,
      });
    });

    test('should handle batch GET with pagination', async () => {
      // Create multiple objects
      const objects = [];
      for (let i = 0; i < 10; i++) {
        objects.push({
          type: 'batch-type',
          data: JSON.stringify({ index: i, value: `value-${i}` }),
          metadata: { orgId: testOrgId },
        });
      }
      await DAOObject.insertMany(objects);

      // Verify objects were created
      const count = await DAOObject.countDocuments({ type: 'batch-type' });
      expect(count).toBe(10);

      // Verify ProxyConfig exists
      const config = await ProxyConfig.findOne({ organizationId: testOrgId, type: 'batch-type' });
      expect(config).toBeDefined();
      expect(config.enabledMethods).toContain('GET');

      // Test pagination
      const page1 = await request(app).get('/proxy/batch-type?limit=5&skip=0');
      if (page1.status !== 200) {
        console.log('Error response status:', page1.status);
        console.log('Error response body:', JSON.stringify(page1.body, null, 2));
      }
      expect(page1.status).toBe(200);
      if (page1.body.objects) {
        expect(page1.body.objects).toHaveLength(5);
      } else {
        console.log('Response body structure:', Object.keys(page1.body));
        expect(page1.body).toHaveProperty('objects');
      }

      const page2 = await request(app).get('/proxy/batch-type?limit=5&skip=5');
      expect(page2.status).toBe(200);
      expect(page2.body.objects).toHaveLength(5);

      // Verify no overlap
      const ids1 = page1.body.objects.map((o) => o._id.toString());
      const ids2 = page2.body.objects.map((o) => o._id.toString());
      expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    });

    test('should filter by dataFilter in batch', async () => {
      // Create objects with different values
      await DAOObject.insertMany([
        {
          type: 'batch-type',
          data: JSON.stringify({ category: 'A', value: 1 }),
          metadata: { orgId: testOrgId },
        },
        {
          type: 'batch-type',
          data: JSON.stringify({ category: 'A', value: 2 }),
          metadata: { orgId: testOrgId },
        },
        {
          type: 'batch-type',
          data: JSON.stringify({ category: 'B', value: 1 }),
          metadata: { orgId: testOrgId },
        },
      ]);

      // Verify objects were created
      const count = await DAOObject.countDocuments({ type: 'batch-type' });
      expect(count).toBe(3);

      const dataFilter = JSON.stringify({ category: 'A' });
      const response = await request(app).get(
        `/proxy/batch-type?dataFilter=${encodeURIComponent(dataFilter)}`
      );

      expect(response.status).toBe(200);
      expect(response.body.objects).toHaveLength(2);
      expect(response.body.objects.every((o) => o.data.category === 'A')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle corrupted JSON data gracefully', async () => {
      await ProxyConfig.create({
        organizationId: testOrgId,
        type: 'corrupted-type',
        isPublic: false,
        enabledMethods: ['GET'],
      });

      // Create object with corrupted JSON
      await DAOObject.create({
        type: 'corrupted-type',
        data: 'not-valid-json{',
        metadata: { orgId: testOrgId },
      });

      const response = await request(app).get('/proxy/corrupted-type');

      expect(response.status).toBe(200);
      expect(response.body.objects).toHaveLength(1);
      expect(response.body.objects[0].data).toBeNull();
    });

    test('should handle missing organizationId', async () => {
      // This would be caught by injectOrgConnection in real scenario
      // But we test the router's error handling
      const response = await request(app).get('/proxy/test-type');

      // Should fail at validateProxyType since no config exists
      expect(response.status).toBe(404);
    });
  });
});

