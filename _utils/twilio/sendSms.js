const fetch = require('node-fetch');

const sendSms = async ({ to, body, orgId }) => {
  if (!to || !body) {
    throw new Error('"to" and "body" are required');
  }

  const accountSid = process.env[`${orgId}_TWILIO_API_USERNAME`];
  const authToken = process.env[`${orgId}_TWILIO_API_PASSWORD`];
  const fromPhone = process.env[`${orgId}_TWILIO_API_PHONE_FROM`];

  if (!accountSid || !authToken || !fromPhone) {
    throw new Error(`Missing Twilio credentials for orgId=${orgId}`);
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const payload = new URLSearchParams({
    To: to,
    From: `+${fromPhone}`,
    Body: body,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  });

  const json = await response.json();
  if (!response.ok) {
    console.warn('Twilio error:', json);
    throw new Error(json.message || 'Twilio error');
  }

  return { status: 'sent', sid: json.sid };
};

module.exports = { sendSms };
