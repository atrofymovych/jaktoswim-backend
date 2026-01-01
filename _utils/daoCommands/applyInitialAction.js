const { calcNextRun } = require('../cronUtils');

function applyInitialAction(doc) {
  const now = new Date();
  let { disabled, nextRunAt } = doc;

  if (nextRunAt && !(nextRunAt instanceof Date)) {
    nextRunAt = new Date(nextRunAt);
  }

  switch (doc.action) {
    case 'REGISTER_COMMAND':
    case 'REGISTER_AS_ACTIVE':
      disabled = false;
      if (doc.cronExpr && !nextRunAt) nextRunAt = calcNextRun(doc.cronExpr, now);
      break;
    case 'RUN_NOW_AND_REGISTER':
    case 'RUN_ONCE':
      disabled = false;
      if (!nextRunAt) {
        nextRunAt = now;
      }
      break;
    case 'REGISTER_AS_DISABLED':
      disabled = true;
      // keep quiet unless errors occur
      break;
    default:
      // unknown action; no-op
      break;
  }

  const result = { disabled, nextRunAt, actionAppliedAt: now };
  // result used by caller
  return result;
}

module.exports = { applyInitialAction };
