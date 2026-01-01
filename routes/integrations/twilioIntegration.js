// ------------------ FILE twilioIntegration.js START ------------------ //
// DIR: ./crm-as-a-service/routes                                        //

const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

router.post('/send-sms', async (req, res) => {
  console.group('[DEBUG] POST /send-sms');
  try {
    const orgId = req.get('X-ORG-ID');
    if (!orgId) return res.status(400).json({ error: 'X-ORG-ID header is required' });

    const accountSid = process.env[`${orgId}_TWILIO_API_USERNAME`];
    const authToken = process.env[`${orgId}_TWILIO_API_PASSWORD`];
    const fromPhone = process.env[`${orgId}_TWILIO_API_PHONE_FROM`];

    if (!accountSid || !authToken || !fromPhone) {
      return res.status(500).json({ error: `Twilio credentials missing for ORG_ID=${orgId}` });
    }

    const { to, body } = req.body;
    if (!to || !body) {
      return res.status(400).json({ error: '`to` and `body` are required' });
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
      console.warn('[WARN] Twilio error:', json);
      return res.status(response.status).json(json);
    }

    res.status(200).json({ status: 'sent', sid: json.sid });
  } catch (err) {
    console.error('[ERROR] POST /send-sms', err);
    res.status(500).json({ error: err.message });
  } finally {
    console.groupEnd();
  }
});

router.post('/send-batch', async (req, res) => {
  console.group('[DEBUG] POST /send-batch');
  try {
    const orgId = req.get('X-ORG-ID');
    if (!orgId) return res.status(400).json({ error: 'X-ORG-ID header is required' });

    const accountSid = process.env[`${orgId}_TWILIO_API_USERNAME`];
    const authToken = process.env[`${orgId}_TWILIO_API_PASSWORD`];
    const fromPhone = process.env[`${orgId}_TWILIO_API_PHONE_FROM`];

    if (!accountSid || !authToken || !fromPhone) {
      return res.status(500).json({ error: `Twilio credentials missing for ORG_ID=${orgId}` });
    }

    const { recipients, body } = req.body;
    if (!Array.isArray(recipients) || recipients.length === 0 || !body) {
      return res.status(400).json({ error: '`recipients[]` (non-empty) and `body` are required' });
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
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: payload,
        });

        const json = await response.json();
        if (!response.ok) {
          results.push({ to, status: 'error', error: json.message });
          continue;
        }

        results.push({ to, status: 'sent', sid: json.sid });
      } catch (err) {
        results.push({ to, status: 'error', error: err.message });
      }
    }

    res.status(200).json({ summary: { total: recipients.length }, results });
  } catch (err) {
    console.error('[ERROR] POST /send-batch', err);
    res.status(500).json({ error: err.message });
  } finally {
    console.groupEnd();
  }
});

module.exports = router;
// ------------------ FILE twilioIntegration.js END ------------------ //
