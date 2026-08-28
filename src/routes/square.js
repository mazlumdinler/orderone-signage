// src/routes/square.js
// Real integration with Square's Catalog API so menu items in this admin
// panel can be linked to actual Square POS products by ID — the display
// name shown on the TV never has to match the name used at the register.
//
// Docs: https://developer.squareup.com/docs/catalog-api/what-it-does

const express = require('express');
const { db, getSetting, setSetting } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const SQUARE_VERSION = '2024-10-17';

function baseUrl() {
  const env = getSetting('square_environment', 'production');
  return env === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
}

async function squareFetch(pathAndQuery, options = {}) {
  const token = getSetting('square_access_token', '');
  if (!token) {
    const err = new Error('Square Access Token is not set. Add it from the Settings page first.');
    err.code = 'NO_TOKEN';
    throw err;
  }
  const resp = await fetch(`${baseUrl()}${pathAndQuery}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = (json.errors && json.errors.map((e) => e.detail).join('; ')) || `Square API error (${resp.status})`;
    const err = new Error(msg);
    err.status = resp.status;
    throw err;
  }
  return json;
}

// Pull the full item catalog from Square and cache it locally so the admin
// panel can offer a fast dropdown without hitting the API on every keystroke.
router.post('/sync', async (req, res) => {
  try {
    let cursor;
    const upserted = [];
    const upsertStmt = db.prepare(`
      INSERT INTO pos_products (provider, external_id, variation_id, name, variation_name, price, currency, raw_json, synced_at)
      VALUES ('square', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(provider, external_id, variation_id) DO UPDATE SET
        name=excluded.name, variation_name=excluded.variation_name, price=excluded.price,
        currency=excluded.currency, raw_json=excluded.raw_json, synced_at=datetime('now')
    `);

    do {
      const qs = new URLSearchParams({ types: 'ITEM' });
      if (cursor) qs.set('cursor', cursor);
      const data = await squareFetch(`/v2/catalog/list?${qs.toString()}`);
      const objects = data.objects || [];
      for (const obj of objects) {
        if (obj.type !== 'ITEM' || !obj.item_data) continue;
        const variations = obj.item_data.variations || [];
        if (variations.length === 0) {
          upsertStmt.run(obj.id, '', obj.item_data.name || '(unnamed)', '', null, 'USD', JSON.stringify(obj));
          upserted.push(obj.id);
        } else {
          for (const v of variations) {
            const vd = v.item_variation_data || {};
            const amount = vd.price_money ? vd.price_money.amount : null;
            const currency = vd.price_money ? vd.price_money.currency : 'USD';
            upsertStmt.run(
              obj.id,
              v.id,
              obj.item_data.name || '(unnamed)',
              variations.length > 1 ? vd.name || '' : '',
              amount != null ? amount / 100 : null,
              currency,
              JSON.stringify(obj)
            );
            upserted.push(v.id);
          }
        }
      }
      cursor = data.cursor;
    } while (cursor);

    setSetting('square_last_synced_at', new Date().toISOString());
    res.json({ ok: true, count: upserted.length });
  } catch (err) {
    const status = err.code === 'NO_TOKEN' ? 400 : err.status || 502;
    res.status(status).json({ error: err.message });
  }
});

// Search the locally cached Square product list (used to populate the
// "link to POS product" dropdown when editing a menu item).
router.get('/products', (req, res) => {
  const q = (req.query.q || '').trim();
  const rows = q
    ? db
        .prepare(
          `SELECT * FROM pos_products WHERE provider = 'square' AND (name LIKE ? OR variation_name LIKE ?)
           ORDER BY name ASC LIMIT 50`
        )
        .all(`%${q}%`, `%${q}%`)
    : db.prepare(`SELECT * FROM pos_products WHERE provider = 'square' ORDER BY name ASC LIMIT 200`).all();
  res.json(rows);
});

router.get('/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM pos_products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

module.exports = router;
