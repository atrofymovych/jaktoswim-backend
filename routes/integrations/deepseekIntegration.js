const router = require('express').Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const { createCacheMiddleware } = require('../../middlewares/cacheMiddleware');
const OpenAI = require('openai');
const { trackAiSession, trackAiMessage, trackAiResponseTime } = require('../../prometheus');

const AI_CONFIG = {
  defaultModel: 'deepseek-chat',
  defaultSystemPrompt: process.env.AI_SYSTEM_PROMPT || '',
};

const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));
const OID = (v) => new mongoose.Types.ObjectId(String(v));

function getDAO(req) {
  const { DAOAiObject } = req.models;
  return DAOAiObject;
}

async function callDeepSeekChat({ orgId, model, systemPrompt, history = [], message }) {
  const startTime = Date.now();

  try {
    // Get DeepSeek credentials for the organization
    const apiKey = process.env[`${orgId}_DEEPSEEK_API_KEY`];
    const baseURL = process.env[`${orgId}_DEEPSEEK_BASE_URL`] || 'https://api.deepseek.com/v1';
    const defaultModel = process.env[`${orgId}_DEEPSEEK_MODEL`] || AI_CONFIG.defaultModel;

    if (!apiKey) {
      throw new Error(`DeepSeek API key not found for ORG_ID=${orgId}`);
    }

    const deepseek = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
    });

    const messages = [];

    // Add system prompt if provided
    if (systemPrompt && String(systemPrompt).trim().length) {
      messages.push({
        role: 'system',
        content: String(systemPrompt),
      });
    }

    // Add conversation history
    for (const m of history) {
      messages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      });
    }

    // Add current message
    if (message) {
      messages.push({
        role: 'user',
        content: String(message),
      });
    }

    // Log detailed request to AI
    console.log('=== DEEPSEEK AI REQUEST ===');
    console.log('OrgId:', orgId);
    console.log('Model:', model || defaultModel);
    console.log('Temperature:', 0.1);
    console.log('Messages count:', messages.length);
    console.log('Messages:');
    messages.forEach((msg, index) => {
      console.log(`[${index}] Role: ${msg.role}`);
      console.log(`[${index}] Content: ${msg.content}`);
      console.log(`[${index}] Content length: ${msg.content.length} chars`);
      console.log('---');
    });
    console.log('=== END DEEPSEEK REQUEST ===');

    const response = await deepseek.chat.completions.create({
      model: model || defaultModel,
      messages,
      temperature: 0.1,
    });

    const content = response.choices?.[0]?.message?.content || '';

    // Log AI response
    console.log('=== DEEPSEEK AI RESPONSE ===');
    console.log('Response length:', content.length, 'chars');
    console.log('Response content:', content);
    console.log('=== END DEEPSEEK RESPONSE ===');

    // Track AI response time safely
    try {
      const duration = (Date.now() - startTime) / 1000;
      trackAiResponseTime(orgId, 'deepseek', model || defaultModel, duration);
    } catch (error) {
      console.error('Error tracking AI response time:', error.message);
    }

    return content;
  } catch (error) {
    // Track failed AI response time safely
    try {
      const duration = (Date.now() - startTime) / 1000;
      trackAiResponseTime(orgId, 'deepseek', model || AI_CONFIG.defaultModel, duration);
    } catch (metricsError) {
      console.error('Error tracking failed AI response time:', metricsError.message);
    }
    throw error;
  }
}

function normalizeHistory(arr = []) {
  return Array.isArray(arr) ? arr.filter((m) => m && typeof m === 'object' && m.role && m.content) : [];
}

// Cache middleware for sessions
const sessionCache = createCacheMiddleware({
  ttl: 300, // 5 minutes
  keyGenerator: (req) => `deepseek-session-${req.params.sessionId}`,
});

// Cache middleware for messages
const messageCache = createCacheMiddleware({
  ttl: 600, // 10 minutes
  keyGenerator: (req) => `deepseek-message-${req.params.messageId}`,
});

