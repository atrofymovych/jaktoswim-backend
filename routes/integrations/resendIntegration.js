const { Resend } = require('resend');
const express = require('express');
const router = express.Router();

router.post('/send-email', async (req, res) => {
  try {
    const orgId = req.get('X-ORG-ID');
    if (!orgId) return res.status(400).json({ error: 'X-ORG-ID header is required' });

    const RESEND_API_KEY = process.env[`${orgId}_RESEND_API_KEY`];
    if (!RESEND_API_KEY) {
      console.error('[ERROR] Missing RESEND_API_KEY for org:', orgId);
      return res.status(500).json({ error: `Resend API key not found for ORG_ID=${orgId}` });
    }

    const { to, subject, html, from, scheduledAt } = req.body;
    if (!to || !subject || !html || !from) {
      return res.status(400).json({ error: 'to, subject, from, and html are required in body' });
    }

    const resend = new Resend(RESEND_API_KEY);
    const response = await resend.emails.send({
      from,
      to,
      subject,
      html,
      ...(scheduledAt && { scheduledAt: scheduledAt }),
    });

    res.json({ status: 'sent', id: response?.id });
  } catch (err) {
    console.error('[ERROR] POST /send-email', err);
    res.status(500).json({ error: err.message });
  } finally {
    console.groupEnd();
  }
});

router.post('/send-batch', async (req, res) => {
  console.group('[DEBUG] POST /resend/send-batch');
  try {
    const orgId = req.get('X-ORG-ID');
    if (!orgId) return res.status(400).json({ error: 'X-ORG-ID header is required' });

    const RESEND_API_KEY = process.env[`${orgId}_RESEND_API_KEY`];
    if (!RESEND_API_KEY) {
      return res.status(500).json({ error: `Resend API key not found for ORG_ID=${orgId}` });
    }

    const { subject, html, from, recipients, scheduledAt } = req.body;
    if (!subject || !html || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: '`subject`, `html`, and non-empty `recipients[]` are required' });
    }

    const resend = new Resend(RESEND_API_KEY);
    const results = [];

    for (const to of recipients) {
      try {
        const resp = await resend.emails.send({
          from,
          to,
          subject,
          html,
          ...(scheduledAt && { scheduledAt: scheduledAt }),
        });
        results.push({ to, status: 'sent', id: resp?.id || null });
      } catch (err) {
        console.warn(`[WARN] Failed to send to ${to}:`, err.message);
        results.push({ to, status: 'error', error: err.message });
      }
    }

    res.json({ summary: { total: recipients.length }, results });
  } catch (err) {
    console.error('[ERROR] POST /send-batch', err);
    res.status(500).json({ error: err.message });
  } finally {
    console.groupEnd();
  }
});

module.exports = router;
