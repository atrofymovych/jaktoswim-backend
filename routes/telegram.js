const { clerkClient } = require('@clerk/express');
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// clerkClient is now imported directly from @clerk/express

router.post('/auth', async (req, res) => {
  const orgId = req.headers['x-org-id'];
  if (!orgId) {
    return res.status(401).json({ error: 'ORG ID not provided' });
  }

  const { templateName } = req.body;
  if (!templateName) {
    return res.status(400).json({ error: 'Missing templateName in request body' });
  }

  const initData = req.headers['x-telegram-init-data'];
  if (!initData) {
    return res.status(400).json({ error: 'Missing Telegram initData in X-Telegram-Init-Data header' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('🛑  TELEGRAM_BOT_TOKEN is not set.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const user = JSON.parse(params.get('user'));

    if (!hash || !user) {
      return res.status(400).json({ error: 'Invalid initData structure' });
    }

    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return res.status(403).json({ error: 'Invalid Telegram data signature' });
    }

    const telegramUserId = user.id.toString();

    let clerkUser;

    let existing = await clerkClient.users.getUserList({ externalId: telegramUserId });
    existing = existing.data;

    if (existing.length) {
      clerkUser = existing[0];
    } else {
      const phone = `+48${Math.floor(1e8 + Math.random() * 9e8)}`;
      clerkUser = await clerkClient.users.createUser({
        externalId: telegramUserId,
        emailAddress: [`${telegramUserId}@example.com`],
        firstName: user.first_name || 'not_available',
        lastName: user.last_name || 'not_available',
        username: user.username || 'not_available',
        phoneNumber: [phone],
        password: `${telegramUserId}_Secret!`,
      });
    }

    const session = await clerkClient.sessions.createSession({ userId: clerkUser.id });
    const token = await clerkClient.sessions.getToken(session.id, templateName);

    return res.json({
      token: token.jwt,
      userId: clerkUser.id,
    });
  } catch (err) {
    if (err.errors && Array.isArray(err.errors)) {
      console.warn('Clerk validation error:', err.errors);

      return res.status(400).json({
        error: 'Validation failed',
        details: err.errors.map((e) => ({
          code: e.code,
          message: e.message,
        })),
      });
    }
    console.error('🛑  Telegram Auth Error:', err);
    if (err.errors) {
      return res.status(400).json(err.errors);
    }
    return res.status(500).json({ error: 'Failed to authenticate with Telegram' });
  }
});

module.exports = router;
