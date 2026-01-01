const router = require('express').Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const { createCacheMiddleware } = require('../../middlewares/cacheMiddleware');
const OpenAI = require('openai');
const { trackAiSession, trackAiMessage, trackAiResponseTime } = require('../../prometheus');
const { getOpenAiCredsForOrg } = require('../../_utils/ai/getOpenAiCredsForOrg');

const AI_CONFIG = {
  defaultModel: 'gpt-4o',
  defaultSystemPrompt: process.env.AI_SYSTEM_PROMPT || '',
};


const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));
const OID = (v) => new mongoose.Types.ObjectId(String(v));
const toInt = (v, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

function getDAO(req) {
  const { DAOAiObject } = req.models || {};
  if (!DAOAiObject) throw new Error('DAOAiObject model missing');
  return DAOAiObject;
}

async function callOpenAIChat({ orgId, model, systemPrompt, history = [], message }) {
  const startTime = Date.now();

  try {
    const creds = getOpenAiCredsForOrg(orgId);
    const openai = new OpenAI({
      apiKey: creds.apiKey,
      baseURL: creds.baseURL,
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

    const response = await openai.chat.completions.create({
      model: model || creds.model || AI_CONFIG.defaultModel,
      messages,
      temperature: 0.7,
      max_tokens: 4000,
    });

    const content = response.choices?.[0]?.message?.content || '';

    // Track AI response time safely
    try {
      const duration = (Date.now() - startTime) / 1000;
      trackAiResponseTime(orgId, 'openai', model || AI_CONFIG.defaultModel, duration);
    } catch (error) {
      console.error('Error tracking AI response time:', error.message);
    }

    return content;
  } catch (error) {
    // Track failed AI response time safely
    try {
      const duration = (Date.now() - startTime) / 1000;
      trackAiResponseTime(orgId, 'openai', model || AI_CONFIG.defaultModel, duration);
    } catch (metricsError) {
      console.error('Error tracking failed AI response time:', metricsError.message);
    }
    throw error;
  }
}

function normalizeHistory(arr = []) {
  return arr.map((m) => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: String(m?.content ?? ''),
    created_at: m?.created_at || new Date(0).toISOString(),
  }));
}

// ========================= SESSIONS =========================

router.post('/sessions', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const userId = req.auth()?.userId;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { name, system_prompt } = req.body || {};
    const doc = await DAOAiObject.create({
      type: 'Session',
      data: {
        version: 1,
        user_id: String(userId),
        name: typeof name === 'string' ? name : null,
        system_prompt: typeof system_prompt === 'string' ? system_prompt : null,
        session_start: new Date().toISOString(),
        session_end: null,
      },
      metadata: { orgId: req.activeOrgId, userId, source: 'ai-router' },
      deleted_at: null,
      links: [],
    });

    res.status(201).json({ session_id: String(doc._id) });
  } catch (e) {
    console.error('POST /sessions error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.patch('/sessions/:sessionId', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;
    if (!isOid(sessionId)) return res.status(400).json({ error: 'bad_session_id' });

    const { name, system_prompt, end } = req.body || {};
    const set = {};
    if (typeof name === 'string') set['data.name'] = name;
    if (typeof system_prompt === 'string') set['data.system_prompt'] = system_prompt;
    if (end === true) set['data.session_end'] = new Date().toISOString();
    if (!Object.keys(set).length) return res.status(400).json({ error: 'nothing_to_update' });

    const updated = await DAOAiObject.findOneAndUpdate(
      { _id: OID(sessionId), type: 'Session', deleted_at: null },
      { $set: set },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ error: 'not_found' });

    res.json({
      session_id: String(updated._id),
      name: updated.data?.name ?? null,
      system_prompt: updated.data?.system_prompt ?? null,
      user_id: updated.data?.user_id ?? null,
      session_start: updated.data?.session_start ?? updated.createdAt,
      session_end: updated.data?.session_end ?? null,
    });
  } catch (e) {
    console.error('PATCH /sessions/:sessionId error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;
    if (!isOid(sessionId)) return res.status(400).json({ error: 'bad_session_id' });

    const s = await DAOAiObject.findOne({ _id: OID(sessionId), type: 'Session', deleted_at: null }).lean();
    if (!s) return res.status(404).json({ error: 'not_found' });

    res.json({
      session_id: String(s._id),
      name: s.data?.name ?? null,
      system_prompt: s.data?.system_prompt ?? null,
      user_id: s.data?.user_id ?? null,
      session_start: s.data?.session_start ?? s.createdAt,
      session_end: s.data?.session_end ?? null,
    });
  } catch (e) {
    console.error('GET /sessions/:sessionId error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/sessions', createCacheMiddleware({
  cacheType: 'ai',
  shouldCache: (req) =>
    // Cache sessions list, but not if include_last=true (real-time data)
    req.query.include_last !== 'true'

}), async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const userId = req.auth()?.userId;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const limit = Math.min(toInt(req.query.limit, 50), 500);
    const afterRaw = req.query.after ? String(req.query.after) : null;
    if (afterRaw && !isOid(afterRaw)) return res.status(400).json({ error: 'bad_after_cursor' });
    const afterCond = afterRaw ? { _id: { $lt: OID(afterRaw) } } : {};
    const includeLast = String(req.query.include_last || '').toLowerCase() === 'true';

    // Optimize: Use single aggregation pipeline for better performance
    const pipeline = [
      {
        $match: {
          type: 'Session',
          deleted_at: null,
          'data.user_id': String(userId),
          ...afterCond,
        }
      },
      { $sort: { _id: -1 } },
      { $limit: limit }
    ];

    // Add last message lookup if requested
    if (includeLast) {
      pipeline.push(
        {
          $lookup: {
            from: 'daoaiobjects',
            let: { sessionId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$type', 'Message'] },
                      { $eq: ['$deleted_at', null] },
                      { $eq: ['$data.session_id', { $toString: '$$sessionId' }] }
                    ]
                  }
                }
              },
              { $sort: { createdAt: -1, _id: -1 } },
              { $limit: 1 },
              {
                $project: {
                  _id: 1,
                  role: '$data.role',
                  content: '$data.content',
                  status: '$data.status',
                  assistant_id: '$data.assistant_id',
                  created_at: '$createdAt',
                }
              }
            ],
            as: 'lastMessage'
          }
        }
      );
    }

    const sessions = await DAOAiObject.aggregate(pipeline);

    res.json({
      items: sessions.map((s) => ({
        session_id: String(s._id),
        name: s.data?.name ?? null,
        system_prompt: s.data?.system_prompt ?? null,
        session_start: s.data?.session_start ?? s.createdAt,
        session_end: s.data?.session_end ?? null,
        last_message: includeLast ? (s.lastMessage?.[0] ?? null) : undefined,
      })),
      next_cursor: sessions.length === limit ? String(sessions[sessions.length - 1]._id) : null,
    });
  } catch (e) {
    console.error('GET /sessions error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ========================= MESSAGES =========================

router.post('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;
    if (!isOid(sessionId)) return res.status(400).json({ error: 'bad_session_id' });

    const { role, content, in_response_to, assistant_id, status } = req.body || {};
    if (role !== 'user' && role !== 'assistant') return res.status(400).json({ error: 'bad_role' });
    if (typeof content !== 'string') return res.status(400).json({ error: 'content_required' });
    if (in_response_to && !isOid(in_response_to)) return res.status(400).json({ error: 'bad_in_response_to' });

    const doc = await DAOAiObject.create({
      type: 'Message',
      data: {
        version: 1,
        session_id: String(sessionId),
        role,
        content,
        in_response_to: in_response_to ? String(in_response_to) : null,
        assistant_id: assistant_id ? String(assistant_id) : null,
        status: status ? String(status) : null,
      },
      metadata: { orgId: req.activeOrgId, userId: req.auth()?.userId || 'system', source: 'ai-router' },
      deleted_at: null,
      links: [],
    });

    res.status(201).json({ message_id: String(doc._id) });
  } catch (e) {
    console.error('POST /sessions/:sessionId/messages error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/sessions/:sessionId/messages', createCacheMiddleware({
  cacheType: 'ai',
  shouldCache: (req) =>
    // Cache messages for a session, but not if there are real-time filters
    !req.query.real_time

}), async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;
    if (!isOid(sessionId)) return res.status(400).json({ error: 'bad_session_id' });

    const limit = Math.min(toInt(req.query.limit, 50), 500);
    const afterRaw = req.query.after ? String(req.query.after) : null;
    if (afterRaw && !isOid(afterRaw)) return res.status(400).json({ error: 'bad_after_cursor' });
    const order = req.query.order === 'asc' ? 1 : -1;
    const cursorOp = order === -1 ? '$lt' : '$gt';
    const after = afterRaw ? { _id: { [cursorOp]: OID(afterRaw) } } : {};

    const docs = await DAOAiObject.find({
      type: 'Message',
      deleted_at: null,
      'data.session_id': String(sessionId),
      ...after,
    })
      .sort({ _id: order })
      .limit(limit)
      .lean();

    const nextCursor = docs.length === limit ? String(docs[docs.length - 1]._id) : null;

    res.json({
      items: docs.map((d) => ({
        id: String(d._id),
        role: d.data?.role || null,
        content: d.data?.content ?? null,
        in_response_to: d.data?.in_response_to ?? null,
        status: d.data?.status ?? null,
        assistant_id: d.data?.assistant_id ?? null,
        created_at: d.createdAt,
      })),
      next_cursor: nextCursor,
      order: order === 1 ? 'asc' : 'desc',
    });
  } catch (e) {
    console.error('GET /sessions/:sessionId/messages error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/sessions/:sessionId/messages/:messageId', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId, messageId } = req.params;

    if (!isOid(sessionId)) return res.status(400).json({ error: 'bad_session_id' });
    if (!isOid(messageId)) return res.status(400).json({ error: 'bad_message_id' });

    const d = await DAOAiObject.findOne({
      _id: OID(messageId),
      type: 'Message',
      deleted_at: null,
      'data.session_id': String(sessionId),
    }).lean();

    if (!d) return res.status(404).json({ error: 'not_found' });

    res.json({
      id: String(d._id),
      session_id: d.data?.session_id ?? null,
      role: d.data?.role ?? null,
      content: d.data?.content ?? null,
      in_response_to: d.data?.in_response_to ?? null,
      status: d.data?.status ?? null,
      assistant_id: d.data?.assistant_id ?? null,
      created_at: d.createdAt,
    });
  } catch (e) {
    console.error('GET /sessions/:sessionId/messages/:messageId error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.delete('/sessions/:sessionId/messages/:messageId', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId, messageId } = req.params;

    if (!isOid(sessionId)) return res.status(400).json({ error: 'bad_session_id' });
    if (!isOid(messageId)) return res.status(400).json({ error: 'bad_message_id' });

    const upd = await DAOAiObject.updateOne(
      {
        _id: OID(messageId),
        type: 'Message',
        deleted_at: null,
        'data.session_id': String(sessionId),
      },
      { $set: { deleted_at: new Date() } }
    );

    if (upd.matchedCount === 0) return res.status(404).json({ error: 'not_found' });

    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /sessions/:sessionId/messages/:messageId error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/sessions/:sessionId/ask', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;
    if (!isOid(sessionId)) return res.status(400).json({ error: 'bad_session_id' });

    const { history, message, model, system_prompt } = req.body || {};
    if (!Array.isArray(history) || typeof message !== 'string') {
      return res.status(400).json({ error: 'history(array) and message(string) are required' });
    }

    const hist = normalizeHistory(history);

    // save user message
    const userDoc = await DAOAiObject.create({
      type: 'Message',
      data: {
        version: 1,
        session_id: String(sessionId),
        role: 'user',
        content: message,
        in_response_to: null,
        assistant_id: null,
        status: null,
      },
      metadata: { orgId: req.activeOrgId, userId: req.auth()?.userId || 'system', source: 'ai-router' },
      deleted_at: null,
      links: [],
    });

    const pending = await DAOAiObject.create({
      type: 'Message',
      data: {
        version: 1,
        session_id: String(sessionId),
        role: 'assistant',
        content: null,
        in_response_to: String(userDoc._id),
        assistant_id: null,
        status: 'PENDING',
      },
      metadata: { orgId: req.activeOrgId, userId: req.auth()?.userId || 'system', source: 'ai-router' },
      deleted_at: null,
      links: [],
    });

    setImmediate(async () => {
      try {
        // Get session to check for session-level system prompt
        const session = await DAOAiObject.findOne({ _id: OID(sessionId), type: 'Session', deleted_at: null }).lean();
        const sessionSystemPrompt = session?.data?.system_prompt;

        // Priority: request system_prompt > session system_prompt > global default
        const finalSystemPrompt = typeof system_prompt === 'string'
          ? system_prompt
          : sessionSystemPrompt || AI_CONFIG.defaultSystemPrompt;

        const answer = await callOpenAIChat({
          orgId: req.activeOrgId,
          model: model || AI_CONFIG.defaultModel,
          systemPrompt: finalSystemPrompt,
          history: hist.concat([{ role: 'user', content: message }]),
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

router.post('/sessions/:sessionId/ctx', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId } = req.params;
    if (!isOid(sessionId)) return res.status(400).json({ error: 'bad_session_id' });

    const { task, history, model, system_prompt } = req.body || {};
    if (typeof task !== 'string' || !Array.isArray(history)) {
      return res.status(400).json({ error: 'task(string) and history(array) are required' });
    }

    const hist = normalizeHistory(history);
    const history_hash = `sha256:${crypto.createHash('sha256').update(JSON.stringify(hist)).digest('hex')}`;

    const job = await DAOAiObject.create({
      type: 'CtxJob',
      data: {
        version: 1,
        session_id: String(sessionId),
        task: String(task),
        history_hash,
        status: 'pending',
        result: null,
        error: null,
        model: model || AI_CONFIG.defaultModel,
      },
      metadata: { orgId: req.activeOrgId, userId: req.auth()?.userId || 'system', source: 'ai-router' },
      deleted_at: null,
      links: [],
    });

    setImmediate(async () => {
      try {
        // Get session to check for session-level system prompt
        const session = await DAOAiObject.findOne({ _id: OID(sessionId), type: 'Session', deleted_at: null }).lean();
        const sessionSystemPrompt = session?.data?.system_prompt;

        const defaultCtxPrompt = [
          'You are a careful assistant.',
          'If the task asks for JSON — return ONLY valid JSON with no extra text.',
          'Do not invent facts; unknown fields may be null/empty.',
        ].join('\n');

        // Priority: request system_prompt > session system_prompt > default ctx prompt
        const finalSystemPrompt = typeof system_prompt === 'string'
          ? system_prompt
          : sessionSystemPrompt || defaultCtxPrompt;

        const result = await callOpenAIChat({
          orgId: req.activeOrgId,
          model: model || AI_CONFIG.defaultModel,
          systemPrompt: finalSystemPrompt,
          history: hist,
          message: task,
        });

        await DAOAiObject.updateOne(
          { _id: job._id, type: 'CtxJob' },
          { $set: { 'data.status': 'done', 'data.result': result, updatedAt: new Date() } }
        );
      } catch (err) {
        await DAOAiObject.updateOne(
          { _id: job._id, type: 'CtxJob' },
          { $set: { 'data.status': 'error', 'data.error': err.message, updatedAt: new Date() } }
        );
        console.error('ctx worker failed:', err);
      }
    });

    return res.status(202).json({ ctx_id: String(job._id) });
  } catch (e) {
    console.error('POST /sessions/:sessionId/ctx error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/sessions/:sessionId/ctx/:ctxId', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);
    const { sessionId, ctxId } = req.params;
    if (!isOid(sessionId)) return res.status(400).json({ error: 'bad_session_id' });
    if (!isOid(ctxId)) return res.status(400).json({ error: 'bad_ctx_id' });

    const job = await DAOAiObject.findOne({
      _id: OID(ctxId),
      type: 'CtxJob',
      deleted_at: null,
      'data.session_id': String(sessionId),
    }).lean();

    if (!job) return res.status(404).json({ error: 'not_found' });

    const st = job.data?.status;
    if (st === 'pending') return res.json({ status: 'pending' });
    if (st === 'done') return res.json({ status: 'done', result: job.data?.result });
    if (st === 'error') return res.json({ status: 'error', error: job.data?.error });

    return res.json({ status: 'pending' });
  } catch (e) {
    console.error('GET /sessions/:sessionId/ctx/:ctxId error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/messages', async (req, res) => {
  try {
    const DAOAiObject = getDAO(req);

    const limit = Math.min(toInt(req.query.limit, 100), 1000);
    const order = req.query.order === 'asc' ? 1 : -1;
    const cursorOp = order === -1 ? '$lt' : '$gt';

    const afterRaw = req.query.after ? String(req.query.after) : null;
    if (afterRaw && !isOid(afterRaw)) return res.status(400).json({ error: 'bad_after_cursor' });

    const sessionId = req.query.session_id ? String(req.query.session_id) : null;
    if (sessionId && !isOid(sessionId)) return res.status(400).json({ error: 'bad_session_id' });

    const query = {
      type: 'Message',
      deleted_at: null,
      ...(sessionId ? { 'data.session_id': sessionId } : {}),
      ...(afterRaw ? { _id: { [cursorOp]: OID(afterRaw) } } : {}),
    };

    const docs = await DAOAiObject.find(query).sort({ _id: order }).limit(limit).lean();
    const nextCursor = docs.length === limit ? String(docs[docs.length - 1]._id) : null;

    res.json({
      items: docs.map((d) => ({
        id: String(d._id),
        session_id: d.data?.session_id ?? null,
        role: d.data?.role || null,
        content: d.data?.content ?? null,
        in_response_to: d.data?.in_response_to ?? null,
        status: d.data?.status ?? null,
        assistant_id: d.data?.assistant_id ?? null,
        created_at: d.createdAt,
      })),
      next_cursor: nextCursor,
      order: order === 1 ? 'asc' : 'desc',
    });
  } catch (e) {
    console.error('GET /messages error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
