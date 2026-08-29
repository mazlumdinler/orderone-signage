(function () {
  'use strict';

  var STYLE_MAP = {
    'sides-dark': 'panel-dark',
    'salads': 'panel-green',
    'drinks': 'panel-teal',
  };

  var COLS_BY_TEMPLATE = {
    'breakfast-classic': 4,
    'sandwich-classic': 4,
    'grid': 3,
  };

  // Real photos cropped from the restaurant's own original menu artwork,
  // matched to the category (by column_hint) they illustrated there.
  var PHOTO_MAP = {
    'plates': '/design/board1/breakfast-plates-collage.jpg',
    'french-toast': '/design/board1/french-toast-collage.jpg',
    'waffle-1': '/design/board1/waffle-1.jpg',
    'waffle-2': '/design/board1/waffle-2.jpg',
    'pancakes': '/design/board1/pancake-plate.jpg',
    'salads': '/design/board1/salad-photo.jpg',
    'pastries': '/design/board2/pastry-collage.jpg',
    'puddings': '/design/board2/pudding-fruit-photo.jpg',
    'sandwich-1': '/design/board2/croissant-bagel-diamond.jpg',
    'sandwich-2': '/design/board2/wrap-diamond.jpg',
    'sandwich-3': '/design/board2/panini-diamond.jpg',
  };

  // column_hints whose "photo" is used as a repeating background texture
  // on the panel itself, instead of a header image above the items.
  var TEXTURE_HINTS = { 'sides-dark': true };

  var CACHE_KEY = 'signage_cache_v1';
  var DEVICE_KEY = 'signage_device_id';
  var POLL_MS = 30000;
  var PING_MS = 60000;

  var stageEl = document.getElementById('stage');
  var clockEl = document.getElementById('clock');
  var connWarnEl = document.getElementById('conn-warning');

  var singleSlug = null;
  var m = location.pathname.match(/\/display\/([^\/]+)/);
  if (m && m[1]) singleSlug = decodeURIComponent(m[1]);

  var boards = [];
  var currentIndex = 0;
  var rotateTimer = null;
  var progressEl = null;
  var lastDataStr = '';

  function getDeviceId() {
    try {
      var id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = 'tv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch (e) {
      return 'tv-unknown';
    }
  }
  var deviceId = getDeviceId();

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Vector icons (not emoji) so badges render identically on every TV/browser,
  // regardless of which emoji font (if any) the device ships with.
  var BADGE_META = {
    spicy: { color: '#c23b22', label: 'Spicy', path: 'M12 3c-1.8 1.9-1.8 3.6-.7 4.8C8.6 8 6 10.4 6 13.5A6 6 0 0018 13.5c0-3.8-2.7-6.8-6-10.5z' },
    double_spicy: { color: '#c23b22', label: 'Extra Spicy', path: 'M8.5 14.5c1.4 0 2.5-1.1 2.5-2.5 0-1-.4-1.7-.9-2.6-1-1.9-.2-3.6 1.8-5.4.4 2.2 1.8 4.4 3.6 5.9 1.8 1.4 2.7 3.1 2.7 4.9a6.2 6.2 0 01-12.4 0c0-1 .4-2 .9-2.7.2 1.4 1.4 2.4 1.8 2.4z' },
    egg: { color: '#e0a731', label: 'Egg', path: null, shape: 'egg' },
    vegetarian: { color: '#3f8f3f', label: 'Vegetarian', path: 'M4 20C4 10.5 11.5 4 20 4c0 8.5-6.5 16-16 16zM4 20c3-6 8-10 15-13' },
    halal: { color: '#5a4a35', label: 'Halal Meat', path: 'M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z' },
  };

  function badgeIconSvg(key) {
    var meta = BADGE_META[key];
    if (!meta) return '';
    var inner;
    if (key === 'egg') {
      inner = '<ellipse cx="12" cy="13" rx="6.5" ry="8.5" fill="' + meta.color + '"/>';
    } else if (key === 'vegetarian') {
      inner = '<path d="' + meta.path + '" fill="none" stroke="' + meta.color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
    } else {
      inner = '<path d="' + meta.path + '" fill="' + meta.color + '"/>';
    }
    return '<svg class="badge-icon" viewBox="0 0 24 24" width="15" height="15" title="' + esc(meta.label) + '">' + inner + '</svg>';
  }

  function badgesHtml(badges) {
    if (!badges || !badges.length) return '';
    var out = '';
    for (var i = 0; i < badges.length; i++) {
      out += badgeIconSvg(badges[i]);
    }
    return out;
  }

  function collectUsedBadges(board) {
    var seen = {};
    board.categories.forEach(function (c) {
      (c.items || []).forEach(function (it) {
        (it.badges || []).forEach(function (b) { seen[b] = true; });
      });
    });
    return Object.keys(seen);
  }

  function legendHtml(board) {
    var used = collectUsedBadges(board);
    if (!used.length) return '';
    var parts = used.map(function (key) {
      var meta = BADGE_META[key];
      if (!meta) return '';
      return '<span>' + badgeIconSvg(key) + ' ' + esc(meta.label) + '</span>';
    });
    return '<div class="board-footer">' + parts.join('') + '</div>';
  }

  function formatPrice(value) {
    // Whole-dollar prices show without decimals ($17), fractional ones keep them ($3.50 -> $3.5 style used on the original menu, but we keep 2dp for clarity when not whole).
    var n = Number(value);
    var str = (Math.round(n * 100) % 100 === 0) ? String(Math.round(n)) : n.toFixed(2).replace(/0$/, '');
    return str;
  }

  function renderItem(item) {
    var priceHtml = '';
    if (item.price != null) {
      priceHtml = '<span class="menu-item-price"><span class="menu-item-price-dollar">$</span>' + formatPrice(item.price) + '</span>';
    }
    if (item.price_suffix) {
      priceHtml += '<span class="menu-item-price-suffix">' + esc(item.price_suffix) + '</span>';
    }
    var photo = item.image_url ? '<img class="menu-item-photo" src="' + esc(item.image_url) + '" loading="lazy" />' : '';
    var desc = item.description ? '<div class="menu-item-desc">' + esc(item.description) + '</div>' : '';
    return (
      '<div class="menu-item">' +
        photo +
        '<div class="menu-item-row">' +
          '<div class="menu-item-name-wrap"><span class="menu-item-name">' + esc(item.name) + '</span>' +
          '<span class="menu-item-badges">' + badgesHtml(item.badges) + '</span></div>' +
          (priceHtml ? '<div class="menu-item-price-wrap"><span class="menu-item-sep">|</span><div class="menu-item-leader">' + priceHtml + '</div></div>' : '') +
        '</div>' +
        desc +
      '</div>'
    );
  }

  function renderCategory(cat) {
    var styleClass = STYLE_MAP[cat.column_hint] || '';
    var wideItems = cat.items.length > 6 ? ' two-col' : '';
    var itemsHtml = cat.items.map(renderItem).join('');
    var photoUrl = PHOTO_MAP[cat.column_hint];
    var photoHtml = '';
    var textureStyle = '';
    if (photoUrl && TEXTURE_HINTS[cat.column_hint]) {
      textureStyle = ' style="--tex-url:url(' + esc(photoUrl) + ')"';
    } else if (photoUrl) {
      photoHtml = '<div class="cat-photo"><img src="' + esc(photoUrl) + '" alt="" loading="lazy" /></div>';
    }
    return (
      '<div class="category-card ' + styleClass + (photoHtml ? ' has-photo' : '') + '"' + textureStyle + '>' +
        photoHtml +
        '<div class="cat-head">' +
          '<div class="cat-name">' + esc(cat.name) + '</div>' +
          (cat.note ? '<div class="cat-note">' + esc(cat.note) + '</div>' : '') +
        '</div>' +
        '<div class="cat-items' + wideItems + '">' + itemsHtml + '</div>' +
      '</div>'
    );
  }

  function renderBoardPage(board, index) {
    var cols = COLS_BY_TEMPLATE[board.template] || 3;
    var categoriesHtml = board.categories
      .filter(function (c) { return c.items && c.items.length; })
      .map(renderCategory)
      .join('');

    var page = document.createElement('div');
    page.className = 'board-page';
    page.dataset.slug = board.slug;
    page.innerHTML =
      '<div class="board-topbar">' +
        '<div>' +
          (board.restaurant_name ? '<div class="restaurant-name">' + esc(board.restaurant_name) + '</div>' : '') +
          '<div class="board-title">' + esc(board.name) + '</div>' +
        '</div>' +
        (board.subtitle ? '<div class="board-subtitle">' + esc(board.subtitle) + '</div>' : '') +
      '</div>' +
      '<div class="board-columns cols-' + cols + '">' + categoriesHtml + '</div>' +
      legendHtml(board);
    return page;
  }

  function buildStage(data) {
    stageEl.innerHTML = '';
    boards = data.boards || [];
    if (singleSlug) {
      boards = boards.filter(function (b) { return b.slug === singleSlug; });
    }
    if (!boards.length) {
      stageEl.innerHTML = '<div class="loading-screen">No menu found. Please create and activate at least one board from the admin panel.</div>';
      return;
    }
    boards.forEach(function (board, i) {
      stageEl.appendChild(renderBoardPage(board, i));
    });

    progressEl = document.createElement('div');
    progressEl.className = 'progress-bar';
    stageEl.appendChild(progressEl);

    currentIndex = Math.min(currentIndex, boards.length - 1);
    showBoard(currentIndex, true);
  }

  function showBoard(index, immediate) {
    var pages = stageEl.querySelectorAll('.board-page');
    for (var i = 0; i < pages.length; i++) pages[i].classList.remove('visible');
    if (!pages[index]) return;
    pages[index].classList.add('visible');
    currentIndex = index;

    sendPing(boards[index] ? boards[index].slug : '');

    if (rotateTimer) clearTimeout(rotateTimer);
    if (boards.length > 1) {
      var seconds = (boards[index] && boards[index].rotation_seconds) || 20;
      animateProgress(seconds);
      rotateTimer = setTimeout(function () {
        showBoard((index + 1) % boards.length);
      }, seconds * 1000);
    } else if (progressEl) {
      progressEl.style.transition = 'none';
      progressEl.style.width = '0%';
    }
  }

  function animateProgress(seconds) {
    if (!progressEl) return;
    progressEl.style.transition = 'none';
    progressEl.style.width = '0%';
    // force reflow so the transition below actually animates from 0
    void progressEl.offsetWidth;
    progressEl.style.transition = 'width ' + seconds + 's linear';
    progressEl.style.width = '100%';
  }

  function sendPing(slug) {
    try {
      fetch('/api/public/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, board_slug: slug }),
      }).catch(function () {});
    } catch (e) { /* ignore */ }
  }

  function loadFromCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function saveToCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function fetchAndRender(isInitial) {
    fetch('/api/public/rotation', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        connWarnEl.classList.add('hidden');
        var str = JSON.stringify(data.boards);
        if (str !== lastDataStr) {
          lastDataStr = str;
          saveToCache(data);
          buildStage(data);
        }
      })
      .catch(function (err) {
        if (isInitial) {
          var cached = loadFromCache();
          if (cached) {
            lastDataStr = JSON.stringify(cached.boards);
            buildStage(cached);
          } else {
            stageEl.innerHTML = '<div class="loading-screen">Unable to connect to the menu server…</div>';
          }
        }
        connWarnEl.classList.remove('hidden');
      });
  }

  function tickClock() {
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = hh + ':' + mm;
  }

  // Initial load
  stageEl.innerHTML = '<div class="loading-screen">Loading menu…</div>';
  fetchAndRender(true);
  setInterval(function () { fetchAndRender(false); }, POLL_MS);
  setInterval(function () { sendPing(boards[currentIndex] ? boards[currentIndex].slug : ''); }, PING_MS);
  tickClock();
  setInterval(tickClock, 15000);
})();
