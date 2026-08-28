const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { BOARDS } = require('./seed-data');

function ensureAdminUser() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log(`[seed] Admin user created -> username: "${username}"`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`[seed] WARNING: using default password ("${password}"). Please change it after logging in.`);
  }
}

function ensureMenuSeeded() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM boards').get().c;
  if (count > 0) return;

  const insertBoard = db.prepare(
    `INSERT INTO boards (slug, name, subtitle, template, sort_order, rotation_seconds) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertCategory = db.prepare(
    `INSERT INTO categories (board_id, name, note, column_hint, sort_order) VALUES (?, ?, ?, ?, ?)`
  );
  const insertItem = db.prepare(
    `INSERT INTO items (category_id, display_name, description, price, price_suffix, badges, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    BOARDS.forEach((board, bIdx) => {
      const boardInfo = insertBoard.run(board.slug, board.name, board.subtitle || '', board.template || 'classic', bIdx, board.rotation_seconds || 20);
      const boardId = boardInfo.lastInsertRowid;
      (board.categories || []).forEach((cat, cIdx) => {
        const catInfo = insertCategory.run(boardId, cat.name, cat.note || '', cat.column_hint || '', cIdx);
        const catId = catInfo.lastInsertRowid;
        (cat.items || []).forEach((item, iIdx) => {
          insertItem.run(
            catId,
            item.display_name,
            item.description || '',
            item.price != null ? item.price : null,
            item.price_suffix || '',
            JSON.stringify(item.badges || []),
            iIdx
          );
        });
      });
    });
  });
  tx();
  console.log('[seed] Menu data (2 boards) loaded into the database.');
}

function ensureSeeded() {
  ensureAdminUser();
  ensureMenuSeeded();
}

module.exports = { ensureSeeded };
