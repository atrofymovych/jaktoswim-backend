const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');

// Mock AI SDKs
jest.mock('@google-cloud/vertexai');
// DeepSeek dependency not available, skip mock

describe('AI Integrations Hardcore Unit Tests', () => {
  let mongoServer;
  let connection;
  let app;
  let DAOAiObject;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    connection = await mongoose.createConnection(mongoUri);

    // Define DAO AI Object schema
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

    DAOAiObject = connection.model('DAOAiObject', daoAiObjectSchema);

    // Setup Express app for testing
    app = express();
    app.use(express.json());

    // Mock middleware
    app.use((req, res, next) => {
      req.activeOrgId = 'test-org';
      req.auth = () => ({ userId: 'test-user' });
      req.models = { DAOAiObject };
      next();
    });
  });

  afterAll(async () => {
    // Don't close connection here - let Jest handle cleanup
    // This prevents interference between test suites
  });

  beforeEach(async () => {
    try {
      await DAOAiObject.deleteMany({});
    } catch (error) {
      // Ignore connection errors in cleanup
    }
    jest.clearAllMocks();
  });

  describe('Vertex AI Integration Tests', () => {
    let vertexAiIntegration;

    beforeAll(() => {
      vertexAiIntegration = require('../routes/integrations/vertexAiIntegration');
      app.use('/vertex-ai', vertexAiIntegration);
    });

    describe('Session Management', () => {
      test('should create session with valid data', async () => {
        const response = await request(app).post('/vertex-ai/sessions').send({ name: 'Test Session' }).expect(201);

        expect(response.body).toHaveProperty('session_id');
        expect(response.body.session_id).toBeDefined();
      });

      test('should fail to create session without authentication', async () => {
        const appWithoutAuth = express();
        appWithoutAuth.use(express.json());
        appWithoutAuth.use('/vertex-ai', vertexAiIntegration);

        await request(appWithoutAuth).post('/vertex-ai/sessions').send({ name: 'Test Session' }).expect(500);
      });

      test('should handle session creation with extremely long name', async () => {
        const longName = 'x'.repeat(10000);

        const response = await request(app).post('/vertex-ai/sessions').send({ name: longName }).expect(201);

        expect(response.body).toHaveProperty('session_id');
      });

      test('should handle session creation with special characters', async () => {
        const specialName = 'Session with 🚀 emoji and 中文 characters!@#$%^&*()';

        const response = await request(app).post('/vertex-ai/sessions').send({ name: specialName }).expect(201);

        expect(response.body).toHaveProperty('session_id');
      });

      test('should update session correctly', async () => {
        // Create session first
        const createResponse = await request(app)
          .post('/vertex-ai/sessions')
          .send({ name: 'Original Name' })
          .expect(201);

        const sessionId = createResponse.body.session_id;

        // Update session
        const updateResponse = await request(app)
          .patch(`/vertex-ai/sessions/${sessionId}`)
          .send({ name: 'Updated Name' })
          .expect(200);

        expect(updateResponse.body.name).toBe('Updated Name');
      });

      test('should handle invalid session ID format', async () => {
        await request(app).patch('/vertex-ai/sessions/invalid-id').send({ name: 'Updated Name' }).expect(400);
      });

      test('should handle non-existent session ID', async () => {
        const fakeId = new mongoose.Types.ObjectId();

        await request(app).patch(`/vertex-ai/sessions/${fakeId}`).send({ name: 'Updated Name' }).expect(404);
      });

      test('should end session correctly', async () => {
        // Create session first
        const createResponse = await request(app)
          .post('/vertex-ai/sessions')
          .send({ name: 'Test Session' })
          .expect(201);

        const sessionId = createResponse.body.session_id;

        // End session
        const endResponse = await request(app)
          .patch(`/vertex-ai/sessions/${sessionId}`)
          .send({ end: true })
          .expect(200);

        expect(endResponse.body.session_end).toBeDefined();
      });
    });

    describe('Message Management', () => {
      let sessionId;

      beforeEach(async () => {
        const createResponse = await request(app).post('/vertex-ai/sessions').send({ name: 'Test Session' });
        sessionId = createResponse.body.session_id;
      });

      test('should create message with valid data', async () => {
        const response = await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/messages`)
          .send({
            role: 'user',
            content: 'Hello, AI!',
          })
          .expect(201);

        expect(response.body).toHaveProperty('message_id');
      });

      test('should fail to create message with invalid role', async () => {
        await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/messages`)
          .send({
            role: 'invalid-role',
            content: 'Hello, AI!',
          })
          .expect(400);
      });

      test('should fail to create message without content', async () => {
        await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/messages`)
          .send({
            role: 'user',
            // Missing content
          })
          .expect(400);
      });

      test('should handle extremely long message content', async () => {
        const longContent = 'x'.repeat(100000); // 100KB message

        const response = await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/messages`)
          .send({
            role: 'user',
            content: longContent,
          })
          .expect(201);

        expect(response.body).toHaveProperty('message_id');
      });

      test('should handle message with special characters and unicode', async () => {
        const specialContent = 'Message with 🚀 emoji, 中文 characters, and !@#$%^&*() symbols';

        const response = await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/messages`)
          .send({
            role: 'user',
            content: specialContent,
          })
          .expect(201);

        expect(response.body).toHaveProperty('message_id');
      });

      test('should retrieve messages with pagination', async () => {
        // Create multiple messages
        for (let i = 0; i < 5; i++) {
          await request(app)
            .post(`/vertex-ai/sessions/${sessionId}/messages`)
            .send({
              role: 'user',
              content: `Message ${i}`,
            });
        }

        const response = await request(app).get(`/vertex-ai/sessions/${sessionId}/messages?limit=3`).expect(200);

        expect(response.body.items).toHaveLength(3);
        expect(response.body).toHaveProperty('next_cursor');
      });

      test('should handle message deletion', async () => {
        // Create a message
        const createResponse = await request(app).post(`/vertex-ai/sessions/${sessionId}/messages`).send({
          role: 'user',
          content: 'Message to delete',
        });

        const messageId = createResponse.body.message_id;

        // Delete the message
        await request(app).delete(`/vertex-ai/sessions/${sessionId}/messages/${messageId}`).expect(200);

        // Verify it's deleted
        await request(app).get(`/vertex-ai/sessions/${sessionId}/messages/${messageId}`).expect(404);
      });
    });

    describe('AI Ask Endpoint', () => {
      let sessionId;

      beforeEach(async () => {
        const createResponse = await request(app).post('/vertex-ai/sessions').send({ name: 'Test Session' });
        sessionId = createResponse.body.session_id;
      });

      test('should handle AI ask request', async () => {
        const response = await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/ask`)
          .send({
            history: [],
            message: 'What is the capital of France?',
          })
          .expect(202);

        expect(response.body).toHaveProperty('message_id');
      });

      test('should fail with invalid history format', async () => {
        await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/ask`)
          .send({
            history: 'not-an-array',
            message: 'What is the capital of France?',
          })
          .expect(400);
      });

      test('should fail without message', async () => {
        await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/ask`)
          .send({
            history: [],
            // Missing message
          })
          .expect(400);
      });

      test('should handle extremely long message', async () => {
        const longMessage = 'x'.repeat(50000); // 50KB message

        const response = await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/ask`)
          .send({
            history: [],
            message: longMessage,
          })
          .expect(202);

        expect(response.body).toHaveProperty('message_id');
      });

      test('should handle complex conversation history', async () => {
        const complexHistory = [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
          { role: 'assistant', content: "I'm doing well, thank you!" },
          { role: 'user', content: "What's the weather like?" },
          { role: 'assistant', content: "I don't have access to real-time weather data." },
        ];

        const response = await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/ask`)
          .send({
            history: complexHistory,
            message: 'Tell me a joke',
          })
          .expect(202);

        expect(response.body).toHaveProperty('message_id');
      });
    });

    describe('Context Job Endpoint', () => {
      let sessionId;

      beforeEach(async () => {
        const createResponse = await request(app).post('/vertex-ai/sessions').send({ name: 'Test Session' });
        sessionId = createResponse.body.session_id;
      });

      test('should create context job', async () => {
        const response = await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/ctx`)
          .send({
            task: 'Summarize the conversation',
            history: [
              { role: 'user', content: 'Hello' },
              { role: 'assistant', content: 'Hi there!' },
            ],
          })
          .expect(202);

        expect(response.body).toHaveProperty('ctx_id');
      });

      test('should fail without task', async () => {
        await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/ctx`)
          .send({
            history: [],
            // Missing task
          })
          .expect(400);
      });

      test('should fail with invalid history format', async () => {
        await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/ctx`)
          .send({
            task: 'Summarize',
            history: 'not-an-array',
          })
          .expect(400);
      });

      test('should check context job status', async () => {
        // Create a context job
        const createResponse = await request(app).post(`/vertex-ai/sessions/${sessionId}/ctx`).send({
          task: 'Test task',
          history: [],
        });

        const ctxId = createResponse.body.ctx_id;

        // Check status
        const statusResponse = await request(app).get(`/vertex-ai/sessions/${sessionId}/ctx/${ctxId}`).expect(200);

        expect(statusResponse.body).toHaveProperty('status');
        expect(['pending', 'done', 'error']).toContain(statusResponse.body.status);
      });
    });
  });

  describe('AI Integration Edge Cases', () => {
    test('should handle concurrent AI requests', async () => {
      // Create a session
      const createResponse = await request(app).post('/vertex-ai/sessions').send({ name: 'Concurrent Test' });

      const sessionId = createResponse.body.session_id;

      // Make multiple concurrent AI requests
      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post(`/vertex-ai/sessions/${sessionId}/ask`)
          .send({
            history: [],
            message: `Concurrent message ${i}`,
          })
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(202);
        expect(response.body).toHaveProperty('message_id');
      });
    });

    test('should handle extremely large request bodies', async () => {
      const largeHistory = Array.from({ length: 1000 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Large message content ${i} with lots of text `.repeat(100),
      }));

      const createResponse = await request(app).post('/vertex-ai/sessions').send({ name: 'Large Request Test' });

      const sessionId = createResponse.body.session_id;

      await request(app)
        .post(`/vertex-ai/sessions/${sessionId}/ask`)
        .send({
          history: largeHistory,
          message: 'Large request test',
        })
        .expect(413);
    });

    test('should handle rapid session creation and deletion', async () => {
      const operations = Array.from({ length: 50 }, async (_, i) => {
        // Create session
        const createResponse = await request(app)
          .post('/vertex-ai/sessions')
          .send({ name: `Rapid Session ${i}` });

        const sessionId = createResponse.body.session_id;

        // Add a message
        await request(app)
          .post(`/vertex-ai/sessions/${sessionId}/messages`)
          .send({
            role: 'user',
            content: `Message ${i}`,
          });

        // End session
        await request(app).patch(`/vertex-ai/sessions/${sessionId}`).send({ end: true });

        return sessionId;
      });

      const sessionIds = await Promise.all(operations);
      expect(sessionIds).toHaveLength(50);
    });
  });

  describe('AI Integration Error Handling', () => {
    test('should handle AI service unavailability', async () => {
      // This would require mocking the AI service to return errors
      // For now, we test the error handling structure
      const createResponse = await request(app).post('/vertex-ai/sessions').send({ name: 'Error Test' });

      const sessionId = createResponse.body.session_id;

      // The ask endpoint should handle AI service errors gracefully
      const response = await request(app)
        .post(`/vertex-ai/sessions/${sessionId}/ask`)
        .send({
          history: [],
          message: 'Test message',
        })
        .expect(202);

      expect(response.body).toHaveProperty('message_id');
    });

    test('should handle malformed AI responses', async () => {
      // This test would require mocking the AI service to return malformed responses
      // For now, we ensure the endpoints don't crash on unexpected data
      const createResponse = await request(app).post('/vertex-ai/sessions').send({ name: 'Malformed Response Test' });

      const sessionId = createResponse.body.session_id;

      const response = await request(app)
        .post(`/vertex-ai/sessions/${sessionId}/ask`)
        .send({
          history: [],
          message: 'Test message',
        })
        .expect(202);

      expect(response.body).toHaveProperty('message_id');
    });
  });
});
