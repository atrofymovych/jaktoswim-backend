const vm = require('vm');
const mongoose = require('mongoose');
const { calcNextRun } = require('../cronUtils');
const { getMongoClusterConfiguration } = require('../../cluster_manager');
const { decryptCommand } = require('./decryptCommand');
const { jsFilterSortPaginate } = require('../aggregation');
const { getModelsForOrg } = require('./getModelsForOrg');
const { payuRecurringOrder } = require('../payu/payuRecurringOrder');
const { checkPayuOrderStatus } = require('../payu/checkPayuOrderStatus');
const { getResendInstance } = require('../resend/getResendInstance');
const { sendBatchSms } = require('../twilio/sendBatchSms');
const { sendSms } = require('../twilio/sendSms');
const { trackDaoCommandExecution, trackDaoCommandSize } = require('../../prometheus');

const LOCK_TTL_MS = 10 * 60 * 1000;

async function claimDueCommand(workerLabel = 'default') {
  const now = new Date();
  const clusters = getMongoClusterConfiguration();

  await Promise.all(
    Object.keys(clusters).map(async (orgId) => {
      const { models } = getModelsForOrg(orgId);
      const Cmd = models.DAOCommand;
      if (!Cmd) {
        return null;
      }
      const updateResult = await Cmd.updateMany(
        { lockedAt: { $ne: null }, lockExpiresAt: { $lte: now } },
        {
          $set: { lockedAt: null, lockExpiresAt: null },
          $inc: { staleLockCount: 1 },
          $push: { logs: `[${now.toISOString()}] stale lock auto-released` },
        }
      );
    })
  );

  const update = {
    $set: {
      status: 'running',
      lockedAt: now,
      lockExpiresAt: new Date(now.getTime() + LOCK_TTL_MS),
    },
    $push: { logs: `[${now.toISOString()}] claimed by ${workerLabel}` },
  };
  const opts = { sort: { nextRunAt: 1, _id: 1 }, new: true };

  for (const orgId of Object.keys(clusters)) {
    const { models } = getModelsForOrg(orgId);
    const Cmd = models.DAOCommand;
    if (!Cmd) {
      continue;
    }

    const doc = await Cmd.findOneAndUpdate(
      {
        disabled: false,
        status: 'pending',
        nextRunAt: { $lte: now },
        $or: [{ lockedAt: null }, { lockExpiresAt: { $lte: now } }],
      },
      update,
      opts
    ).lean();

    if (doc) {
      return { ...doc, orgId };
    } else {
      // No command for this org in this cycle; stay quiet
    }
  }
  return null;
}

