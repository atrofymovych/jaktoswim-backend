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
    org_2zbiM3GXBaulTnCdlqimkqnPUTE: {
      models: [{ model_name: 'UserOrgBinding' }, { model_name: 'OrganisationRolesMapping' }],
    },
    org_2zmXGAn5R70nSzO0N7BmTplvIce: {
      models: [{ model_name: 'UserOrgBinding' }, { model_name: 'OrganisationRolesMapping' }],
    },
  }),
}));

// Mock connection
jest.mock('../connection', () => ({
  getOrgConnection: jest.fn(),
}));

describe('Middleware Unit Tests', () => {
  let mongoServer;
  let connection;
  let UserOrgBinding;
  let OrganisationRolesMapping;
  let getOrgConnection;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    connection = await mongoose.createConnection(mongoUri);

    // Define schemas
    const userOrgBindingSchema = new mongoose.Schema({
      userId: { type: String, required: true },
      orgId: { type: String, required: true },
      active: { type: Boolean, default: false },
    });

    const organisationRolesMappingSchema = new mongoose.Schema({
      userId: { type: String, required: true },
      organizationId: { type: String, required: true },
      role: { type: String, required: true },
    });

    UserOrgBinding = connection.model('UserOrgBinding', userOrgBindingSchema);
    OrganisationRolesMapping = connection.model('OrganisationRolesMapping', organisationRolesMappingSchema);

    // Get the mocked function
    getOrgConnection = require('../connection').getOrgConnection;
  });

  afterAll(async () => {
    await connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await UserOrgBinding.deleteMany({});
    await OrganisationRolesMapping.deleteMany({});
    jest.clearAllMocks();
  });

  describe('injectOrgConnection Middleware', () => {
    let injectOrgConnection;

    beforeAll(() => {
      injectOrgConnection = require('../middlewares/injectOrgConnection');
    });

    test('should inject organization connection for valid user', async () => {
      // Create test data
      await UserOrgBinding.create({
        userId: 'test-user-id',
        orgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
        active: true,
      });

      // Mock connection to return our actual model
      const mockConnection = {
        model: (modelName) => {
          if (modelName === 'UserOrgBinding') {
            return UserOrgBinding;
          }
          return {
            findOne: jest.fn().mockResolvedValue({ orgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE', active: true }),
            lean: jest.fn().mockReturnThis(),
          };
        },
      };

      getOrgConnection.mockReturnValue(mockConnection);

      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        path: '/test',
        method: 'GET',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await injectOrgConnection(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.activeOrgId).toBe('org_2zbiM3GXBaulTnCdlqimkqnPUTE');
      expect(req.models).toBeDefined();
    });

    test('should fail for user without active organization', async () => {
      // Mock connection to return empty result
      const mockConnection = {
        model: (modelName) => {
          if (modelName === 'UserOrgBinding') {
            return {
              findOne: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
              }),
            };
          }
          return {
            findOne: jest.fn().mockResolvedValue(null),
            lean: jest.fn().mockReturnThis(),
          };
        },
      };

      getOrgConnection.mockReturnValue(mockConnection);

      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        path: '/test',
        method: 'GET',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await injectOrgConnection(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'No active organization found' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle organization binding routes', async () => {
      const mockConnection = {
        model: (modelName) => ({
          findOne: jest.fn().mockResolvedValue({ orgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE', active: true }),
          lean: jest.fn().mockReturnThis(),
        }),
      };

      getOrgConnection.mockReturnValue(mockConnection);

      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        path: '/bind-org',
        method: 'POST',
        body: { orgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE' },
        get: jest.fn().mockImplementation((header) => {
          if (header === 'X-ORG-ID') return 'org_2zbiM3GXBaulTnCdlqimkqnPUTE';
          if (header === 'X-SOURCE') return 'test-source';
          return null;
        }),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await injectOrgConnection(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.activeOrgId).toBe('org_2zbiM3GXBaulTnCdlqimkqnPUTE');
      expect(req.source).toBe('test-source');
    });

    test('should handle public DAO routes', async () => {
      const mockConnection = {
        model: (modelName) => ({
          findOne: jest.fn().mockResolvedValue({ orgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE', active: true }),
          lean: jest.fn().mockReturnThis(),
        }),
      };

      getOrgConnection.mockReturnValue(mockConnection);

      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        path: '/public/dao/test',
        originalUrl: '/public/dao/test',
        method: 'GET',
        body: { orgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE' },
        get: jest.fn().mockImplementation((header) => {
          if (header === 'X-ORG-ID') return 'org_2zbiM3GXBaulTnCdlqimkqnPUTE';
          if (header === 'X-SOURCE') return 'test-source';
          return null;
        }),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await injectOrgConnection(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.activeOrgId).toBeDefined();
    });

    test('should fail without required headers for binding routes', async () => {
      const mockConnection = {
        model: (modelName) => ({
          findOne: jest.fn().mockResolvedValue({ orgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE', active: true }),
          lean: jest.fn().mockReturnThis(),
        }),
      };

      getOrgConnection.mockReturnValue(mockConnection);

      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        path: '/bind-org',
        method: 'POST',
        body: {},
        get: jest.fn().mockImplementation((header) => {
          if (header === 'X-ORG-ID') return null;
          if (header === 'X-SOURCE') return 'valid-source';
          return null;
        }),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await injectOrgConnection(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'X-ORG-ID header is required' });
    });

    test('should handle source validation', async () => {
      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        path: '/bind-org',
        method: 'POST',
        body: { orgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE' },
        get: jest.fn().mockImplementation((header) => {
          if (header === 'X-ORG-ID') return 'org_2zbiM3GXBaulTnCdlqimkqnPUTE';
          if (header === 'X-SOURCE') return 'short';
          return null;
        }),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await injectOrgConnection(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Source is not correct. Must be from 6 to 200 symbols' });
    });
  });

  describe('requireRole Middleware', () => {
    let requireRole;

    beforeAll(() => {
      requireRole = require('../middlewares/requireRole');
    });

    test('should allow access for user with required role', async () => {
      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        activeOrgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
        models: {
          OrganisationRolesMapping: {
            findOne: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue({
                userId: 'test-user-id',
                organizationId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
                role: 'ADMIN',
              }),
            }),
          },
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = requireRole(['ADMIN']);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.role).toBe('ADMIN');
    });

    test('should deny access for user without required role', async () => {
      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        activeOrgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
        models: {
          OrganisationRolesMapping: {
            findOne: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue({
                userId: 'test-user-id',
                organizationId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
                role: 'USER',
              }),
            }),
          },
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = requireRole(['ADMIN']);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden: Requires role ADMIN' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should deny access for user without any role', async () => {
      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        activeOrgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
        models: {
          OrganisationRolesMapping: {
            findOne: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(null),
            }),
          },
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = requireRole(['ADMIN']);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden: Requires role ADMIN' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle multiple required roles', async () => {
      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        activeOrgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
        models: {
          OrganisationRolesMapping: {
            findOne: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue({
                userId: 'test-user-id',
                organizationId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
                role: 'MODERATOR',
              }),
            }),
          },
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = requireRole(['ADMIN', 'MODERATOR']);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.role).toBe('MODERATOR');
    });

    test('should handle single role requirement', async () => {
      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        activeOrgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
        models: {
          OrganisationRolesMapping: {
            findOne: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue({
                userId: 'test-user-id',
                organizationId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
                role: 'USER',
              }),
            }),
          },
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = requireRole('USER');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.role).toBe('USER');
    });

    test('should fail without authentication', async () => {
      const req = {
        auth: null,
        activeOrgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
        models: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = requireRole(['ADMIN']);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle database errors gracefully', async () => {
      const req = {
        auth: () => ({ userId: 'test-user-id' }),
        activeOrgId: 'org_2zbiM3GXBaulTnCdlqimkqnPUTE',
        models: {
          OrganisationRolesMapping: {
            findOne: jest.fn().mockReturnValue({
              lean: jest.fn().mockRejectedValue(new Error('Database error')),
            }),
          },
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = requireRole(['ADMIN']);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
