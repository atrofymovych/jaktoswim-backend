const express = require('express');
const mongoose = require('mongoose');
const permissionCacheService = require('../services/permissionCacheService');
const { asyncRoute } = require('../_utils/network/asyncRoute');

const router = express.Router();

async function checkPermission(req, objectType, action) {
  // Для публичных запросов права не проверяем
  const isPublicRequest = req.originalUrl?.startsWith('/public/proxy') || req.path?.startsWith('/public/proxy');
  if (isPublicRequest) {
    return; // Публичные запросы не требуют проверки прав
  }

  const { ObjectPermission } = req.models;
  const { activeOrgId } = req;
  const userId = req.auth()?.userId;

  if (!userId) {
    throw { status: 403, message: 'Forbidden: authentication required' };
  }

  const role = await permissionCacheService.getUserRole(req.models, userId, activeOrgId);

  if (!role) {
    throw { status: 403, message: 'Forbidden: role is not assigned' };
  }

  const allowed = await permissionCacheService.checkObjectPermission(
    req.models,
    activeOrgId,
    objectType,
    role,
    action
  );

  if (!allowed) {
    throw { status: 403, message: `Forbidden: role ${role} cannot ${action} ${objectType}` };
  }
}

function parseQueryParam(param) {
  if (!param) return null;
  if (typeof param === 'object') return param;
  if (typeof param === 'string') {
    try {
      return JSON.parse(param);
    } catch {
      return param;
    }
  }
  return param;
}

async function getProxyObjectsLogic(req, type) {
  const { DAOObject } = req.models;
  
  // Ensure type is defined - try multiple sources
  if (!type) {
    type = req.params?.type || req.proxyConfig?.type;
  }
  if (!type) {
    throw { status: 400, message: 'Type parameter is required' };
  }
  
  // Парсим query параметры
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
  const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
  const dataFilter = parseQueryParam(req.query.dataFilter);
  const sortBy = parseQueryParam(req.query.sortBy);

  const dbFilter = { 
    $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
    type: type // Автоматически подставляем type из URL
  };



  const sortOptions = sortBy || { createdAt: -1 };
  const sortField = Object.keys(sortOptions)[0];
  const sortOrder = sortOptions[sortField] === -1 ? -1 : 1;

  // Build sort object with secondary sort by _id for stable pagination
  const sortObject = { [sortField]: sortOrder, _id: sortOrder };

  if (!dataFilter || typeof dataFilter !== 'object' || Object.keys(dataFilter).length === 0) {
    return await DAOObject.find(dbFilter)
      .sort(sortObject)
      .skip(skip)
      .limit(limit)
      .lean();
  }

  // Fallback to in-memory filtering for complex dataFilter queries
  let allObjects = await DAOObject.find(dbFilter).lean();

  allObjects = allObjects.filter((item) => {
    if (typeof item.data !== 'string') {
      // If dataFilter is provided, filter out items without string data
      // Otherwise, include them (they'll be returned with data: null)
      return !dataFilter || Object.keys(dataFilter).length === 0;
    }

    let parsedData;
    try {
      parsedData = JSON.parse(item.data);
    } catch (e) {
      console.error(`[!] Corrupted JSON: ${e}`);
      // If dataFilter is provided, filter out corrupted JSON
      // Otherwise, include it (it will be returned with data: null)
      return !dataFilter || Object.keys(dataFilter).length === 0;
    }

    for (const key in dataFilter) {
      if (parsedData[key] != dataFilter[key]) {
        return false;
      }
    }

    return true;
  });

  allObjects.sort((a, b) => {
    if (a[sortField] > b[sortField]) return sortOrder;
    if (a[sortField] < b[sortField]) return -sortOrder;
    // Secondary sort by _id for stable pagination
    const aId = a._id ? a._id.toString() : '';
    const bId = b._id ? b._id.toString() : '';
    if (aId > bId) return sortOrder;
    if (aId < bId) return -sortOrder;
    return 0;
  });

  return allObjects.slice(skip, skip + limit);
}

