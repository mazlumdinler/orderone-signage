require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const { UPLOAD_DIR } = require('./src/routes/upload');
require('./src/db'); // ensures schema exists before routes load
require('./src/seed').ensureSeeded();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.use(
  cookieSession({
    name: 'signage_session',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax',
  })
);

// Static assets
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.use('/display', express.static(path.join(__dirname, 'public', 'display')));
app.use('/design', express.static(path.join(__dirname, 'public', 'design'), { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(__dirname, 'public', 'shared')));

// API routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/boards', require('./src/routes/boards'));
app.use('/api/categories', require('./src/routes/categories'));
app.use('/api/items', require('./src/routes/items'));
app.use('/api/upload', require('./src/routes/upload').router);
app.use('/api/settings', require('./src/routes/settings'));
app.use('/api/square', require('./src/routes/square'));
app.use('/api/status', require('./src/routes/status'));
app.use('/api/public', require('./src/routes/public'));

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/', (req, res) => res.redirect('/admin'));

// SPA fallbacks so deep links / refresh work
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/display/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'display', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OrderOne Signage server running on port ${PORT}.`);
  console.log(`Admin panel:  http://localhost:${PORT}/admin`);
  console.log(`TV display:   http://localhost:${PORT}/display`);
});
