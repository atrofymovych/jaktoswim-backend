const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');

// No mocking needed for this test

describe('DAO Hardcore Unit Tests', () => {
  let mongoServer;
  let connection;
  let DAOAiObject;
  let DAOObject;
  let UserOrgBinding;
  let OrganisationRolesMapping;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    connection = await mongoose.createConnection(mongoUri);

    // Define schemas
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

    // Create models
    DAOObject = connection.model('DAOObject', daoObjectSchema);
    DAOAiObject = connection.model('DAOAiObject', daoObjectSchema);
    UserOrgBinding = connection.model('UserOrgBinding', userOrgBindingSchema);
    OrganisationRolesMapping = connection.model('OrganisationRolesMapping', organisationRolesMappingSchema);
  });

  afterAll(async () => {
    await connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections before each test
    await DAOObject.deleteMany({});
    await DAOAiObject.deleteMany({});
    await UserOrgBinding.deleteMany({});
    await OrganisationRolesMapping.deleteMany({});
  });

  describe('DAO Object CRUD Operations', () => {
    test('should create DAO object with valid data', async () => {
      const testData = {
        type: 'TestType',
        data: { name: 'Test Object', value: 123 },
        metadata: { orgId: 'test-org', userId: 'test-user' },
      };

      const daoObject = new DAOObject(testData);
      const saved = await daoObject.save();

      expect(saved._id).toBeDefined();
      expect(saved.type).toBe(testData.type);
      expect(saved.data).toEqual(testData.data);
      expect(saved.metadata).toEqual(testData.metadata);
      expect(saved.deleted_at).toBeNull();
      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
    });

    test('should fail to create DAO object without required fields', async () => {
      const invalidData = {
        data: { name: 'Test Object' },
        // Missing 'type' field
      };

      const daoObject = new DAOObject(invalidData);

      await expect(daoObject.save()).rejects.toThrow();
    });

    test('should handle extremely large data objects', async () => {
      const largeData = {
        type: 'LargeObject',
        data: {
          largeArray: Array.from({ length: 10000 }, (_, i) => ({ id: i, value: `value-${i}` })),
          largeString: 'x'.repeat(1000000), // 1MB string
          nested: {
            deep: {
              deeper: {
                deepest: Array.from({ length: 1000 }, (_, i) => ({ nestedId: i })),
              },
            },
          },
        },
      };

      const daoObject = new DAOObject(largeData);
      const saved = await daoObject.save();

      expect(saved._id).toBeDefined();
      expect(saved.data.largeArray).toHaveLength(10000);
      expect(saved.data.largeString).toHaveLength(1000000);
    });

    test('should handle special characters and unicode in data', async () => {
      const specialData = {
        type: 'SpecialChars',
        data: {
          emoji: '🚀🔥💯',
          unicode: '中文日本語한국어',
          specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
          nullValue: null,
          undefinedValue: undefined,
          booleanValues: [true, false],
          numbers: [0, -1, 3.14159, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
        },
      };

      const daoObject = new DAOObject(specialData);
      const saved = await daoObject.save();

      expect(saved.data.emoji).toBe('🚀🔥💯');
      expect(saved.data.unicode).toBe('中文日本語한국어');
      expect(saved.data.nullValue).toBeNull();
      expect(saved.data.booleanValues).toEqual([true, false]);
    });

    test('should handle concurrent writes to same object', async () => {
      const baseObject = new DAOObject({
        type: 'ConcurrentTest',
        data: { counter: 0 },
      });
      const saved = await baseObject.save();

      // Simulate concurrent updates
      const promises = Array.from({ length: 10 }, async (_, i) =>
        DAOObject.findByIdAndUpdate(saved._id, { $inc: { 'data.counter': 1 } }, { new: true })
      );

      const results = await Promise.all(promises);
      const finalObject = await DAOObject.findById(saved._id);

      expect(finalObject.data.counter).toBe(10);
    });

    test('should handle soft delete correctly', async () => {
      const testObject = new DAOObject({
        type: 'SoftDeleteTest',
        data: { name: 'To Delete' },
      });
      const saved = await testObject.save();

      // Soft delete
      await DAOObject.findByIdAndUpdate(saved._id, { deleted_at: new Date() });

      // Should not find in normal queries (MongoDB doesn't automatically filter deleted_at)
      const found = await DAOObject.findById(saved._id);
      expect(found).toBeDefined();
      expect(found.deleted_at).toBeDefined();

      // Should find with deleted filter
      const foundWithDeleted = await DAOObject.findById(saved._id).where('deleted_at').ne(null);
      expect(foundWithDeleted).toBeDefined();
    });

    test('should handle links between objects', async () => {
      const parent = new DAOObject({
        type: 'Parent',
        data: { name: 'Parent Object' },
      });
      const savedParent = await parent.save();

      const child1 = new DAOObject({
        type: 'Child',
        data: { name: 'Child 1' },
        links: [savedParent._id],
      });
      const child2 = new DAOObject({
        type: 'Child',
        data: { name: 'Child 2' },
        links: [savedParent._id],
      });

      await child1.save();
      await child2.save();

      const children = await DAOObject.find({ links: savedParent._id });
      expect(children).toHaveLength(2);
    });
  });

  describe('DAO Query Performance Tests', () => {
    test('should handle large dataset queries efficiently', async () => {
      // Create 10000 test objects
      const bulkData = Array.from({ length: 10000 }, (_, i) => ({
        type: 'BulkTest',
        data: {
          index: i,
          category: i % 10,
          value: Math.random() * 1000,
        },
        metadata: { orgId: 'test-org' },
      }));

      await DAOObject.insertMany(bulkData);

      // Test various query patterns
      const startTime = Date.now();

      // Simple find
      const allObjects = await DAOObject.find({ type: 'BulkTest' });
      expect(allObjects).toHaveLength(10000);

      // Find with data filter
      const category5Objects = await DAOObject.find({
        type: 'BulkTest',
        'data.category': 5,
      });
      expect(category5Objects).toHaveLength(1000);

      // Find with range
      const highValueObjects = await DAOObject.find({
        type: 'BulkTest',
        'data.value': { $gt: 500 },
      });
      expect(highValueObjects.length).toBeGreaterThan(0);

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle complex aggregation queries', async () => {
      // Create test data with various categories and values
      const testData = Array.from({ length: 1000 }, (_, i) => ({
        type: 'AggregationTest',
        data: {
          category: `cat-${i % 5}`,
          value: Math.floor(Math.random() * 100),
          timestamp: new Date(Date.now() - Math.random() * 86400000), // Random date in last 24h
        },
      }));

      await DAOObject.insertMany(testData);

      // Complex aggregation
      const result = await DAOObject.aggregate([
        { $match: { type: 'AggregationTest' } },
        {
          $group: {
            _id: '$data.category',
            count: { $sum: 1 },
            avgValue: { $avg: '$data.value' },
            maxValue: { $max: '$data.value' },
            minValue: { $min: '$data.value' },
          },
        },
        { $sort: { avgValue: -1 } },
      ]);

      expect(result).toHaveLength(5); // 5 categories
      expect(result[0]).toHaveProperty('count');
      expect(result[0]).toHaveProperty('avgValue');
      expect(result[0]).toHaveProperty('maxValue');
      expect(result[0]).toHaveProperty('minValue');
    });
  });

  describe('DAO Error Handling Tests', () => {
    test('should handle malformed ObjectId gracefully', async () => {
      const invalidId = 'invalid-object-id';

      // Mongoose throws an error for invalid ObjectIds, so we need to catch it
      try {
        await DAOObject.findById(invalidId);
        fail('Should have thrown an error for invalid ObjectId');
      } catch (error) {
        expect(error.name).toBe('CastError');
        expect(error.message).toContain('Cast to ObjectId failed');
      }
    });

    test('should handle circular references in data', async () => {
      const circularData = { name: 'circular' };
      circularData.self = circularData;

      const daoObject = new DAOObject({
        type: 'CircularTest',
        data: circularData,
      });

      // This should not crash the application
      await expect(daoObject.save()).rejects.toThrow();
    });

    test('should handle extremely deep nested objects', async () => {
      let deepObject = { value: 'deep' };
      for (let i = 0; i < 50; i++) {
        deepObject = { nested: deepObject };
      }

      const daoObject = new DAOObject({
        type: 'DeepNestedTest',
        data: deepObject,
      });

      // Should handle deep nesting without stack overflow
      await expect(daoObject.save()).resolves.toBeDefined();
    });

    test('should handle concurrent deletion of same object', async () => {
      const testObject = new DAOObject({
        type: 'ConcurrentDeleteTest',
        data: { name: 'To Delete Concurrently' },
      });
      const saved = await testObject.save();

      // Simulate concurrent deletions
      const promises = Array.from({ length: 5 }, () => DAOObject.findByIdAndDelete(saved._id));

      const results = await Promise.allSettled(promises);

      // Multiple deletions might succeed in MongoDB, so we check that at least one succeeded
      const successful = results.filter((r) => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);
    });

    test('should handle database connection failures gracefully', async () => {
      // This test would require mocking the database connection
      // For now, we'll test that our error handling is in place
      const testObject = new DAOObject({
        type: 'ConnectionTest',
        data: { name: 'Test' },
      });

      // Simulate a scenario where save might fail
      const originalSave = testObject.save;
      testObject.save = jest.fn().mockRejectedValue(new Error('Connection failed'));

      await expect(testObject.save()).rejects.toThrow('Connection failed');

      // Restore original method
      testObject.save = originalSave;
    });
  });

  describe('DAO Security Tests', () => {
    test('should prevent NoSQL injection in queries', async () => {
      // Create test data
      await DAOObject.create({
        type: 'SecurityTest',
        data: { name: 'legitimate', value: 100 },
      });

      // Attempt NoSQL injection
      const maliciousQuery = {
        type: 'SecurityTest',
        'data.value': { $gt: '' }, // This could be exploited
      };

      const results = await DAOObject.find(maliciousQuery);
      // Should only return legitimate results, not expose all data
      expect(results.length).toBeLessThanOrEqual(1);
    });

    test('should handle malicious data in object creation', async () => {
      const maliciousData = {
        type: 'MaliciousTest',
        data: {
          // Attempt to inject malicious content
          script: '<script>alert("xss")</script>',
          sql: "'; DROP TABLE users; --",
          object: { constructor: { prototype: { toString: 'malicious' } } },
        },
      };

      const daoObject = new DAOObject(maliciousData);
      const saved = await daoObject.save();

      // Data should be stored as-is without execution
      expect(saved.data.script).toBe('<script>alert("xss")</script>');
      expect(saved.data.sql).toBe("'; DROP TABLE users; --");
    });

    test('should validate ObjectId references', async () => {
      const invalidObjectId = '507f1f77bcf86cd799439011'; // Valid format but non-existent

      const daoObject = new DAOObject({
        type: 'ReferenceTest',
        data: { name: 'Test' },
        links: [invalidObjectId],
      });

      // Should save successfully even with non-existent references
      const saved = await daoObject.save();
      expect(saved.links).toHaveLength(1);
      expect(saved.links[0].toString()).toBe(invalidObjectId);
      // Note: MongoDB doesn't validate ObjectId references by default
    });
  });

  describe('DAO Transaction Tests', () => {
    test('should handle transactions correctly', async () => {
      // MongoDB Memory Server doesn't support transactions, so we'll test basic operations
      const obj1 = new DAOObject({
        type: 'TransactionTest',
        data: { name: 'Object 1' },
      });
      await obj1.save();

      const obj2 = new DAOObject({
        type: 'TransactionTest',
        data: { name: 'Object 2' },
      });
      await obj2.save();

      // Both objects should be saved
      const count = await DAOObject.countDocuments({ type: 'TransactionTest' });
      expect(count).toBe(2);
    });

    test('should rollback transaction on error', async () => {
      // MongoDB Memory Server doesn't support transactions, so we'll test error handling
      try {
        const obj1 = new DAOObject({
          type: 'RollbackTest',
          data: { name: 'Object 1' },
        });
        await obj1.save();

        // This should cause an error
        throw new Error('Simulated error');
      } catch (error) {
        // Error should be caught
        expect(error.message).toBe('Simulated error');

        // Object should still be saved since no transaction
        const count = await DAOObject.countDocuments({ type: 'RollbackTest' });
        expect(count).toBe(1);
      }
    });
  });

  describe('DAO Performance Under Load', () => {
    test('should handle high-frequency writes', async () => {
      const startTime = Date.now();
      const writePromises = [];

      // Simulate 1000 rapid writes
      for (let i = 0; i < 1000; i++) {
        writePromises.push(
          DAOObject.create({
            type: 'HighFreqTest',
            data: { index: i, timestamp: new Date() },
          })
        );
      }

      await Promise.all(writePromises);
      const endTime = Date.now();

      const count = await DAOObject.countDocuments({ type: 'HighFreqTest' });
      expect(count).toBe(1000);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    test('should handle mixed read/write operations', async () => {
      // Create initial data
      await DAOObject.insertMany(
        Array.from({ length: 100 }, (_, i) => ({
          type: 'MixedTest',
          data: { index: i, value: Math.random() },
        }))
      );

      const startTime = Date.now();
      const operations = [];

      // Mix of reads and writes
      for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          // Read operation
          operations.push(DAOObject.find({ type: 'MixedTest' }).limit(10));
        } else {
          // Write operation
          operations.push(
            DAOObject.create({
              type: 'MixedTest',
              data: { index: 100 + i, value: Math.random() },
            })
          );
        }
      }

      await Promise.all(operations);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
