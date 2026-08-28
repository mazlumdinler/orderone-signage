// src/db.js
// SQLite persistence layer for the OrderOne digital signage system.
// Uses better-sqlite3 (synchronous, fast, zero-config).
//
// DB_PATH env var lets you point this at a mounted persistent volume
// (e.g. on Railway: /data/signage.db) so data survives redeploys.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'signage.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  template TEXT NOT NULL DEFAULT 'classic',   -- layout template key used by the display renderer
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,       -- shown in the TV rotation
  rotation_seconds INTEGER NOT NULL DEFAULT 20,
  accent TEXT DEFAULT '',                     -- optional accent color override
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  note TEXT DEFAULT '',                       -- small header note, e.g. "HOUSE MADE BATTER"
  column_hint TEXT DEFAULT '',                -- which visual column/zone on the board template
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,                 -- name shown on the TV
  description TEXT DEFAULT '',
  price REAL,
  price_suffix TEXT DEFAULT '',               -- e.g. "+$5" for "Make Full Stack"
  image_url TEXT DEFAULT '',
  badges TEXT DEFAULT '[]',                   -- JSON array: spicy, double_spicy, egg, vegetarian, halal
  is_available INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  pos_product_id INTEGER REFERENCES pos_products(id) ON DELETE SET NULL,
  pos_name_override TEXT DEFAULT '',          -- manual POS name text, used when not linked via Square API
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Cached snapshot of the connected Square (or other POS) catalog, refreshed on demand.
CREATE TABLE IF NOT EXISTS pos_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'square',
  external_id TEXT NOT NULL,                  -- Square catalog object id (ITEM)
  variation_id TEXT DEFAULT '',               -- Square item_variation id used for price/name
  name TEXT NOT NULL,                         -- exact POS product name (e.g. Square item name)
  variation_name TEXT DEFAULT '',
  price REAL,
  currency TEXT DEFAULT 'USD',
  raw_json TEXT DEFAULT '',
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(provider, external_id, variation_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Heartbeat table so the admin panel can show which TVs are currently online.
CREATE TABLE IF NOT EXISTS display_pings (
  device_id TEXT PRIMARY KEY,
  board_slug TEXT,
  last_seen TEXT,
  user_agent TEXT
);
`);

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

module.exports = { db, getSetting, setSetting, DB_PATH };
