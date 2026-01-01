const { Resend } = require('resend');

const getResendInstance = (orgId) => {
  if (!orgId) {
    console.error('getResendInstance was called without an orgId.');
    throw new Error('getResendInstance requires orgId');
  }

  const RESEND_API_KEY = process.env[`${orgId}_RESEND_API_KEY`];
  if (!RESEND_API_KEY) {
    console.error(`Missing RESEND_API_KEY for org: ${orgId}`);
    throw new Error(`Resend API key not found for orgId=${orgId}`);
  }

  return new Resend(RESEND_API_KEY);
};

module.exports = { getResendInstance };