// GET /proxy/:type/:id - получить объект по ID (must be before router.get('/'))
router.get('/:id', asyncRoute(async (req, res) => {
  try {
    const { DAOObject } = req.models;
    const type = req.params?.type || req.proxyConfig?.type;
    const { id } = req.params;
    if (!type) {
      return res.status(400).json({ error: 'Type parameter is required' });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid ObjectId' });
    }

    const obj = await DAOObject.findOne({
      _id: id,
      type: type,
      $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
    }).lean();

    if (!obj) {
      return res.status(404).json({ error: 'Object not found' });
    }

    // Парсим data для ответа
    let parsedData;
    try {
      parsedData = JSON.parse(obj.data);
    } catch (e) {
      console.error(`[!] Corrupted JSON in object ${obj._id}: ${e}`);
      parsedData = null;
    }
    const result = { ...obj, data: parsedData };

    res.status(200).json({ object: result });
  } catch (err) {
    console.error('🛑  GET /proxy/:type/:id failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}));

// GET /proxy/:type - получить все объекты типа
router.get('/', asyncRoute(async (req, res) => {
  try {
    // Get type from params (set by app.use('/proxy/:type', ...)) or from proxyConfig (set by validateProxyType)
    const type = req.params?.type || req.proxyConfig?.type;
    if (!type) {
      return res.status(400).json({ error: 'Type parameter is required' });
    }
    
    const objects = await getProxyObjectsLogic(req, type);
    
    // Парсим data из JSON строки
    const result = objects.map((item) => {
      try {
        return { ...item, data: JSON.parse(item.data) };
      } catch {
        return { ...item, data: null };
      }
    });

    res.status(200).json({ objects: result });
  } catch (err) {
    console.error('🛑  GET /proxy/:type failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}));

// POST /proxy/:type - создать объект
router.post('/', asyncRoute(async (req, res) => {
  try {
    const { DAOObject } = req.models;
    const type = req.params?.type || req.proxyConfig?.type;
    if (!type) {
      return res.status(400).json({ error: 'Type parameter is required' });
    }
    const { data, id } = req.body;

    if (typeof data !== 'object' || data === null) {
      return res.status(400).json({ error: 'Field "data" must be an object' });
    }

    await checkPermission(req, type, 'CREATE');

    const userId = req.auth()?.userId;
    const metadata = {
      userId: userId || null,
      orgId: req.activeOrgId,
      source: req.source || (req.originalUrl?.startsWith('/public/proxy') ? 'public_proxy' : 'proxy'),
    };

    const obj = await DAOObject.findOneAndUpdate(
      { _id: id && mongoose.isValidObjectId(id) ? id : new mongoose.Types.ObjectId() },
      {
        $set: {
          type,
          data: JSON.stringify(data),
          metadata,
        },
        $unset: { deleted_at: '' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // Парсим data для ответа
    let parsedData;
    try {
      parsedData = JSON.parse(obj.data);
    } catch (e) {
      console.error(`[!] Corrupted JSON in object ${obj._id}: ${e}`);
      parsedData = null;
    }
    const result = { ...obj, data: parsedData };

    res.status(200).json({ status: 'object_added', object: result });
  } catch (err) {
    console.error('🛑  POST /proxy/:type failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}));


// PUT /proxy/:type/:id - обновить объект
router.put('/:id', asyncRoute(async (req, res) => {
  try {
    const { DAOObject } = req.models;
    const type = req.params?.type || req.proxyConfig?.type;
    const { id } = req.params;
    if (!type) {
      return res.status(400).json({ error: 'Type parameter is required' });
    }
    const { data } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid ObjectId' });
    }

    if (data === undefined || typeof data !== 'object' || data === null) {
      return res.status(400).json({ error: 'Field "data" must be an object' });
    }

    const existing = await DAOObject.findOne({
      _id: id,
      type: type,
    }).lean();

    if (!existing) {
      return res.status(404).json({ error: 'Object not found' });
    }

    await checkPermission(req, type, 'UPDATE');

    const userId = req.auth()?.userId;
    const metadata = {
      userId: userId || null,
      orgId: req.activeOrgId,
      source: req.source || (req.originalUrl?.startsWith('/public/proxy') ? 'public_proxy' : 'proxy'),
    };

    const updatedObject = await DAOObject.findByIdAndUpdate(
      id,
      { 
        $set: {
          data: JSON.stringify(data),
          metadata,
        }
      },
      { new: true }
    ).lean();

    // Парсим data для ответа
    let parsedData;
    try {
      parsedData = JSON.parse(updatedObject.data);
    } catch (e) {
      console.error(`[!] Corrupted JSON in object ${updatedObject._id}: ${e}`);
      parsedData = null;
    }
    const result = { ...updatedObject, data: parsedData };

    res.status(200).json({ status: 'object_updated', object: result });
  } catch (err) {
    console.error('🛑  PUT /proxy/:type/:id failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}));

// DELETE /proxy/:type/:id - удалить объект
router.delete('/:id', asyncRoute(async (req, res) => {
  try {
    const { DAOObject } = req.models;
    const type = req.params?.type || req.proxyConfig?.type;
    const { id } = req.params;
    if (!type) {
      return res.status(400).json({ error: 'Type parameter is required' });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid ObjectId' });
    }

    const existing = await DAOObject.findOne({
      _id: id,
      type: type,
    }).lean();

    if (!existing) {
      return res.status(404).json({ error: 'Object not found' });
    }

    await checkPermission(req, type, 'ARCHIVE');

    const obj = await DAOObject.findByIdAndUpdate(
      id,
      { $set: { deleted_at: new Date() } },
      { new: true }
    ).lean();

    // Парсим data для ответа
    let parsedData = null;
    if (obj.data) {
      try {
        parsedData = JSON.parse(obj.data);
      } catch (e) {
        console.error(`[!] Corrupted JSON in object ${obj._id}: ${e}`);
      }
    }
    const result = { ...obj, data: parsedData };

    res.status(200).json({ status: 'object_deleted', object: result });
  } catch (err) {
    console.error('🛑  DELETE /proxy/:type/:id failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}));

module.exports = router;

