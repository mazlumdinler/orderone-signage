const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'board';
}

function uniqueSlug(base, excludeId) {
  let slug = slugify(base);
  let n = 1;
  const exists = (s) => {
    const row = excludeId
      ? db.prepare('SELECT id FROM boards WHERE slug = ? AND id != ?').get(s, excludeId)
      : db.prepare('SELECT id FROM boards WHERE slug = ?').get(s);
    return !!row;
  };
  let candidate = slug;
  while (exists(candidate)) {
    n += 1;
    candidate = `${slug}-${n}`;
  }
  return candidate;
}

router.get('/', (req, res) => {
  const boards = db.prepare('SELECT * FROM boards ORDER BY sort_order ASC, id ASC').all();
  res.json(boards);
});

router.get('/:id', (req, res) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  res.json(board);
});

router.post('/', (req, res) => {
  const { name, subtitle = '', template = 'classic', rotation_seconds = 20, accent = '' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Board name is required' });
  const slug = uniqueSlug(name);
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM boards').get().m;
  const info = db
    .prepare(
      `INSERT INTO boards (slug, name, subtitle, template, sort_order, rotation_seconds, accent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(slug, name, subtitle, template, maxOrder + 1, rotation_seconds, accent);
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(board);
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Board not found' });
  const {
    name = existing.name,
    subtitle = existing.subtitle,
    template = existing.template,
    is_active = existing.is_active,
    rotation_seconds = existing.rotation_seconds,
    accent = existing.accent,
    regenerate_slug = false,
  } = req.body || {};
  const slug = regenerate_slug ? uniqueSlug(name, existing.id) : existing.slug;
  db.prepare(
    `UPDATE boards SET name=?, subtitle=?, template=?, is_active=?, rotation_seconds=?, accent=?, slug=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(name, subtitle, template, is_active ? 1 : 0, rotation_seconds, accent, slug, existing.id);
  res.json(db.prepare('SELECT * FROM boards WHERE id = ?').get(existing.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Board not found' });
  db.prepare('DELETE FROM boards WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

// Bulk reorder: body = { order: [boardId, boardId, ...] } in desired order
router.post('/reorder', (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array is required' });
  const stmt = db.prepare('UPDATE boards SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((id, idx) => stmt.run(idx, id));
  });
  tx(order);
  res.json({ ok: true });
});

module.exports = router;
