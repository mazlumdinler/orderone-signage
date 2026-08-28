const express = require('express');
const { getSetting, setSetting } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Keys that are safe to ever be read back in full via the API.
const PUBLIC_KEYS = ['restaurant_name', 'square_environment', 'square_location_id'];
// square_access_token is write-only from the API's point of view: we return
// only whether it's set, never the raw token, once it has been saved.

router.get('/', (req, res) => {
  const out = {};
  PUBLIC_KEYS.forEach((k) => { out[k] = getSetting(k, ''); });
  const token = getSetting('square_access_token', '');
  out.square_access_token_set = !!token;
  out.square_last_synced_at = getSetting('square_last_synced_at', '');
  res.json(out);
});

router.put('/', (req, res) => {
  const body = req.body || {};
  PUBLIC_KEYS.forEach((k) => {
    if (body[k] !== undefined) setSetting(k, String(body[k]));
  });
  if (body.square_access_token) {
    setSetting('square_access_token', String(body.square_access_token));
  }
  res.json({ ok: true });
});

module.exports = router;
