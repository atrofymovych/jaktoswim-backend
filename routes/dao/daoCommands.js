const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { calcNextRun } = require('../../_utils/cronUtils');
const { asyncRoute } = require('../../_utils/network/asyncRoute');
const { getDAOCommandModel } = require('../../_utils/modelUtils');
const { applyInitialAction } = require('../../_utils/daoCommands/applyInitialAction');

router.post(
  '/',
  asyncRoute(async (req, res) => {
    const DAOCommand = getDAOCommandModel(req);
    const base = applyInitialAction(req.body);
    const doc = await DAOCommand.create({ ...req.body, ...base });

    res.status(201).json({ status: 'created', id: doc._id });
  })
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const DAOCommand = getDAOCommandModel(req);
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const doc = await DAOCommand.findById(id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });

    res.json(doc);
  })
);

router.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    const DAOCommand = getDAOCommandModel(req);
    const { id } = req.params;
    const updates = { ...req.body };
    if (updates.action) delete updates.action;

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const doc = await DAOCommand.findByIdAndUpdate(id, updates, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    res.json(doc);
  })
);

router.post(
  '/:id/disable',
  asyncRoute(async (req, res) => {
    const DAOCommand = getDAOCommandModel(req);
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const doc = await DAOCommand.findByIdAndUpdate(id, { disabled: true, status: 'disabled' }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    res.json({ status: 'disabled' });
  })
);

router.post(
  '/:id/run-now',
  asyncRoute(async (req, res) => {
    const DAOCommand = getDAOCommandModel(req);
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const doc = await DAOCommand.findById(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.lockedAt) return res.status(409).json({ error: 'Already running' });

    await DAOCommand.findByIdAndUpdate(doc._id, {
      nextRunAt: new Date(),
      disabled: false,
      status: 'pending',
    });

    res.json({ status: 'queued' });
  })
);

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const DAOCommand = getDAOCommandModel(req);
    const docs = await DAOCommand.find().sort({ createdAt: -1 }).lean(); // latest first
    res.json(docs);
  })
);

module.exports = router;
