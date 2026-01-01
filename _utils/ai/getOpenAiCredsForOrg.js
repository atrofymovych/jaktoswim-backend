function getOpenAiCredsForOrg(orgId) {
  // orgId should already be sanitized by sanitizeOrgId middleware
  // but we'll add a safety check just in case
  const sanitizedOrgId = String(orgId || '').replace(/[^a-zA-Z0-9_-]/g, '');

  if (!sanitizedOrgId || sanitizedOrgId !== String(orgId)) {
    throw new Error(`Invalid organization ID: ${orgId}`);
  }

  const apiKey = String(process.env[`${sanitizedOrgId}_OPENAI_API_KEY`]);
  const baseURL = String(process.env[`${sanitizedOrgId}_OPENAI_BASE_URL`]);
  const model = String(process.env[`${sanitizedOrgId}_OPENAI_MODEL`]);

  if (!apiKey) {
    console.error('[ERROR] missing OpenAI API key for orgId');
    throw new Error(`OpenAI API key not found for ORG_ID=${sanitizedOrgId}`);
  }

  return {
    apiKey,
    baseURL: baseURL || undefined,
    model: model || undefined,
  };
}

module.exports = { getOpenAiCredsForOrg };
