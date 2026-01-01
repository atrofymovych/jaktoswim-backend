const express = require('express');
const { Webhook } = require('svix');
const { clerkClient } = require('@clerk/express');

const router = express.Router();

const WEBHOOK_SECRET = 'whsec_4niWOzRZdYjDcZ1ddEHe3LhrQ2x3haQI';

router.post('/', async (req, res) => {
  const svix_id = req.headers['svix-id'];
  const svix_timestamp = req.headers['svix-timestamp'];
  const svix_signature = req.headers['svix-signature'];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).json({ error: 'Missing Svix headers' });
  }

  let evt;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    evt = wh.verify(req.body.toString(), {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch (err) {
    console.error('🛑  Webhook verification failed:', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  return res.status(200).json({ status: 'ok' });
});

module.exports = router;
