const fetch = require('node-fetch');

const sendBatchSms = async ({ recipients, body }) => {
  if (!Array.isArray(recipients) || recipients.length === 0 || !body) {
    throw new Error('"recipients[]" (non-empty) and "body" are required');
  }

  const accountSid = process.env[`${orgId}_TWILIO_API_USERNAME`];
  const authToken = process.env[`${orgId}_TWILIO_API_PASSWORD`];
  const fromPhone = process.env[`${orgId}_TWILIO_API_PHONE_FROM`];

  if (!accountSid || !authToken || !fromPhone) {
    throw new Error(`Missing Twilio credentials for orgId=${orgId}`);
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const headers = {
    Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const results = [];

  for (const to of recipients) {
    const payload = new URLSearchParams({
      To: to,
      From: `+${fromPhone}`,
      Body: body,
    });

    try {
      const response = await fetch(url, { method: 'POST', headers, body: payload });
      const json = await response.json();
      if (!response.ok) {
        results.push({ to, status: 'error', error: json.message });
      } else {
        results.push({ to, status: 'sent', sid: json.sid });
      }
    } catch (err) {
      results.push({ to, status: 'error', error: err.message });
    }
  }

  return { summary: { total: recipients.length }, results };
};

module.exports = { sendBatchSms };
