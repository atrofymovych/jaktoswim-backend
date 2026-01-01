/**
 * Soft middleware to sanitize organization ID when present
 * Runs on every request but doesn't block if orgId is missing
 * Prevents environment variable injection attacks
 */
function sanitizeOrgId(req, res, next) {
  const orgId = req.activeOrgId || req.get('X-ORG-ID') || req.headers['x-org-id'];

  if (orgId) {
    // Sanitize orgId to prevent environment variable injection
    // Allow org_ prefix followed by alphanumeric characters and underscores
    const sanitizedOrgId = String(orgId).replace(/[^a-zA-Z0-9_-]/g, '');

    if (!sanitizedOrgId || sanitizedOrgId !== String(orgId)) {
      console.warn(`🛡️ Security: Invalid orgId format detected: ${orgId}`);
      // Don't block the request, just log the warning
      // The integration will handle the invalid orgId
    } else {
      // Attach sanitized orgId to request for use by integrations
      req.sanitizedOrgId = sanitizedOrgId;
    }
  }

  // Always continue to next middleware
  next();
}

module.exports = { sanitizeOrgId };
