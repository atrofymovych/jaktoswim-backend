const { getMongoClusterConfiguration } = require('../../cluster_manager');
const { getOrgConnection } = require('../../connection');
const _modelCache = new Map();

/**
 * Возвращает { conn, models } для указанной организации.
 * Первое обращение собирает модели и кладёт их в кэш,
 * последующие – мгновенно берут готовое из Map.
 */
function getModelsForOrg(orgId) {
  if (_modelCache.has(orgId)) {
    return _modelCache.get(orgId);
  }

  const clusters = getMongoClusterConfiguration();
  if (!clusters[orgId]) {
    throw new Error(`Unknown orgId ${orgId} in cluster config`);
  }

  const conn = getOrgConnection(orgId);
  const models = {};
  for (const { model_name } of clusters[orgId].models) {
    models[model_name] = conn.model(model_name);
  }

  const entry = { conn, models };
  _modelCache.set(orgId, entry);
  return entry;
}

module.exports = { getModelsForOrg, _modelCache };
