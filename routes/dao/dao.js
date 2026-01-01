const express = require('express');
const mongoose = require('mongoose');
const { createCacheMiddleware, cacheInvalidationMiddleware } = require('../../middlewares/cacheMiddleware');
const permissionCacheService = require('../../services/permissionCacheService');

const router = express.Router();

async function checkPermission(req, objectType, action) {
  const { ObjectPermission } = req.models;
  const { activeOrgId } = req;
  const userId = req.auth()?.userId;

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

async function getObjectsLogic(req) {
  const { ids, types, limit = 100, skip = 0, dataFilter, sortBy } = req.body;
  const { DAOObject } = req.models;

  const dbFilter = { deleted_at: { $exists: false } };
  if (ids) {
    dbFilter._id = { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) };
  }
  if (types) {
    dbFilter.type = { $in: types };
  }

  const sortOptions = sortBy || { createdAt: -1 };
  const sortField = Object.keys(sortOptions)[0];
  const sortOrder = sortOptions[sortField] === -1 ? -1 : 1;

  if (!dataFilter || typeof dataFilter !== 'object' || Object.keys(dataFilter).length === 0) {
    return await DAOObject.find(dbFilter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  // Fallback to in-memory filtering for complex dataFilter queries
  let allObjects = await DAOObject.find(dbFilter).lean();

  allObjects = allObjects.filter((item) => {
    if (typeof item.data !== 'string') return false;

    let parsedData;
    try {
      parsedData = JSON.parse(item.data);
    } catch (e) {
      console.error(`[!] Corrupted JSON: ${e}`);
      return false;
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
    return 0;
  });

  return allObjects.slice(skip, skip + limit);
}

router.post('/add-object', cacheInvalidationMiddleware(), async (req, res) => {
  try {
    const { DAOObject } = req.models;
    const { type, id, data } = req.body;

    if (!type || typeof type !== 'string') return res.status(400).json({ error: 'Field "type" must be a string' });
    if (typeof data !== 'object' || data === null)
      return res.status(400).json({ error: 'Field "data" must be an object' });

    await checkPermission(req, type, 'CREATE');

    const obj = await DAOObject.findOneAndUpdate(
      { _id: id && mongoose.isValidObjectId(id) ? id : new mongoose.Types.ObjectId() },
      {
        $set: {
          type,
          data: JSON.stringify(data),
          metadata: { userId: req.auth()?.userId, orgId: req.activeOrgId, source: req.source },
        },
        $unset: { deleted_at: '' },
        metadata: { userId: req.auth()?.userId, orgId: req.activeOrgId, source: req.source },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ status: 'object_added', object: obj });
  } catch (err) {
    console.error('🛑  add-object failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/get-objects-raw', createCacheMiddleware({
  cacheType: 'dao',
  shouldCache: (req) =>
    // Cache read-only queries, skip if there are data filters that require real-time data
    !req.body.dataFilter || Object.keys(req.body.dataFilter).length === 0

}), async (req, res) => {
  try {
    const objects = await getObjectsLogic(req);
    res.status(200).json({ objects });
  } catch (err) {
    console.error('🛑  get-objects-raw failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/get-objects-parsed', createCacheMiddleware({
  cacheType: 'dao',
  shouldCache: (req) =>
    // Cache read-only queries, skip if there are data filters that require real-time data
    !req.body.dataFilter || Object.keys(req.body.dataFilter).length === 0

}), async (req, res) => {
  try {
    const objects = await getObjectsLogic(req);
    const result = objects.map((item) => {
      try {
        return { ...item, data: JSON.parse(item.data) };
      } catch {
        return { ...item, data: null };
      }
    });
    res.status(200).json({ objects: result });
  } catch (err) {
    console.error('🛑  get-objects-parsed failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/add-object-bulk', cacheInvalidationMiddleware(), async (req, res) => {
  try {
    const { DAOObject } = req.models;
    const { objects } = req.body;

    if (!Array.isArray(objects)) {
      return res.status(400).json({ error: 'Request body must contain an "objects" array' });
    }

    const uniqueTypes = [...new Set(objects.map((o) => o.type))];
    if (uniqueTypes.includes(undefined)) {
      return res.status(400).json({ error: 'Each object in the array must have a "type" field' });
    }
    await Promise.all(uniqueTypes.map((type) => checkPermission(req, type, 'CREATE')));

    const documentsToInsert = objects.map((obj) => {
      if (!obj.type || typeof obj.type !== 'string' || typeof obj.data !== 'object' || obj.data === null) {
        throw { status: 400, message: 'Each object in array must have a valid "type" (string) and "data" (object)' };
      }
      return {
        _id: obj.id && mongoose.isValidObjectId(obj.id) ? obj.id : new mongoose.Types.ObjectId(),
        type: obj.type,
        data: JSON.stringify(obj.data),
        metadata: { userId: req.auth()?.userId, orgId: req.activeOrgId, source: req.source },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    const result = await DAOObject.insertMany(documentsToInsert, { ordered: false });

    res.status(201).json({ status: 'objects_added', count: result.length, insertedIds: result.map((d) => d._id) });
  } catch (err) {
    console.error('🛑  add-object-bulk failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/update-object', cacheInvalidationMiddleware(), async (req, res) => {
  try {
    const { DAOObject } = req.models;
    const { id, type, data } = req.body;

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Field "id" must be a valid ObjectId' });
    }
    if (data === undefined || typeof data !== 'object' || data === null) {
      return res.status(400).json({ error: 'Field "data" must be an object' });
    }

    const existing = await DAOObject.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ error: 'Object not found' });
    }

    const objectType = type || existing.type;

    await checkPermission(req, objectType, 'UPDATE');

    const updatePayload = {
      data: JSON.stringify(data),
      metadata: { userId: req.auth()?.userId, orgId: req.activeOrgId, source: req.source },
    };
    if (type) {
      updatePayload.type = type;
    }

    const updatedObject = await DAOObject.findByIdAndUpdate(id, { $set: updatePayload }, { new: true }).lean();

    res.json({ status: 'object_updated', object: updatedObject });
  } catch (err) {
    console.error('🛑  update-object failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/del-object', async (req, res) => {
  try {
    const { DAOObject } = req.models;
    const { id } = req.body;

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Field "id" must be a valid ObjectId' });
    }

    const existing = await DAOObject.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ error: 'Object not found' });
    }

    await checkPermission(req, existing.type, 'ARCHIVE');

    const obj = await DAOObject.findByIdAndUpdate(id, { $set: { deleted_at: new Date() } }, { new: true }).lean();

    res.status(200).json({ status: 'object_deleted', object: obj });
  } catch (err) {
    console.error('🛑  del-object failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;
