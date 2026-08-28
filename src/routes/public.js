// src/routes/public.js
// Endpoints consumed by the TV display page. No authentication — these are
// meant to be hit by the LG TV browser on the restaurant's own network/WiFi,
// and the response never includes anything sensitive (no tokens, no pos ids).

const express = require('express');
const { db, getSetting } = require('../db');

const router = express.Router();

function publicItem(item) {
  return {
    id: item.id,
    name: item.display_name,
    description: item.description,
    price: item.price,
    price_suffix: item.price_suffix,
    image_url: item.image_url,
    badges: JSON.parse(item.badges || '[]'),
  };
}

function loadBoard(board) {
  const categories = db
    .prepare('SELECT * FROM categories WHERE board_id = ? ORDER BY sort_order ASC, id ASC')
    .all(board.id)
    .map((cat) => {
      const items = db
        .prepare(
          'SELECT * FROM items WHERE category_id = ? AND is_available = 1 ORDER BY sort_order ASC, id ASC'
        )
        .all(cat.id)
        .map(publicItem);
      return {
        id: cat.id,
        name: cat.name,
        note: cat.note,
        column_hint: cat.column_hint,
        items,
      };
    });
  return {
    id: board.id,
    slug: board.slug,
    name: board.name,
    subtitle: board.subtitle,
    template: board.template,
    accent: board.accent,
    rotation_seconds: board.rotation_seconds,
    restaurant_name: getSetting('restaurant_name', ''),
    categories,
  };
}

router.get('/boards', (req, res) => {
  const boards = db
    .prepare('SELECT id, slug, name, sort_order, rotation_seconds, is_active FROM boards WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')
    .all();
  res.json(boards);
});

router.get('/boards/:slug', (req, res) => {
  const board = db.prepare('SELECT * FROM boards WHERE slug = ?').get(req.params.slug);
  if (!board) return res.status(404).json({ error: 'Board bulunamadı' });
  res.json(loadBoard(board));
});

// Full rotation payload: all active boards fully populated in one call, so
// the TV can cache everything and switch boards locally without re-fetching.
router.get('/rotation', (req, res) => {
  const boards = db
    .prepare('SELECT * FROM boards WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')
    .all()
    .map(loadBoard);
  res.json({ boards, generated_at: new Date().toISOString() });
});

// TV heartbeat: the display page calls this every ~60s so the admin panel
// can show which screens are currently online (common in signage CMSs).
router.post('/ping', (req, res) => {
  const { device_id, board_slug } = req.body || {};
  if (!device_id) return res.status(400).json({ error: 'device_id gerekli' });
  db.prepare(
    `INSERT INTO display_pings (device_id, board_slug, last_seen, user_agent)
     VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(device_id) DO UPDATE SET board_slug=excluded.board_slug, last_seen=datetime('now'), user_agent=excluded.user_agent`
  ).run(device_id, board_slug || null, req.headers['user-agent'] || '');
  res.json({ ok: true });
});

module.exports = router;
