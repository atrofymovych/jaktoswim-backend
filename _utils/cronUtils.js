'use strict';

const cron = require('cron-parser');
const { version } = require('cron-parser/package.json');

// Универсальный парсер под v3/v4/v5
function getInterval(expr, fromDate) {
  // v5+
  if (cron.CronExpressionParser?.parse) {
    return cron.CronExpressionParser.parse(expr, { currentDate: fromDate, utc: true });
  }
  // v4 (parseExpression) или v3 (функция по умолчанию)
  if (typeof cron.parseExpression === 'function') {
    return cron.parseExpression(expr, { currentDate: fromDate, utc: true });
  }
  if (typeof cron === 'function') {
    return cron(expr, { currentDate: fromDate, utc: true });
  }
  throw new Error('Unsupported cron-parser API shape');
}

function calcNextRun(cronExpr, fromDate = new Date()) {
  return getInterval(cronExpr, fromDate).next().toDate();
}

module.exports = { calcNextRun };
