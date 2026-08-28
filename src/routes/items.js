const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function serialize(item) {
  return { ...item, badges: JSON.parse(item.badges || '[]') };
}

router.get('/', (req, res) => {
  const { category_id } = req.query;
  const rows = category_id
    ? db.prepare('SELECT * FROM items WHERE category_id = ? ORDER BY sort_order ASC, id ASC').all(category_id)
    : db.prepare('SELECT * FROM items ORDER BY category_id ASC, sort_order ASC, id ASC').all();
  res.json(rows.map(serialize));
});

router.post('/', (req, res) => {
  const {
    category_id,
    display_name,
    description = '',
    price = null,
    price_suffix = '',
    image_url = '',
    badges = [],
    is_available = 1,
    pos_product_id = null,
    pos_name_override = '',
  } = req.body || {};
  if (!category_id || !display_name) {
    return res.status(400).json({ error: 'category_id and display_name are required' });
  }
  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM items WHERE category_id = ?')
    .get(category_id).m;
  const info = db
    .prepare(
      `INSERT INTO items
        (category_id, display_name, description, price, price_suffix, image_url, badges, is_available, sort_order, pos_product_id, pos_name_override)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      category_id,
      display_name,
      description,
      price,
      price_suffix,
      image_url,
      JSON.stringify(badges),
      is_available ? 1 : 0,
      maxOrder + 1,
      pos_product_id,
      pos_name_override
    );
  res.status(201).json(serialize(db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const body = req.body || {};
  const merged = {
    display_name: body.display_name ?? existing.display_name,
    description: body.description ?? existing.description,
    price: body.price ?? existing.price,
    price_suffix: body.price_suffix ?? existing.price_suffix,
    image_url: body.image_url ?? existing.image_url,
    badges: body.badges !== undefined ? JSON.stringify(body.badges) : existing.badges,
    is_available: body.is_available !== undefined ? (body.is_available ? 1 : 0) : existing.is_available,
    pos_product_id: body.pos_product_id !== undefined ? body.pos_product_id : existing.pos_product_id,
    pos_name_override: body.pos_name_override ?? existing.pos_name_override,
  };
  db.prepare(
    `UPDATE items SET display_name=?, description=?, price=?, price_suffix=?, image_url=?, badges=?, is_available=?, pos_product_id=?, pos_name_override=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(
    merged.display_name,
    merged.description,
    merged.price,
    merged.price_suffix,
    merged.image_url,
    merged.badges,
    merged.is_available,
    merged.pos_product_id,
    merged.pos_name_override,
    existing.id
  );
  res.json(serialize(db.prepare('SELECT * FROM items WHERE id = ?').get(existing.id)));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  db.prepare('DELETE FROM items WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

router.post('/reorder', (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array is required' });
  const stmt = db.prepare('UPDATE items SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => ids.forEach((id, idx) => stmt.run(idx, id)));
  tx(order);
  res.json({ ok: true });
});

module.exports = router;
