const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

function ensureObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function buildPublicMetadata(req, providedMeta) {
  const meta = ensureObject(providedMeta);
  if (!meta.source) meta.source = req.source || 'public_api';
  if (!meta.ip) meta.ip = req.ip;
  if (!meta.ua) meta.ua = req.get('user-agent');
  return meta;
}

async function getPublicObjectsLogic(req) {
  const { ids, types, limit = 100, skip = 0, dataFilter, sortBy } = ensureObject(req.body);
  const { DAOPublicObject } = req.models;

  const dbFilter = { $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }] };
  if (Array.isArray(ids) && ids.length) {
    dbFilter._id = {
      $in: ids.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id)),
    };
  }
  if (Array.isArray(types) && types.length) {
    dbFilter.type = { $in: types };
  }

  let items = await DAOPublicObject.find(dbFilter).lean();

  // In-memory filter on data payload (exact matches on top-level keys)
  if (dataFilter && typeof dataFilter === 'object' && Object.keys(dataFilter).length > 0) {
    items = items.filter((item) => {
      const d = item && item.data;
      if (!d || typeof d !== 'object') return false;
      for (const k of Object.keys(dataFilter)) {
        if (d[k] != dataFilter[k]) return false; // loose equality to mimic your original
      }
      return true;
    });
  }

  const sortOptions = sortBy || { createdAt: -1 };
  const sortField = Object.keys(sortOptions)[0];
  const sortOrder = sortOptions[sortField] === -1 ? -1 : 1;

  items.sort((a, b) => {
    if (a[sortField] > b[sortField]) return sortOrder;
    if (a[sortField] < b[sortField]) return -sortOrder;
    return 0;
  });

  return items.slice(Number(skip) || 0, (Number(skip) || 0) + (Number(limit) || 100));
}

router.post('/add-object', async (req, res) => {
  try {
    const { DAOPublicObject } = req.models;
    const { type, id, data, metadata } = req.body || {};

    if (!type || typeof type !== 'string') {
      return res.status(400).json({ error: 'Field "type" must be a string' });
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Field "data" must be an object' });
    }

    const meta = buildPublicMetadata(req, metadata);

    const obj = await DAOPublicObject.findOneAndUpdate(
      { _id: id && mongoose.isValidObjectId(id) ? id : new mongoose.Types.ObjectId() },
      {
        $set: { type, data, metadata: meta },
        $unset: { deleted_at: '' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ status: 'object_added', object: obj });
  } catch (err) {
    console.error('🛑  public add-object failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/get-objects-raw', async (req, res) => {
  try {
    const objects = await getPublicObjectsLogic(req);
    res.status(200).json({ objects });
  } catch (err) {
    console.error('🛑  public get-objects-raw failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/get-objects-parsed', async (req, res) => {
  try {
    const objects = await getPublicObjectsLogic(req);
    const result = objects.map((item) => {
      const d = item?.data;
      if (typeof d === 'string') {
        try {
          return { ...item, data: JSON.parse(d) };
        } catch {
          return { ...item, data: null };
        }
      }
      return item;
    });
    res.status(200).json({ objects: result });
  } catch (err) {
    console.error('🛑  public get-objects-parsed failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/add-object-bulk', async (req, res) => {
  try {
    const { DAOPublicObject } = req.models;
    const { objects } = req.body || {};

    if (!Array.isArray(objects)) {
      return res.status(400).json({ error: 'Request body must contain an "objects" array' });
    }

    const docs = objects.map((o, idx) => {
      if (!o || typeof o !== 'object') {
        throw { status: 400, message: `Invalid object at index ${idx}` };
      }
      const { id, type, data, metadata } = o;
      if (!type || typeof type !== 'string') {
        throw { status: 400, message: 'Each object must have a valid "type" (string)' };
      }
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        throw { status: 400, message: 'Each object must have a valid "data" (object)' };
      }
      return {
        _id: id && mongoose.isValidObjectId(id) ? id : new mongoose.Types.ObjectId(),
        type,
        data,
        metadata: buildPublicMetadata(req, metadata),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    const result = await DAOPublicObject.insertMany(docs, { ordered: false });

    res.status(201).json({
      status: 'objects_added',
      count: result.length,
      insertedIds: result.map((d) => d._id),
    });
  } catch (err) {
    console.error('🛑  public add-object-bulk failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/update-object', async (req, res) => {
  try {
    const { DAOPublicObject } = req.models;
    const { id, type, data, metadata } = req.body || {};

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Field "id" must be a valid ObjectId' });
    }
    if (data === undefined || data === null || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Field "data" must be an object' });
    }

    const existing = await DAOPublicObject.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ error: 'Object not found' });
    }

    const updatePayload = {
      data,
      metadata: { ...ensureObject(existing.metadata), ...buildPublicMetadata(req, metadata) },
    };
    if (type) updatePayload.type = type;

    const updated = await DAOPublicObject.findByIdAndUpdate(id, { $set: updatePayload }, { new: true }).lean();

    res.json({ status: 'object_updated', object: updated });
  } catch (err) {
    console.error('🛑  public update-object failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/del-object', async (req, res) => {
  try {
    const { DAOPublicObject } = req.models;
    const { id } = req.body || {};

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Field "id" must be a valid ObjectId' });
    }

    const existing = await DAOPublicObject.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ error: 'Object not found' });
    }

    const obj = await DAOPublicObject.findByIdAndUpdate(id, { $set: { deleted_at: new Date() } }, { new: true }).lean();

    res.status(200).json({ status: 'object_deleted', object: obj });
  } catch (err) {
    console.error('🛑  public del-object failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;
