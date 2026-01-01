const express = require('express');
const crypto = require('crypto');
const { cacheInvalidationMiddleware } = require('../middlewares/cacheMiddleware');
const requireRole = require('../middlewares/requireRole');
const permissionCacheService = require('../services/permissionCacheService');

const router = express.Router();

// UUID aliases for endpoints (to hide real endpoint names)
const ENDPOINT_ALIASES = {
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890': 'updateUserRole',
};

/**
 * Decrypt payload using AES-256-GCM
 * @param {string} encryptedPayload - Base64 encoded encrypted payload
 * @returns {Object|null} Decrypted payload or null if failed
 */
function decryptPayload(encryptedPayload) {
  try {
    const encryptionKey = process.env.SECURE_GATEWAY_KEY;
    if (!encryptionKey) {
      console.error('🛑 SECURE_GATEWAY_KEY not configured in environment');
      return null;
    }

    // Decode base64
    const encryptedData = Buffer.from(encryptedPayload, 'base64');
    
    // Extract IV, authTag, and ciphertext
    const iv = encryptedData.slice(0, 16);
    const authTag = encryptedData.slice(16, 32);
    const ciphertext = encryptedData.slice(32);

    // Create decipher
    const decipher = crypto.createDecipherGCM('aes-256-gcm', Buffer.from(encryptionKey, 'hex'));
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from('secure-gateway', 'utf8'));
    decipher.setIV(iv);

    // Decrypt
    let decrypted = decipher.update(ciphertext, null, 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    console.warn('⚠️ Failed to decrypt secure gateway payload:', error.message);
    return null;
  }
}

/**
 * Middleware to decrypt and validate secure payload
 */
function securePayloadMiddleware(req, res, next) {
  try {
    const { payload } = req.body;

    if (!payload || typeof payload !== 'string') {
      console.warn('⚠️ Secure gateway: Invalid payload format');
      return res.status(400).json({ status: 'error' });
    }

    // Decrypt payload
    const decryptedData = decryptPayload(payload);
    if (!decryptedData) {
      console.warn('⚠️ Secure gateway: Failed to decrypt payload');
      return res.status(400).json({ status: 'error' });
    }

    // Validate decrypted data structure
    if (!decryptedData.data) {
      console.warn('⚠️ Secure gateway: Invalid decrypted data structure');
      return res.status(400).json({ status: 'error' });
    }

    // Attach decrypted data to request
    req.secureData = decryptedData;
    next();
  } catch (error) {
    console.warn('⚠️ Secure gateway middleware error:', error.message);
    res.status(400).json({ status: 'error' });
  }
}

/**
 * Secure Gateway - All endpoints
 * POST /secure-gateway/:endpointAlias
 */
router.post('/:endpointAlias', securePayloadMiddleware, async (req, res) => {
  try {
    const { endpointAlias } = req.params;
    const { data } = req.secureData;

    // Check if endpoint alias exists
    const endpointName = ENDPOINT_ALIASES[endpointAlias];
    if (!endpointName) {
      console.warn(`⚠️ Secure gateway: Unknown endpoint alias: ${endpointAlias}`);
      return res.status(404).json({ status: 'error' });
    }

    // Route to appropriate handler based on endpoint
    switch (endpointName) {
      case 'updateUserRole':
        return await handleUpdateUserRole(req, res, data);
      
      default:
        console.warn(`⚠️ Secure gateway: Unknown endpoint: ${endpointName}`);
        return res.status(400).json({ status: 'error' });
    }

  } catch (error) {
    console.error('🛑 Secure gateway error:', error);
    res.status(500).json({ status: 'error' });
  }
});

/**
 * Handle user role update
 */
async function handleUpdateUserRole(req, res, data) {
  try {
    const { OrganisationRolesMapping } = req.models;
    const { userId, role } = data;

    // Validate input
    if (!userId || !role || typeof role !== 'string') {
      console.warn(`⚠️ Secure gateway: Invalid data: userId and role are required: ${userId} - ${role}`);
      return res.status(400).json({ status: 'error' });
    }

    // Check if role contains "ADMIN" (case insensitive)
    if (role.toUpperCase().includes('ADMIN')) {
      console.warn(`⚠️ Secure gateway: Admin role attempted to be assigned: ${userId} - ${role}`);
      return res.status(400).json({ status: 'error' });
    }

    // Check if user exists in organization
    const existingMapping = await OrganisationRolesMapping.findOne({
      userId,
      organizationId: req.activeOrgId
    });

    if (!existingMapping) {
      return res.status(404).json({ status: 'error' });
    }

    // Update the role
    const updatedMapping = await OrganisationRolesMapping.findOneAndUpdate(
      { userId, organizationId: req.activeOrgId },
      { $set: { role } },
      { new: true }
    );

    // Invalidate permission cache for this user's role
    permissionCacheService.clearUserRole(userId, req.activeOrgId);
    
    // Also clear all permission checks for this organization since role changes
    // affect all permission checks that depend on the role
    permissionCacheService.clearPermissions(req.activeOrgId);

    console.info(`✅ Secure gateway: User role updated: ${userId} - ${role}`);
    res.json({ status: 'ok' });

  } catch (error) {
    console.error('🛑 Failed to update user role via secure gateway:', error);
    res.status(500).json({ status: 'error' });
  }
}


module.exports = router;