// Create a new AI session
router.post('/sessions', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { name, system_prompt, metadata = {} } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name_required' });
    }

    const session = await DAOAiObject.create({
      type: 'Session',
      data: {
        name: String(name).trim(),
        system_prompt: typeof system_prompt === 'string' ? system_prompt : null,
        metadata: typeof metadata === 'object' ? metadata : {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      metadata: { orgId: req.activeOrgId, userId: req.auth?.userId, source: 'deepseek-router' },
      deleted_at: null,
      links: [],
    });

    // Track AI session creation
    try {
      trackAiSession(req.activeOrgId, 'deepseek', 'created');
    } catch (error) {
      console.error('Error tracking AI session:', error.message);
    }

    return res.status(201).json({
      session_id: String(session._id),
      name: session.data.name,
      system_prompt: session.data.system_prompt,
      metadata: session.data.metadata,
      created_at: session.data.created_at,
    });
  } catch (e) {
    console.error('POST /sessions error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Get session details
router.get('/sessions/:sessionId', sessionCache, async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;

    if (!isOid(sessionId)) {
      return res.status(400).json({ error: 'invalid_session_id' });
    }

    const session = await DAOAiObject.findOne({
      _id: OID(sessionId),
      type: 'Session',
      deleted_at: null,
    }).lean();

    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    return res.json({
      session_id: String(session._id),
      name: session.data.name,
      system_prompt: session.data.system_prompt,
      metadata: session.data.metadata,
      created_at: session.data.created_at,
      updated_at: session.data.updated_at,
    });
  } catch (e) {
    console.error('GET /sessions/:sessionId error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Update session
router.put('/sessions/:sessionId', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;
    const { name, system_prompt, metadata } = req.body;

    if (!isOid(sessionId)) {
      return res.status(400).json({ error: 'invalid_session_id' });
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (typeof name === 'string' && name.trim().length > 0) {
      updateData.name = name.trim();
    }
    if (typeof system_prompt === 'string') {
      updateData.system_prompt = system_prompt;
    }
    if (typeof metadata === 'object') {
      updateData.metadata = metadata;
    }

    const session = await DAOAiObject.findOneAndUpdate(
      { _id: OID(sessionId), type: 'Session', deleted_at: null },
      { $set: { 'data': updateData, updatedAt: new Date() } },
      { new: true, lean: true }
    );

    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    return res.json({
      session_id: String(session._id),
      name: session.data.name,
      system_prompt: session.data.system_prompt,
      metadata: session.data.metadata,
      created_at: session.data.created_at,
      updated_at: session.data.updated_at,
    });
  } catch (e) {
    console.error('PUT /sessions/:sessionId error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Delete session
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;

    if (!isOid(sessionId)) {
      return res.status(400).json({ error: 'invalid_session_id' });
    }

    const result = await DAOAiObject.updateOne(
      { _id: OID(sessionId), type: 'Session', deleted_at: null },
      { $set: { deleted_at: new Date(), updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    // Also soft delete all messages in this session
    await DAOAiObject.updateMany(
      { 'data.session_id': String(sessionId), type: 'Message', deleted_at: null },
      { $set: { deleted_at: new Date(), updatedAt: new Date() } }
    );

    return res.status(204).send();
  } catch (e) {
    console.error('DELETE /sessions/:sessionId error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// List sessions
router.get('/sessions', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { limit = 50, offset = 0 } = req.query;

    const sessions = await DAOAiObject.find({
      type: 'Session',
      deleted_at: null,
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    return res.json({
      sessions: sessions.map((session) => ({
        session_id: String(session._id),
        name: session.data.name,
        system_prompt: session.data.system_prompt,
        metadata: session.data.metadata,
        created_at: session.data.created_at,
        updated_at: session.data.updated_at,
      })),
      total: sessions.length,
    });
  } catch (e) {
    console.error('GET /sessions error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Get session messages
router.get('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    if (!isOid(sessionId)) {
      return res.status(400).json({ error: 'invalid_session_id' });
    }

    const messages = await DAOAiObject.find({
      type: 'Message',
      'data.session_id': String(sessionId),
      deleted_at: null,
    })
      .sort({ createdAt: 1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    return res.json({
      messages: messages.map((message) => ({
        message_id: String(message._id),
        role: message.data.role,
        content: message.data.content,
        status: message.data.status,
        metadata: message.data.metadata,
        created_at: message.data.created_at,
        updated_at: message.data.updated_at,
      })),
      total: messages.length,
    });
  } catch (e) {
    console.error('GET /sessions/:sessionId/messages error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Ask a question (async)
router.post('/sessions/:sessionId/ask', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;
    const { message, model, system_prompt } = req.body;

    if (!isOid(sessionId)) {
      return res.status(400).json({ error: 'invalid_session_id' });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message_required' });
    }

    // Get session to verify it exists
    const session = await DAOAiObject.findOne({
      _id: OID(sessionId),
      type: 'Session',
      deleted_at: null,
    }).lean();

    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    // Get conversation history
    const hist = await DAOAiObject.find({
      type: 'Message',
      'data.session_id': String(sessionId),
      'data.status': 'COMPLETED',
      deleted_at: null,
    })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    const history = normalizeHistory(hist.map((m) => ({ role: m.data.role, content: m.data.content })));

    // Save user message
    const userDoc = await DAOAiObject.create({
      type: 'Message',
      data: {
        session_id: String(sessionId),
        role: 'user',
        content: String(message).trim(),
        in_response_to: null,
        assistant_id: null,
        status: null,
        metadata: { model: model || AI_CONFIG.defaultModel },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      metadata: { orgId: req.activeOrgId, userId: req.auth?.userId, source: 'deepseek-router' },
      deleted_at: null,
      links: [],
    });

    // Create pending assistant message
    const pending = await DAOAiObject.create({
      type: 'Message',
      data: {
        session_id: String(sessionId),
        role: 'assistant',
        content: null,
        in_response_to: String(userDoc._id),
        assistant_id: null,
        status: 'PENDING',
        metadata: { model: model || AI_CONFIG.defaultModel },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      metadata: { orgId: req.activeOrgId, userId: req.auth?.userId, source: 'deepseek-router' },
      deleted_at: null,
      links: [],
    });

    try {
      trackAiMessage(req.activeOrgId, 'deepseek', 'user');
    } catch (error) {
      console.error('Error tracking AI message:', error.message);
    }

    setImmediate(async () => {
      try {
        // Get session to check for session-level system prompt
        const session = await DAOAiObject.findOne({ _id: OID(sessionId), type: 'Session', deleted_at: null }).lean();
        const sessionSystemPrompt = session?.data?.system_prompt;

        // Priority: request system_prompt > session system_prompt > global default
        const finalSystemPrompt = typeof system_prompt === 'string'
          ? system_prompt
          : sessionSystemPrompt || AI_CONFIG.defaultSystemPrompt;

        const answer = await callDeepSeekChat({
          orgId: req.activeOrgId,
          model: model || AI_CONFIG.defaultModel,
          systemPrompt: finalSystemPrompt,
          history: history.concat([{ role: 'user', content: message }]),
        });

        await DAOAiObject.updateOne(
          { _id: pending._id, type: 'Message' },
          { $set: { 'data.content': String(answer || ''), 'data.status': 'COMPLETED', updatedAt: new Date() } }
        );
      } catch (err) {
        await DAOAiObject.updateOne(
          { _id: pending._id, type: 'Message' },
          { $set: { 'data.content': `Error: ${err.message}`, 'data.status': 'FAILED', updatedAt: new Date() } }
        );
        console.error('ask worker failed:', err);
      }
    });

    return res.status(202).json({ message_id: String(pending._id) });
  } catch (e) {
    console.error('POST /sessions/:sessionId/ask error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Execute context-aware task
router.post('/sessions/:sessionId/ctx', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;
    const { task, model, system_prompt } = req.body;

    if (!isOid(sessionId)) {
      return res.status(400).json({ error: 'invalid_session_id' });
    }

    if (!task || typeof task !== 'string' || task.trim().length === 0) {
      return res.status(400).json({ error: 'task_required' });
    }

    // Get session
    const session = await DAOAiObject.findOne({
      _id: OID(sessionId),
      type: 'Session',
      deleted_at: null,
    }).lean();

    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    // Get conversation history
    const hist = await DAOAiObject.find({
      type: 'Message',
      'data.session_id': String(sessionId),
      'data.status': 'COMPLETED',
      deleted_at: null,
    })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    const history = normalizeHistory(hist.map((m) => ({ role: m.data.role, content: m.data.content })));

    // Save user message (context-aware task)
    const userDoc = await DAOAiObject.create({
      type: 'Message',
      data: {
        session_id: String(sessionId),
        role: 'user',
        content: task,
        in_response_to: null,
        assistant_id: null,
        status: null,
        metadata: {
          model: model || AI_CONFIG.defaultModel,
          task_type: 'context_aware'
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      metadata: { orgId: req.activeOrgId, userId: req.auth?.userId, source: 'deepseek-router' },
      deleted_at: null,
      links: [],
    });

    // Create pending assistant message (context-aware task)
    const pending = await DAOAiObject.create({
      type: 'Message',
      data: {
        session_id: String(sessionId),
        role: 'assistant',
        content: null,
        in_response_to: String(userDoc._id),
        assistant_id: null,
        status: 'PENDING',
        metadata: {
          model: model || AI_CONFIG.defaultModel,
          task_type: 'context_aware'
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      metadata: { orgId: req.activeOrgId, userId: req.auth?.userId, source: 'deepseek-router' },
      deleted_at: null,
      links: [],
    });

    setImmediate(async () => {
      try {
        const sessionSystemPrompt = session?.data?.system_prompt;
        const finalSystemPrompt = typeof system_prompt === 'string'
          ? system_prompt
          : sessionSystemPrompt || AI_CONFIG.defaultSystemPrompt;

        const answer = await callDeepSeekChat({
          orgId: req.activeOrgId,
          model: model || AI_CONFIG.defaultModel,
          systemPrompt: finalSystemPrompt,
          history: history.concat([{ role: 'user', content: task }]),
        });

        await DAOAiObject.updateOne(
          { _id: pending._id, type: 'Message' },
          { $set: { 'data.content': String(answer || ''), 'data.status': 'COMPLETED', updatedAt: new Date() } }
        );
      } catch (err) {
        await DAOAiObject.updateOne(
          { _id: pending._id, type: 'Message' },
          { $set: { 'data.content': `Error: ${err.message}`, 'data.status': 'FAILED', updatedAt: new Date() } }
        );
        console.error('context worker failed:', err);
      }
    });

    return res.status(202).json({ message_id: String(pending._id) });
  } catch (e) {
    console.error('POST /sessions/:sessionId/ctx error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Get message details
router.get('/messages/:messageId', messageCache, async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { messageId } = req.params;

    if (!isOid(messageId)) {
      return res.status(400).json({ error: 'invalid_message_id' });
    }

    const message = await DAOAiObject.findOne({
      _id: OID(messageId),
      type: 'Message',
      deleted_at: null,
    }).lean();

    if (!message) {
      return res.status(404).json({ error: 'message_not_found' });
    }

    return res.json({
      message_id: String(message._id),
      session_id: message.data.session_id,
      role: message.data.role,
      content: message.data.content,
      status: message.data.status,
      metadata: message.data.metadata,
      created_at: message.data.created_at,
      updated_at: message.data.updated_at,
    });
  } catch (e) {
    console.error('GET /messages/:messageId error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
