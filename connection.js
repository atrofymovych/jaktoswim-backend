const mongoose = require('mongoose');
const { getMongoClusterConfiguration } = require('./cluster_manager');

const connectionCache = {};

function getOrgConnection(orgId) {
  const CLUSTERS = getMongoClusterConfiguration();
  const clusterConfig = CLUSTERS[orgId];
  if (!clusterConfig) throw new Error(`No cluster config found for orgId: ${orgId}`);

  if (!connectionCache[orgId]) {
    const conn = mongoose.createConnection(clusterConfig.url);

    for (const { model_name, schema } of clusterConfig.models) {
      const actualSchema = schema.schema || schema;
      conn.model(model_name, actualSchema);
    }

    connectionCache[orgId] = conn;
  }
  return connectionCache[orgId];
}

// Cleanup function for tests
async function cleanupConnections() {
  const promises = Object.values(connectionCache).map(async (conn) => {
    try {
      if (conn.readyState !== 0) {
        await conn.close();
      }
    } catch (error) {
      console.error('Error closing connection:', error);
    }
  });

  await Promise.all(promises);
  Object.keys(connectionCache).forEach((key) => delete connectionCache[key]);
}

module.exports = { getOrgConnection, cleanupConnections };
