const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { board_id } = req.query;
  const rows = board_id
    ? db.prepare('SELECT * FROM categories WHERE board_id = ? ORDER BY sort_order ASC, id ASC').all(board_id)
    : db.prepare('SELECT * FROM categories ORDER BY board_id ASC, sort_order ASC, id ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { board_id, name, note = '', column_hint = '' } = req.body || {};
  if (!board_id || !name) return res.status(400).json({ error: 'board_id ve name gerekli' });
  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE board_id = ?')
    .get(board_id).m;
  const info = db
    .prepare('INSERT INTO categories (board_id, name, note, column_hint, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(board_id, name, note, column_hint, maxOrder + 1);
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Kategori bulunamadı' });
  const {
    name = existing.name,
    note = existing.note,
    column_hint = existing.column_hint,
  } = req.body || {};
  db.prepare(
    `UPDATE categories SET name=?, note=?, column_hint=?, updated_at=datetime('now') WHERE id=?`
  ).run(name, note, column_hint, existing.id);
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(existing.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Kategori bulunamadı' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

router.post('/reorder', (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order dizisi gerekli' });
  const stmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => ids.forEach((id, idx) => stmt.run(idx, id)));
  tx(order);
  res.json({ ok: true });
});

module.exports = router;
