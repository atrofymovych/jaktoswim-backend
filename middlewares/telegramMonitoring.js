const telegramMonitor = require('../_utils/monitoring/telegramMonitor');

function telegramMonitoringMiddleware(req, res, next) {
  // Track the request
  telegramMonitor.trackRequest();

  next();
}

module.exports = telegramMonitoringMiddleware;
