const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Shows which TVs have called /api/public/ping recently, so the admin can
// tell at a glance whether a screen is online (last seen < ~2 min ago).
router.get('/pings', (req, res) => {
  const rows = db.prepare('SELECT * FROM display_pings ORDER BY last_seen DESC').all();
  res.json(rows);
});

module.exports = router;