function buildDaoOps(models, orgId, { userId = null, source = 'command-runner', commandId } = {}) {
  const { DAOObject, DAOCommand } = models;

  if (!DAOObject || !DAOCommand) {
    console.warn(`[DAO-DEBUG] buildDaoOps missing models: DAOObject=${!!DAOObject}, DAOCommand=${!!DAOCommand}`);
    return null;
  }
  let touched = 0;
  const incTouched = (n = 1) => {
    touched += n;
  };

  const safeStringify = (v) => {
    try {
      return JSON.stringify(v);
    } catch (e) {
      throw new Error('data cannot be stringified');
    }
  };

  const safeParse = (s) => {
    try {
      return JSON.parse(s);
    } catch (e) {
      console.error(`Debug: safeParse failed: ${e.message}`);
      return null;
    }
  };

  const appendCommandLogs = async (lines = []) => {
    if (!DAOCommand || !commandId) return false;
    const arr = Array.isArray(lines) ? lines : [lines];
    const stamped = arr.map((msg) => {
      const s = safeStringify(msg);
      return `[${new Date().toISOString()}] ${s}`;
    });
    await DAOCommand.findByIdAndUpdate(commandId, { $push: { logs: { $each: stamped } } }, { lean: true });
    return true;
  };

  const getObjectsRaw = async ({ ids, types, limit = 2000, skip = 0, dataFilter, sortBy } = {}) => {
    const dbFilter = { deleted_at: { $exists: false } };
    if (Array.isArray(ids) && ids.length) {
      dbFilter._id = {
        $in: ids.map((x) => new mongoose.Types.ObjectId(String(x))),
      };
    }
    if (Array.isArray(types) && types.length) {
      dbFilter.type = { $in: types };
    }

    let docs = await DAOObject.find(dbFilter).lean();
    docs = jsFilterSortPaginate(docs, { dataFilter, sortBy, limit, skip });
    return docs;
  };

  const getObjectsParsed = async (args = {}) => {
    const raw = await getObjectsRaw(args);
    return raw.map((it) => ({
      ...it,
      data: safeParse(it.data),
    }));
  };

  const addObject = async ({ id, type, data, metadata = {} }) => {
    if (!type || typeof type !== 'string') throw new Error('Field "type" must be a string');
    if (!data || typeof data !== 'object') throw new Error('Field "data" must be an object');

    const _id = id && mongoose.isValidObjectId(id) ? id : new mongoose.Types.ObjectId();

    const doc = await DAOObject.findOneAndUpdate(
      { _id },
      {
        $set: {
          type,
          data: safeStringify(data),
          metadata: { ...metadata, orgId, userId, source },
        },
        $unset: { deleted_at: '' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    incTouched();

    return doc;
  };

  const addObjectBulk = async ({ objects }) => {
    if (!Array.isArray(objects)) throw new Error('"objects" must be an array');

    const docs = objects.map((o) => {
      if (!o || typeof o !== 'object') throw new Error('Each array item must be an object');
      if (!o.type || typeof o.type !== 'string') throw new Error('Each object must have "type" string');
      if (!o.data || typeof o.data !== 'object') throw new Error('"data" must be an object');
      return {
        _id: o.id && mongoose.isValidObjectId(o.id) ? o.id : new mongoose.Types.ObjectId(),
        type: o.type,
        data: safeStringify(o.data),
        metadata: { ...(o.metadata || {}), orgId, userId, source },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    const res = await DAOObject.insertMany(docs, { ordered: false });
    incTouched(res.length);
    return { count: res.length, insertedIds: res.map((d) => d._id) };
  };

  const updateObject = async ({ id, type, data, metadata = {} }) => {
    if (!id || !mongoose.isValidObjectId(id)) throw new Error('"id" must be a valid ObjectId');
    if (data === undefined || typeof data !== 'object' || data === null) throw new Error('"data" must be an object');

    const existing = await DAOObject.findById(id).lean();
    if (!existing) {
      throw new Error('Object not found');
    }

    const updatePayload = {
      data: safeStringify(data),
      metadata: { ...metadata, orgId, userId, source },
      updatedAt: new Date(),
    };
    if (type) updatePayload.type = type;

    const updated = await DAOObject.findByIdAndUpdate(id, { $set: updatePayload }, { new: true }).lean();

    incTouched();

    return updated;
  };

  const delObject = async ({ id }) => {
    if (!id || !mongoose.isValidObjectId(id)) throw new Error('"id" must be a valid ObjectId');

    const existing = await DAOObject.findById(id).lean();
    if (!existing) {
      throw new Error('Object not found');
    }

    const obj = await DAOObject.findByIdAndUpdate(id, { $set: { deleted_at: new Date() } }, { new: true }).lean();

    incTouched();

    return obj;
  };

  const disableCommand = async (reason = 'Command disabled by self') => {
    if (!commandId) {
      throw new Error('Cannot disable command: commandId not available');
    }

    if (!DAOCommand) {
      throw new Error('Cannot disable command: DAOCommand model not available');
    }

    try {
      const updateResult = await DAOCommand.findByIdAndUpdate(
        commandId,
        {
          $set: {
            disabled: true,
            status: 'disabled',
            lockedAt: null,
            lockExpiresAt: null,
          },
          $push: {
            logs: `[${new Date().toISOString()}] Command disabled: ${reason}`,
          },
        },
        { new: true }
      ).lean();

      if (!updateResult) {
        console.error(`[DAO-DEBUG] Failed to disable command ${commandId} - command not found`);
        throw new Error('Command not found or could not be disabled');
      }

      // Log the disable action
      await appendCommandLogs(`Command disabled: ${reason}`);

      // Throw a special error to stop command execution
      const disableError = new Error(`COMMAND_DISABLED: ${reason}`);
      disableError.code = 'COMMAND_DISABLED';
      throw disableError;
    } catch (error) {
      if (error.code === 'COMMAND_DISABLED') {
        throw error;
      }
      console.error(`[DAO-DEBUG] Error disabling command ${commandId}:`, error.message);
      throw new Error(`Failed to disable command: ${error.message}`);
    }
  };

  const setNextRunAt = async (nextRunAt, reason = 'Next run time updated by command') => {
    if (!commandId) {
      throw new Error('Cannot set next run time: commandId not available');
    }

    if (!DAOCommand) {
      throw new Error('Cannot set next run time: DAOCommand model not available');
    }

    if (!nextRunAt) {
      throw new Error('nextRunAt parameter is required');
    }

    // Convert to Date if it's not already
    const nextRunDate = nextRunAt instanceof Date ? nextRunAt : new Date(nextRunAt);

    if (isNaN(nextRunDate.getTime())) {
      throw new Error('Invalid nextRunAt date provided');
    }

    try {
      const updateResult = await DAOCommand.findByIdAndUpdate(
        commandId,
        {
          $set: {
            nextRunAt: nextRunDate,
            status: 'pending',
            disabled: false,
            lockedAt: null,
            lockExpiresAt: null,
          },
          $push: {
            logs: `[${new Date().toISOString()}] Next run time set to ${nextRunDate.toISOString()}: ${reason}`,
          },
        },
        { new: true }
      ).lean();

      if (!updateResult) {
        console.error(`[DAO-DEBUG] Failed to set next run time for command ${commandId} - command not found`);
        throw new Error('Command not found or could not update next run time');
      }

      // Log the set next run time action
      await appendCommandLogs(`Next run time set to ${nextRunDate.toISOString()}: ${reason}`);

      // Throw a special error to stop command execution
      const setNextRunError = new Error(`NEXT_RUN_AT_SET: ${reason}`);
      setNextRunError.code = 'NEXT_RUN_AT_SET';
      setNextRunError.nextRunAt = nextRunDate;
      throw setNextRunError;
    } catch (error) {
      if (error.code === 'NEXT_RUN_AT_SET') {
        throw error;
      }
      console.error(`[DAO-DEBUG] Error setting next run time for command ${commandId}:`, error.message);
      throw new Error(`Failed to set next run time: ${error.message}`);
    }
  };

  return {
    '/add-object': addObject,
    '/add-object-bulk': addObjectBulk,
    '/update-object': updateObject,
    '/del-object': delObject,
    '/get-objects-raw': getObjectsRaw,
    '/get-objects-parsed': getObjectsParsed,
    '/payu-recurring-order': (args = {}) => {
      if (!userId) throw new Error('userId required for recurring order');
      return payuRecurringOrder(orgId, userId, models, args);
    },
    '/payu-check-order-status': async (args = {}) => {
      const { orderId } = args;
      if (!orderId) throw new Error('orderId is required for checking order status');
      return checkPayuOrderStatus(orgId, orderId);
    },
    '/get-resend-instance': () => getResendInstance(orgId),
    '/send-sms': (args) => sendSms({ ...args, orgId }),
    '/send-batch-sms': (args) => sendBatchSms({ ...args, orgId }),
    '/log': async (messageOrArray) => appendCommandLogs(messageOrArray),
    '/disable': disableCommand,
    '/set-next-run-at': setNextRunAt,
    __getTouched: () => touched,
  };
}

async function executeCommand(commandDoc, decryptKey) {
  const start = Date.now();
  let models;

  try {
    ({ models } = getModelsForOrg(commandDoc.orgId));

    const decrypted = decryptCommand(JSON.parse(commandDoc.command), decryptKey);

    // Track command size safely
    try {
      const commandSizeBytes = Buffer.byteLength(commandDoc.command, 'utf8');
      trackDaoCommandSize(commandDoc.orgId, commandDoc.action, commandSizeBytes);
    } catch (error) {
      console.error('[DAO-DEBUG] Error tracking command size:', error.message);
    }

    const dao = {
      ops: buildDaoOps(models, commandDoc.orgId, {
        userId: commandDoc.userId,
        source: commandDoc.source || 'NO_SOURCE',
        commandId: commandDoc._id,
      }),
    };

    if (!dao.ops) {
      throw new Error(`Failed to build DAO operations for orgId: ${commandDoc.orgId}. Missing DAOObject model?`);
    }

    const sandbox = { dao, Date, Math, JSON };
    const context = vm.createContext(sandbox);
    const wrapped = `(async () => {\n${decrypted}\n})()`;
    const script = new vm.Script(wrapped, { timeout: 10000 });

    await script.runInContext(context);

    const objectsTouched = dao.ops.__getTouched ? dao.ops.__getTouched() : 0;

    const durationMs = Date.now() - start;
    const durationSeconds = durationMs / 1000;

    let nextRunAt = null;
    if (commandDoc.action === 'RUN_ONCE') {
    } else if (commandDoc.cronExpr) {
      nextRunAt = calcNextRun(commandDoc.cronExpr, new Date());
    }

    // Track successful command execution safely
    try {
      trackDaoCommandExecution(commandDoc.orgId, 'success', commandDoc.action, null, durationSeconds, objectsTouched);
    } catch (error) {
      console.error('[DAO-DEBUG] Error tracking successful command execution:', error.message);
    }

    const update = {
      status: commandDoc.action === 'RUN_ONCE' ? 'disabled' : 'pending',
      lockedAt: null,
      lockExpiresAt: null,
      lastExecutedAt: new Date(),
      runCount: commandDoc.runCount + 1,
      successCount: commandDoc.successCount + 1,
      durationMs,
      objectsTouched,
      retryCount: 0,
      ...(nextRunAt ? { nextRunAt } : {}),
      $push: {
        logs: `[${new Date().toISOString()}] success in ${durationMs}ms`,
        runLogs: {
          startedAt: new Date(start),
          endedAt: new Date(),
          durationMs,
          objectsTouched,
          resultSummary: 'ok',
          error: null,
        },
      },
    };

    await models.DAOCommand.findByIdAndUpdate(commandDoc._id, update);
    return { ok: true };
  } catch (err) {
    // Handle COMMAND_DISABLED error specially
    if (err.code === 'COMMAND_DISABLED') {
      const durationMs = Date.now() - start;
      const durationSeconds = durationMs / 1000;

      // Track successful command execution for disabled commands
      try {
        trackDaoCommandExecution(commandDoc.orgId, 'success', commandDoc.action, null, durationSeconds, 0);
      } catch (error) {
        console.error('[DAO-DEBUG] Error tracking disabled command execution:', error.message);
      }

      const update = {
        status: 'disabled',
        lockedAt: null,
        lockExpiresAt: null,
        lastExecutedAt: new Date(),
        runCount: commandDoc.runCount + 1,
        successCount: commandDoc.successCount + 1,
        durationMs,
        objectsTouched: 0,
        retryCount: 0,
        $push: {
          logs: `[${new Date().toISOString()}] command disabled in ${durationMs}ms`,
          runLogs: {
            startedAt: new Date(start),
            endedAt: new Date(),
            durationMs,
            objectsTouched: 0,
            resultSummary: 'disabled',
            error: null,
          },
        },
      };

      await models.DAOCommand.findByIdAndUpdate(commandDoc._id, update);
      return { ok: true, disabled: true };
    }

    // Handle NEXT_RUN_AT_SET error specially
    if (err.code === 'NEXT_RUN_AT_SET') {
      const durationMs = Date.now() - start;
      const durationSeconds = durationMs / 1000;

      // Track successful command execution for commands that set next run time
      try {
        trackDaoCommandExecution(commandDoc.orgId, 'success', commandDoc.action, null, durationSeconds, 0);
      } catch (error) {
        console.error('[DAO-DEBUG] Error tracking next run time set command execution:', error.message);
      }

      const update = {
        status: 'pending',
        lockedAt: null,
        lockExpiresAt: null,
        lastExecutedAt: new Date(),
        runCount: commandDoc.runCount + 1,
        successCount: commandDoc.successCount + 1,
        durationMs,
        objectsTouched: 0,
        retryCount: 0,
        nextRunAt: err.nextRunAt,
        $push: {
          logs: `[${new Date().toISOString()}] next run time updated in ${durationMs}ms`,
          runLogs: {
            startedAt: new Date(start),
            endedAt: new Date(),
            durationMs,
            objectsTouched: 0,
            resultSummary: 'next-run-at-set',
            error: null,
          },
        },
      };

      await models.DAOCommand.findByIdAndUpdate(commandDoc._id, update);
      return { ok: true, nextRunAtSet: true, nextRunAt: err.nextRunAt };
    }

    console.error(
      `[DAO-DEBUG] Error during executeCommand for command ID: ${commandDoc._id}, orgId: ${commandDoc.orgId}. Error: ${err.message}`
    );
    const durationMs = Date.now() - start;
    const durationSeconds = durationMs / 1000;
    const nowIso2 = new Date().toISOString();

    const retryCount = commandDoc.retryCount + 1;
    let status = 'failed';
    let nextRunAt = null;
    if (retryCount <= commandDoc.retriesAfterFailure) {
      status = 'pending';
      nextRunAt = new Date(Date.now() + commandDoc.delayBetweenRetriesMs);
      console.warn(
        `[DAO-DEBUG] Retrying command. Attempt ${retryCount}/${
          commandDoc.retriesAfterFailure
        }. Next run at: ${nextRunAt.toISOString()}`
      );
    } else {
      console.warn(
        `[DAO-DEBUG] Max retries (${commandDoc.retriesAfterFailure}) exceeded. Command status set to 'failed'.`
      );
    }

    // Track failed command execution safely
    try {
      trackDaoCommandExecution(
        commandDoc.orgId,
        'failed',
        commandDoc.action,
        err.code || 'execution_error',
        durationSeconds,
        0
      );
    } catch (error) {
      console.error('Error tracking failed command execution:', error.message);
    }

    const update = {
      status,
      lockedAt: null,
      lockExpiresAt: null,
      lastExecutedAt: new Date(),
      runCount: commandDoc.runCount + 1,
      failureCount: commandDoc.failureCount + 1,
      durationMs,
      retryCount,
      errorCode: err.code || 'UNEXPECTED_ERROR',
      ...(nextRunAt ? { nextRunAt } : {}),
      $push: {
        logs: `[${nowIso2}] fail (${err.message})`,
        runLogs: {
          startedAt: new Date(start),
          endedAt: new Date(),
          durationMs,
          objectsTouched: 0,
          resultSummary: 'error',
          error: {
            message: err.message,
            code: err.code || null,
            stack: err.stack,
          },
        },
      },
    };

    if (models && models.DAOCommand) {
      await models.DAOCommand.findByIdAndUpdate(commandDoc._id, update);
      console.warn(`Debug: Command ID ${commandDoc._id} updated in DB after failure.`);
    } else {
      console.error(
        `Debug: FATAL: Could not update command ID ${commandDoc._id} in DB after failure because DAOCommand model was not available.`
      );
    }
    return { ok: false, error: err };
  }
}

module.exports = {
  claimDueCommand,
  executeCommand,
};
