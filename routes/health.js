const express = require('express');
const router = express.Router();
const { getAuth } = require('@clerk/express');

router.get('/', (req, res) => {
  const { userId, orgId } = getAuth(req);
  res.status(200).json({
    status: 'ok',
    userId,
    orgId,
    timestamp: new Date(),
  });
});

module.exports = router;
