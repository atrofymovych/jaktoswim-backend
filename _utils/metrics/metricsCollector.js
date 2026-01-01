const {
  updateDaoObjectGauge,
  updateDaoCommandGauge,
  updateUserActivityGauge,
  updateDataVolumeGauge,
  updateErrorRateGauge,
  trackDaoObjectSize,
  trackDaoCommandSize,
} = require('../../prometheus');

/**
 * Comprehensive metrics collector for SRE monitoring
 * Collects detailed per-org statistics for DAO objects, commands, and business metrics
 */
class MetricsCollector {
  constructor() {
    this.isCollecting = false;
    this.collectionInterval = null;
  }

  /**
   * Start periodic metrics collection
   * @param {number} intervalMs - Collection interval in milliseconds (default: 5 minutes)
   */
  startCollection(intervalMs = 5 * 60 * 1000) {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;

    // Initial collection
    this.collectAllMetrics();

    // Set up periodic collection
    this.collectionInterval = setInterval(() => {
      this.collectAllMetrics();
    }, intervalMs);
  }

  /**
   * Stop metrics collection
   */
  stopCollection() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    this.isCollecting = false;
  }

  /**
   * Collect all metrics for all organizations
   */
  async collectAllMetrics() {
    try {
      // Get all unique org IDs from various collections
      const orgIds = await this.getAllOrgIds();

      // Collect metrics for each org independently - if one fails, others continue
      const collectionPromises = orgIds.map(async (orgId) => {
        try {
          await this.collectOrgMetrics(orgId);
        } catch (error) {
          console.error(`Error collecting metrics for org ${orgId}:`, error.message);
          // Continue with other orgs even if one fails
        }
      });

      await Promise.allSettled(collectionPromises);
    } catch (error) {
      console.error('Error in collectAllMetrics:', error.message);
    }
  }

  /**
   * Get all unique organization IDs from the system
   */
  async getAllOrgIds() {
    const orgIds = new Set();

    try {
      // Get org IDs from DAO objects
      const daoObjects = await this.getModelsForOrg('global').DAOObject.distinct('metadata.orgId');
      daoObjects.forEach((orgId) => orgIds.add(orgId));

      // Get org IDs from DAO commands
      const daoCommands = await this.getModelsForOrg('global').DAOCommand.distinct('orgId');
      daoCommands.forEach((orgId) => orgIds.add(orgId));

      // Get org IDs from AI objects
      const aiObjects = await this.getModelsForOrg('global').DAOAiObject.distinct('metadata.orgId');
      aiObjects.forEach((orgId) => orgIds.add(orgId));

      // Get org IDs from user profiles
      const userProfiles = await this.getModelsForOrg('global').UserProfile.distinct('orgId');
      userProfiles.forEach((orgId) => orgIds.add(orgId));
    } catch (error) {
      console.error('Error getting org IDs:', error);
    }

    return Array.from(orgIds);
  }

  /**
   * Collect comprehensive metrics for a specific organization
   */
  async collectOrgMetrics(orgId) {
    try {
      const models = this.getModelsForOrg(orgId);

      // Collect each metric type independently - if one fails, others continue
      const metricPromises = [
        this.collectDaoObjectMetrics(orgId, models).catch((error) => {
          console.error(`DAO object metrics failed for org ${orgId}:`, error.message);
        }),
        this.collectDaoCommandMetrics(orgId, models).catch((error) => {
          console.error(`DAO command metrics failed for org ${orgId}:`, error.message);
        }),
        this.collectAiSessionMetrics(orgId, models).catch((error) => {
          console.error(`AI session metrics failed for org ${orgId}:`, error.message);
        }),
        this.collectUserActivityMetrics(orgId, models).catch((error) => {
          console.error(`User activity metrics failed for org ${orgId}:`, error.message);
        }),
        this.collectDataVolumeMetrics(orgId, models).catch((error) => {
          console.error(`Data volume metrics failed for org ${orgId}:`, error.message);
        }),
        this.collectErrorRateMetrics(orgId, models).catch((error) => {
          console.error(`Error rate metrics failed for org ${orgId}:`, error.message);
        }),
      ];

      await Promise.allSettled(metricPromises);
    } catch (error) {
      console.error(`Error collecting metrics for org ${orgId}:`, error.message);
    }
  }

  /**
   * Collect DAO object statistics
   */
  async collectDaoObjectMetrics(orgId, models) {
    try {
      const { DAOObject } = models;

      // Count by type and status
      const objectStats = await DAOObject.aggregate([
        { $match: { 'metadata.orgId': orgId } },
        {
          $group: {
            _id: {
              type: '$type',
              status: { $cond: [{ $eq: ['$deleted_at', null] }, 'active', 'deleted'] },
            },
            count: { $sum: 1 },
            totalSize: { $sum: { $strLenBytes: '$data' } },
          },
        },
      ]);

      // Update gauges
      for (const stat of objectStats) {
        const { type, status } = stat._id;
        updateDaoObjectGauge(orgId, type, status, stat.count);
        trackDaoObjectSize(orgId, type, stat.totalSize);
      }

      // Get total counts for each type
      const totalByType = await DAOObject.aggregate([
        { $match: { 'metadata.orgId': orgId } },
        {
          $group: {
            _id: '$type',
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$deleted_at', null] }, 1, 0] } },
            deleted: { $sum: { $cond: [{ $ne: ['$deleted_at', null] }, 1, 0] } },
          },
        },
      ]);

      for (const stat of totalByType) {
        updateDaoObjectGauge(orgId, stat._id, 'total', stat.total);
        updateDaoObjectGauge(orgId, stat._id, 'active', stat.active);
        updateDaoObjectGauge(orgId, stat._id, 'deleted', stat.deleted);
      }
    } catch (error) {
      console.error(`Error collecting DAO object metrics for org ${orgId}:`, error);
    }
  }

  /**
   * Collect DAO command statistics
   */
  async collectDaoCommandMetrics(orgId, models) {
    try {
      const { DAOCommand } = models;

      // Count by status and action
      const commandStats = await DAOCommand.aggregate([
        { $match: { orgId } },
        {
          $group: {
            _id: {
              status: '$status',
              action: '$action',
            },
            count: { $sum: 1 },
            totalSize: { $sum: { $strLenBytes: '$command' } },
            avgDuration: { $avg: '$durationMs' },
            totalExecutions: { $sum: '$runCount' },
            totalSuccess: { $sum: '$successCount' },
            totalFailures: { $sum: '$failureCount' },
            totalEntitiesAffected: { $sum: '$objectsTouched' },
          },
        },
      ]);

      // Update gauges
      for (const stat of commandStats) {
        const { status, action } = stat._id;
        updateDaoCommandGauge(orgId, status, action, stat.count);
        trackDaoCommandSize(orgId, action, stat.totalSize);
      }

      // Get execution statistics
      const executionStats = await DAOCommand.aggregate([
        { $match: { orgId } },
        {
          $group: {
            _id: null,
            totalCommands: { $sum: 1 },
            pendingCommands: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            runningCommands: { $sum: { $cond: [{ $eq: ['$status', 'running'] }, 1, 0] } },
            successfulCommands: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
            failedCommands: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            disabledCommands: { $sum: { $cond: [{ $eq: ['$status', 'disabled'] }, 1, 0] } },
            totalExecutions: { $sum: '$runCount' },
            totalSuccess: { $sum: '$successCount' },
            totalFailures: { $sum: '$failureCount' },
            avgExecutionTime: { $avg: '$durationMs' },
            totalEntitiesAffected: { $sum: '$objectsTouched' },
          },
        },
      ]);

      if (executionStats.length > 0) {
        const stats = executionStats[0];
        updateDaoCommandGauge(orgId, 'total', 'all', stats.totalCommands);
        updateDaoCommandGauge(orgId, 'pending', 'all', stats.pendingCommands);
        updateDaoCommandGauge(orgId, 'running', 'all', stats.runningCommands);
        updateDaoCommandGauge(orgId, 'success', 'all', stats.successfulCommands);
        updateDaoCommandGauge(orgId, 'failed', 'all', stats.failedCommands);
        updateDaoCommandGauge(orgId, 'disabled', 'all', stats.disabledCommands);
      }

      // Get recent command activity (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentCommands = await DAOCommand.countDocuments({
        orgId,
        createdAt: { $gte: oneDayAgo },
      });

      updateDaoCommandGauge(orgId, 'recent_24h', 'all', recentCommands);
    } catch (error) {
      console.error(`Error collecting DAO command metrics for org ${orgId}:`, error);
    }
  }

  /**
   * Collect AI session statistics
   */
  async collectAiSessionMetrics(orgId, models) {
    try {
      const { DAOAiObject } = models;

      // Count AI sessions by type
      const aiStats = await DAOAiObject.aggregate([
        { $match: { 'metadata.orgId': orgId } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalSize: { $sum: { $strLenBytes: { $toString: '$data' } } },
          },
        },
      ]);

      for (const stat of aiStats) {
        updateDaoObjectGauge(orgId, `ai_${stat._id}`, 'total', stat.count);
        trackDaoObjectSize(orgId, `ai_${stat._id}`, stat.totalSize);
      }

      // Get recent AI activity (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentAiActivity = await DAOAiObject.countDocuments({
        'metadata.orgId': orgId,
        createdAt: { $gte: oneDayAgo },
      });

      updateDaoObjectGauge(orgId, 'ai_sessions', 'recent_24h', recentAiActivity);
    } catch (error) {
      console.error(`Error collecting AI session metrics for org ${orgId}:`, error);
    }
  }

  /**
   * Collect user activity metrics
   */
  async collectUserActivityMetrics(orgId, models) {
    try {
      const { UserProfile, DAOObject, DAOCommand } = models;

      // Count active users (users with activity in last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const activeUsers = await UserProfile.countDocuments({
        orgId,
        updatedAt: { $gte: thirtyDaysAgo },
      });

      updateUserActivityGauge(orgId, '30_days', activeUsers);

      // Count users with recent object creation (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const recentObjectUsers = await DAOObject.distinct('metadata.userId', {
        'metadata.orgId': orgId,
        createdAt: { $gte: sevenDaysAgo },
      });

      updateUserActivityGauge(orgId, '7_days_objects', recentObjectUsers.length);

      // Count users with recent command creation (last 7 days)
      const recentCommandUsers = await DAOCommand.distinct('userId', {
        orgId,
        createdAt: { $gte: sevenDaysAgo },
      });

      updateUserActivityGauge(orgId, '7_days_commands', recentCommandUsers.length);
    } catch (error) {
      console.error(`Error collecting user activity metrics for org ${orgId}:`, error);
    }
  }

  /**
   * Collect data volume metrics
   */
  async collectDataVolumeMetrics(orgId, models) {
    try {
      const { DAOObject, DAOCommand, DAOAiObject } = models;

      // Calculate total data volume for DAO objects
      const daoObjectVolume = await DAOObject.aggregate([
        { $match: { 'metadata.orgId': orgId } },
        {
          $group: {
            _id: null,
            totalBytes: { $sum: { $strLenBytes: '$data' } },
          },
        },
      ]);

      if (daoObjectVolume.length > 0) {
        updateDataVolumeGauge(orgId, 'dao_objects', daoObjectVolume[0].totalBytes);
      }

      // Calculate total data volume for DAO commands
      const daoCommandVolume = await DAOCommand.aggregate([
        { $match: { orgId } },
        {
          $group: {
            _id: null,
            totalBytes: { $sum: { $strLenBytes: '$command' } },
          },
        },
      ]);

      if (daoCommandVolume.length > 0) {
        updateDataVolumeGauge(orgId, 'dao_commands', daoCommandVolume[0].totalBytes);
      }

      // Calculate total data volume for AI objects
      const aiObjectVolume = await DAOAiObject.aggregate([
        { $match: { 'metadata.orgId': orgId } },
        {
          $group: {
            _id: null,
            totalBytes: { $sum: { $strLenBytes: { $toString: '$data' } } },
          },
        },
      ]);

      if (aiObjectVolume.length > 0) {
        updateDataVolumeGauge(orgId, 'ai_objects', aiObjectVolume[0].totalBytes);
      }

      // Calculate total volume
      const totalVolume =
        (daoObjectVolume[0]?.totalBytes || 0) +
        (daoCommandVolume[0]?.totalBytes || 0) +
        (aiObjectVolume[0]?.totalBytes || 0);

      updateDataVolumeGauge(orgId, 'total', totalVolume);
    } catch (error) {
      console.error(`Error collecting data volume metrics for org ${orgId}:`, error);
    }
  }

  /**
   * Collect error rate metrics
   */
  async collectErrorRateMetrics(orgId, models) {
    try {
      const { DAOCommand } = models;

      // Calculate error rates for commands
      const errorStats = await DAOCommand.aggregate([
        { $match: { orgId } },
        {
          $group: {
            _id: null,
            totalCommands: { $sum: 1 },
            totalExecutions: { $sum: '$runCount' },
            totalFailures: { $sum: '$failureCount' },
            totalSuccess: { $sum: '$successCount' },
          },
        },
      ]);

      if (errorStats.length > 0) {
        const stats = errorStats[0];

        // Calculate error rates
        const executionErrorRate = stats.totalExecutions > 0 ? (stats.totalFailures / stats.totalExecutions) * 100 : 0;

        const commandErrorRate = stats.totalCommands > 0 ? (stats.totalFailures / stats.totalCommands) * 100 : 0;

        updateErrorRateGauge(orgId, 'execution', 'dao_commands', executionErrorRate);
        updateErrorRateGauge(orgId, 'command', 'dao_commands', commandErrorRate);
      }

      // Get recent error rate (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentErrorStats = await DAOCommand.aggregate([
        {
          $match: {
            orgId,
            createdAt: { $gte: oneDayAgo },
          },
        },
        {
          $group: {
            _id: null,
            totalCommands: { $sum: 1 },
            totalFailures: { $sum: '$failureCount' },
          },
        },
      ]);

      if (recentErrorStats.length > 0) {
        const stats = recentErrorStats[0];
        const recentErrorRate = stats.totalCommands > 0 ? (stats.totalFailures / stats.totalCommands) * 100 : 0;

        updateErrorRateGauge(orgId, 'recent_24h', 'dao_commands', recentErrorRate);
      }
    } catch (error) {
      console.error(`Error collecting error rate metrics for org ${orgId}:`, error);
    }
  }

  /**
   * Get models for a specific organization
   */
  getModelsForOrg(orgId) {
    // This would need to be implemented based on your existing model loading logic
    // For now, we'll use a placeholder that should be replaced with actual implementation
    const { getModelsForOrg } = require('../daoCommands/getModelsForOrg');
    return getModelsForOrg(orgId);
  }
}

module.exports = MetricsCollector;
