(function () {
  'use strict';

  const BADGE_LABELS = {
    spicy: '🌶️', double_spicy: '🔥', egg: '🍳', vegetarian: '🌱', halal: '☪️',
  };

  const state = {
    boards: [],
    activeBoardId: null,
    categories: [],       // categories of active board
    itemsByCat: {},        // categoryId -> items[]
    currentItem: null,     // {id, category_id, ...} being edited in modal (null = new)
    currentItemCategoryId: null,
    posLinkedProduct: null,
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $all = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  async function api(path, options) {
    const res = await fetch('/api' + path, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options,
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error((data && data.error) || `Hata (${res.status})`);
    return data;
  }

  // ---------- AUTH ----------
  async function checkAuth() {
    const me = await api('/auth/me');
    if (me.authenticated) {
      showApp(me.username);
    } else {
      showLogin();
    }
  }

  function showLogin() {
    $('#login-screen').classList.remove('hidden');
    $('#app').classList.add('hidden');
  }

  function showApp(username) {
    $('#login-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#whoami').textContent = username ? `👤 ${username}` : '';
    loadBoards();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-error').textContent = '';
    try {
      const username = $('#login-username').value.trim();
      const password = $('#login-password').value;
      const data = await api('/auth/login', { method: 'POST', body: { username, password } });
      showApp(data.username);
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    showLogin();
  });

  // ---------- TABS ----------
  $all('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $all('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      $all('.tab-panel').forEach((p) => p.classList.add('hidden'));
      $('#tab-' + btn.dataset.tab).classList.remove('hidden');
      if (btn.dataset.tab === 'square') loadSettings();
      if (btn.dataset.tab === 'screens') loadScreens();
    });
  });

  // ---------- BOARDS ----------
  async function loadBoards() {
    state.boards = await api('/boards');
    renderBoardList();
    if (!state.activeBoardId && state.boards.length) {
      selectBoard(state.boards[0].id);
    } else if (state.activeBoardId) {
      renderBoardDetail();
    }
  }

  function renderBoardList() {
    const ul = $('#board-list');
    ul.innerHTML = '';
    state.boards.forEach((board, idx) => {
      const li = document.createElement('li');
      li.className = (board.id === state.activeBoardId ? 'active ' : '') + (board.is_active ? '' : 'inactive');
      li.innerHTML = `
        <div>
          <div class="b-name">${esc(board.name)}</div>
          <div class="b-meta">${board.is_active ? 'Yayında' : 'Pasif'} · ${board.rotation_seconds}s</div>
        </div>
        <div class="b-order-btns">
          <button class="btn-icon" data-up="${board.id}" title="Yukarı taşı">▲</button>
          <button class="btn-icon" data-down="${board.id}" title="Aşağı taşı">▼</button>
        </div>`;
      li.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        selectBoard(board.id);
      });
      ul.appendChild(li);
    });
    ul.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => moveBoard(+b.dataset.up, -1)));
    ul.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => moveBoard(+b.dataset.down, 1)));
  }

  async function moveBoard(id, dir) {
    const idx = state.boards.findIndex((b) => b.id === id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= state.boards.length) return;
    const order = state.boards.map((b) => b.id);
    [order[idx], order[swapWith]] = [order[swapWith], order[idx]];
    await api('/boards/reorder', { method: 'POST', body: { order } });
    await loadBoards();
  }

  $('#add-board-btn').addEventListener('click', async () => {
    const name = prompt('Yeni menü panosu adı (örn: "Öğle Menüsü", "Tatlılar"):');
    if (!name) return;
    const board = await api('/boards', { method: 'POST', body: { name, template: 'grid' } });
    await loadBoards();
    selectBoard(board.id);
  });

  async function selectBoard(id) {
    state.activeBoardId = id;
    renderBoardList();
    await loadBoardDetail(id);
  }

  async function loadBoardDetail(boardId) {
    state.categories = await api('/categories?board_id=' + boardId);
    state.itemsByCat = {};
    await Promise.all(
      state.categories.map(async (cat) => {
        state.itemsByCat[cat.id] = await api('/items?category_id=' + cat.id);
      })
    );
    renderBoardDetail();
  }

  function renderBoardDetail() {
    const board = state.boards.find((b) => b.id === state.activeBoardId);
    const panel = $('#board-detail');
    if (!board) {
      panel.innerHTML = '<div class="empty-state">Soldan bir menü panosu seçin.</div>';
      return;
    }
    panel.innerHTML = `
      <div class="board-header-row">
        <h2>${esc(board.name)}</h2>
        <div class="row gap">
          <a class="btn-ghost btn-sm" href="/display/${esc(board.slug)}" target="_blank">▶ Önizle</a>
          <button class="btn-danger btn-sm" id="delete-board-btn">Panoyu Sil</button>
        </div>
      </div>
      <div class="board-fields">
        <div><label>Board Adı</label><input type="text" id="board-name" value="${escAttr(board.name)}" /></div>
        <div><label>Alt Başlık</label><input type="text" id="board-subtitle" value="${escAttr(board.subtitle || '')}" /></div>
        <div><label>Şablon</label>
          <select id="board-template">
            <option value="breakfast-classic" ${board.template === 'breakfast-classic' ? 'selected' : ''}>Klasik (kahvaltı/waffle stili)</option>
            <option value="sandwich-classic" ${board.template === 'sandwich-classic' ? 'selected' : ''}>Klasik (sandviç/tatlı stili)</option>
            <option value="grid" ${board.template === 'grid' ? 'selected' : ''}>Genel Amaçlı Izgara</option>
          </select>
        </div>
        <div><label>Rotasyon Süresi (saniye)</label><input type="number" id="board-rotation" value="${board.rotation_seconds}" min="5" /></div>
        <div class="full"><label><input type="checkbox" id="board-active" ${board.is_active ? 'checked' : ''} /> TV rotasyonunda göster (aktif)</label></div>
      </div>
      <button class="btn-primary btn-sm" id="save-board-btn">Board Bilgilerini Kaydet</button>
      <div id="board-save-msg" class="msg"></div>

      <div id="categories-container"></div>
      <button class="btn-secondary" id="add-category-btn" style="margin-top:16px">+ Yeni Kategori Ekle</button>
    `;

    $('#save-board-btn').addEventListener('click', saveBoardFields);
    $('#delete-board-btn').addEventListener('click', deleteBoardHandler);
    $('#add-category-btn').addEventListener('click', addCategoryHandler);

    renderCategories();
  }

  async function saveBoardFields() {
    const id = state.activeBoardId;
    const body = {
      name: $('#board-name').value.trim(),
      subtitle: $('#board-subtitle').value.trim(),
      template: $('#board-template').value,
      rotation_seconds: parseInt($('#board-rotation').value, 10) || 20,
      is_active: $('#board-active').checked,
    };
    await api('/boards/' + id, { method: 'PUT', body });
    $('#board-save-msg').textContent = 'Kaydedildi ✓';
    $('#board-save-msg').className = 'msg ok';
    await loadBoards();
    setTimeout(() => { const m = $('#board-save-msg'); if (m) m.textContent = ''; }, 2000);
  }

  async function deleteBoardHandler() {
    const board = state.boards.find((b) => b.id === state.activeBoardId);
    if (!confirm(`"${board.name}" panosunu ve içindeki tüm kategori/ürünleri silmek istediğinize emin misiniz?`)) return;
    await api('/boards/' + board.id, { method: 'DELETE' });
    state.activeBoardId = null;
    await loadBoards();
  }

  async function addCategoryHandler() {
    const name = prompt('Yeni kategori adı (örn: "Tatlılar", "İçecekler"):');
    if (!name) return;
    await api('/categories', { method: 'POST', body: { board_id: state.activeBoardId, name } });
    await loadBoardDetail(state.activeBoardId);
  }

  // ---------- CATEGORIES + ITEMS ----------
  function renderCategories() {
    const container = $('#categories-container');
    container.innerHTML = '';
    state.categories.forEach((cat, idx) => {
      const block = document.createElement('div');
      block.className = 'category-block';
      block.innerHTML = `
        <div class="category-head">
          <div class="category-head-left">
            <div style="flex:1">
              <input class="cat-name-input" value="${escAttr(cat.name)}" data-cat="${cat.id}" data-field="name" />
              <input class="category-note-input" placeholder="Kategori notu (opsiyonel, örn: 'Add Chicken +\$4')" value="${escAttr(cat.note || '')}" data-cat="${cat.id}" data-field="note" />
            </div>
          </div>
          <div class="category-actions">
            <button class="btn-icon" data-cat-up="${cat.id}" title="Yukarı taşı">▲</button>
            <button class="btn-icon" data-cat-down="${cat.id}" title="Aşağı taşı">▼</button>
            <button class="btn-icon" data-cat-del="${cat.id}" title="Kategoriyi sil">🗑</button>
          </div>
        </div>
        <table class="item-table"><tbody data-items-for="${cat.id}"></tbody></table>
        <div class="add-item-row"><button class="btn-secondary btn-sm" data-add-item="${cat.id}">+ Ürün Ekle</button></div>
      `;
      container.appendChild(block);

      const tbody = block.querySelector(`[data-items-for="${cat.id}"]`);
      (state.itemsByCat[cat.id] || []).forEach((item) => {
        const tr = document.createElement('tr');
        tr.className = item.is_available ? '' : 'unavailable';
        const badges = (item.badges || []).map((b) => BADGE_LABELS[b] || '').join(' ');
        tr.innerHTML = `
          <td style="width:44px">${item.image_url ? `<img class="item-thumb" src="${escAttr(item.image_url)}" />` : ''}</td>
          <td class="item-name-cell">${esc(item.display_name)}</td>
          <td class="item-badges-cell">${badges}</td>
          <td class="item-price-cell">${item.price != null ? '$' + Number(item.price).toFixed(2) : ''} ${esc(item.price_suffix || '')}</td>
          <td>${item.pos_product_id ? '🔗 Square' : (item.pos_name_override ? '📝 ' + esc(item.pos_name_override) : '<span class="muted small">bağlı değil</span>')}</td>
          <td style="text-align:right"><button class="btn-icon" data-edit-item="${item.id}" data-cat="${cat.id}">Düzenle</button></td>
        `;
        tbody.appendChild(tr);
      });
    });

    container.querySelectorAll('[data-cat-up]').forEach((b) => b.addEventListener('click', () => moveCategory(+b.dataset.catUp, -1)));
    container.querySelectorAll('[data-cat-down]').forEach((b) => b.addEventListener('click', () => moveCategory(+b.dataset.catDown, 1)));
    container.querySelectorAll('[data-cat-del]').forEach((b) => b.addEventListener('click', () => deleteCategory(+b.dataset.catDel)));
    container.querySelectorAll('[data-add-item]').forEach((b) => b.addEventListener('click', () => openItemModal(null, +b.dataset.addItem)));
    container.querySelectorAll('[data-edit-item]').forEach((b) => b.addEventListener('click', () => openItemModal(+b.dataset.editItem, +b.dataset.cat)));
    container.querySelectorAll('.cat-name-input, .category-note-input').forEach((input) => {
      input.addEventListener('change', () => saveCategoryField(input));
    });
  }

  async function saveCategoryField(input) {
    const catId = +input.dataset.cat;
    const field = input.dataset.field;
    await api('/categories/' + catId, { method: 'PUT', body: { [field]: input.value } });
    const cat = state.categories.find((c) => c.id === catId);
    if (cat) cat[field] = input.value;
  }

  async function moveCategory(id, dir) {
    const idx = state.categories.findIndex((c) => c.id === id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= state.categories.length) return;
    const order = state.categories.map((c) => c.id);
    [order[idx], order[swapWith]] = [order[swapWith], order[idx]];
    await api('/categories/reorder', { method: 'POST', body: { order } });
    await loadBoardDetail(state.activeBoardId);
  }

  async function deleteCategory(id) {
    const cat = state.categories.find((c) => c.id === id);
    if (!confirm(`"${cat.name}" kategorisini ve içindeki tüm ürünleri silmek istediğinize emin misiniz?`)) return;
    await api('/categories/' + id, { method: 'DELETE' });
    await loadBoardDetail(state.activeBoardId);
  }

  // ---------- ITEM MODAL ----------
  function openItemModal(itemId, categoryId) {
    state.currentItemCategoryId = categoryId;
    const item = itemId ? (state.itemsByCat[categoryId] || []).find((i) => i.id === itemId) : null;
    state.currentItem = item || null;
    state.posLinkedProduct = null;

    $('#item-modal-title').textContent = item ? 'Ürün Düzenle' : 'Yeni Ürün';
    $('#item-name').value = item ? item.display_name : '';
    $('#item-desc').value = item ? item.description || '' : '';
    $('#item-price').value = item && item.price != null ? item.price : '';
    $('#item-price-suffix').value = item ? item.price_suffix || '' : '';
    $('#item-image-preview').src = item && item.image_url ? item.image_url : '';
    $('#item-image-preview').style.visibility = item && item.image_url ? 'visible' : 'hidden';
    $('#item-image-file').value = '';
    $('#item-available').checked = item ? !!item.is_available : true;
    $('#item-pos-manual').value = item ? item.pos_name_override || '' : '';
    $('#item-pos-search').value = '';
    $('#item-pos-results').innerHTML = '';

    $all('.badge-check').forEach((cb) => { cb.checked = item ? (item.badges || []).includes(cb.value) : false; });

    $('#item-delete-btn').classList.toggle('hidden', !item);
    updatePosLinkedDisplay(item && item.pos_product_id ? { id: item.pos_product_id, name: '…' } : null);
    if (item && item.pos_product_id) {
      api('/square/products/' + item.pos_product_id).then((p) => updatePosLinkedDisplay(p)).catch(() => {});
    }

    $('#item-modal').classList.remove('hidden');
  }

  function closeItemModal() {
    $('#item-modal').classList.add('hidden');
    state.currentItem = null;
  }

  $all('[data-close-modal]').forEach((b) => b.addEventListener('click', closeItemModal));
  $('#item-modal').addEventListener('click', (e) => { if (e.target.id === 'item-modal') closeItemModal(); });

  $('#item-image-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Yükleme hatası'); return; }
    $('#item-image-preview').src = data.url;
    $('#item-image-preview').style.visibility = 'visible';
    $('#item-image-preview').dataset.uploadedUrl = data.url;
  });

  function updatePosLinkedDisplay(product) {
    state.posLinkedProduct = product;
    const box = $('#item-pos-linked');
    if (product) {
      box.classList.remove('hidden');
      $('#item-pos-linked-name').textContent = product.name + (product.variation_name ? ' — ' + product.variation_name : '') + (product.price != null ? ` ($${Number(product.price).toFixed(2)})` : '');
    } else {
      box.classList.add('hidden');
    }
  }

  $('#item-pos-unlink').addEventListener('click', () => updatePosLinkedDisplay(null));

  let posSearchTimer;
  $('#item-pos-search').addEventListener('input', (e) => {
    clearTimeout(posSearchTimer);
    const q = e.target.value.trim();
    posSearchTimer = setTimeout(async () => {
      const results = document.getElementById('item-pos-results');
      if (!q) { results.innerHTML = ''; return; }
      try {
        const products = await api('/square/products?q=' + encodeURIComponent(q));
        results.innerHTML = products.map((p) => `
          <div class="pos-item" data-pid="${p.id}">
            <span class="pn">${esc(p.name)}${p.variation_name ? ' — ' + esc(p.variation_name) : ''}</span>
            <span class="pp">${p.price != null ? '$' + Number(p.price).toFixed(2) : ''}</span>
          </div>`).join('') || '<div class="pos-item muted">Sonuç yok. Square ayarlarından senkronize ettiniz mi?</div>';
        results.querySelectorAll('[data-pid]').forEach((el) => {
          el.addEventListener('click', () => {
            const product = products.find((p) => p.id === +el.dataset.pid);
            updatePosLinkedDisplay(product);
            results.innerHTML = '';
            document.getElementById('item-pos-search').value = '';
          });
        });
      } catch (err) { results.innerHTML = `<div class="pos-item err">${esc(err.message)}</div>`; }
    }, 300);
  });

  $('#item-save-btn').addEventListener('click', async () => {
    const badges = $all('.badge-check').filter((cb) => cb.checked).map((cb) => cb.value);
    const body = {
      category_id: state.currentItemCategoryId,
      display_name: $('#item-name').value.trim(),
      description: $('#item-desc').value.trim(),
      price: $('#item-price').value === '' ? null : parseFloat($('#item-price').value),
      price_suffix: $('#item-price-suffix').value.trim(),
      image_url: $('#item-image-preview').dataset.uploadedUrl || $('#item-image-preview').src.replace(location.origin, '') || '',
      badges,
      is_available: $('#item-available').checked,
      pos_product_id: state.posLinkedProduct ? state.posLinkedProduct.id : null,
      pos_name_override: $('#item-pos-manual').value.trim(),
    };
    if (!body.display_name) { alert('Ürün adı gerekli'); return; }
    if (!$('#item-image-preview').src || $('#item-image-preview').style.visibility === 'hidden') body.image_url = '';

    if (state.currentItem) {
      await api('/items/' + state.currentItem.id, { method: 'PUT', body });
    } else {
      await api('/items', { method: 'POST', body });
    }
    closeItemModal();
    await loadBoardDetail(state.activeBoardId);
  });

  $('#item-delete-btn').addEventListener('click', async () => {
    if (!state.currentItem) return;
    if (!confirm(`"${state.currentItem.display_name}" ürününü silmek istediğinize emin misiniz?`)) return;
    await api('/items/' + state.currentItem.id, { method: 'DELETE' });
    closeItemModal();
    await loadBoardDetail(state.activeBoardId);
  });

  // ---------- SQUARE SETTINGS ----------
  async function loadSettings() {
    const s = await api('/settings');
    $('#setting-restaurant-name').value = s.restaurant_name || '';
    $('#setting-square-env').value = s.square_environment || 'production';
    $('#setting-square-location').value = s.square_location_id || '';
    $('#setting-square-token').value = '';
    $('#setting-square-token').placeholder = s.square_access_token_set ? 'Kayıtlı (değiştirmek için yeni token girin)' : 'Token girin';
    $('#token-status').textContent = s.square_access_token_set
      ? `Token kayıtlı. Son senkronizasyon: ${s.square_last_synced_at ? new Date(s.square_last_synced_at).toLocaleString('tr-TR') : 'henüz yapılmadı'}`
      : 'Henüz token girilmedi.';
    loadSquareProducts('');
  }

  $('#save-settings-btn').addEventListener('click', async () => {
    const body = {
      restaurant_name: $('#setting-restaurant-name').value.trim(),
      square_environment: $('#setting-square-env').value,
      square_location_id: $('#setting-square-location').value.trim(),
    };
    const token = $('#setting-square-token').value.trim();
    if (token) body.square_access_token = token;
    await api('/settings', { method: 'PUT', body });
    $('#settings-msg').textContent = 'Ayarlar kaydedildi ✓';
    $('#settings-msg').className = 'msg ok';
    loadSettings();
  });

  $('#sync-square-btn').addEventListener('click', async () => {
    const btn = $('#sync-square-btn');
    btn.disabled = true;
    $('#sync-msg').textContent = 'Senkronize ediliyor…';
    $('#sync-msg').className = 'msg';
    try {
      const result = await api('/square/sync', { method: 'POST' });
      $('#sync-msg').textContent = `${result.count} ürün/varyasyon senkronize edildi ✓`;
      $('#sync-msg').className = 'msg ok';
      loadSettings();
    } catch (err) {
      $('#sync-msg').textContent = err.message;
      $('#sync-msg').className = 'msg err';
    } finally {
      btn.disabled = false;
    }
  });

  let squareSearchTimer;
  $('#square-products-search').addEventListener('input', (e) => {
    clearTimeout(squareSearchTimer);
    squareSearchTimer = setTimeout(() => loadSquareProducts(e.target.value.trim()), 250);
  });

  async function loadSquareProducts(q) {
    const list = $('#square-products-list');
    try {
      const products = await api('/square/products' + (q ? '?q=' + encodeURIComponent(q) : ''));
      list.innerHTML = products.map((p) => `
        <div class="ppl-row"><span>${esc(p.name)}${p.variation_name ? ' — ' + esc(p.variation_name) : ''}</span><span>${p.price != null ? '$' + Number(p.price).toFixed(2) : ''}</span></div>
      `).join('') || '<div class="ppl-row muted">Henüz senkronize edilmiş ürün yok.</div>';
    } catch (err) {
      list.innerHTML = `<div class="ppl-row">${esc(err.message)}</div>`;
    }
  }

  // ---------- SCREENS ----------
  async function loadScreens() {
    $('#display-url-hint').textContent = location.origin + '/display';
    const pings = await api('/status/pings');
    const tbody = $('#screens-table tbody');
    tbody.innerHTML = pings.map((p) => {
      const last = new Date(p.last_seen + 'Z');
      const online = (Date.now() - last.getTime()) < 120000;
      return `<tr>
        <td>${esc(p.device_id)}</td>
        <td>${esc(p.board_slug || '-')}</td>
        <td>${last.toLocaleString('tr-TR')}</td>
        <td><span class="status-dot ${online ? 'online' : 'offline'}"></span>${online ? 'Çevrimiçi' : 'Çevrimdışı'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" class="muted">Henüz hiçbir ekran bağlanmadı.</td></tr>';
  }

  $('#refresh-screens-btn').addEventListener('click', loadScreens);

  // ---------- ACCOUNT ----------
  $('#change-password-btn').addEventListener('click', async () => {
    const currentPassword = $('#cp-current').value;
    const newPassword = $('#cp-new').value;
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      $('#cp-msg').textContent = 'Şifre güncellendi ✓';
      $('#cp-msg').className = 'msg ok';
      $('#cp-current').value = '';
      $('#cp-new').value = '';
    } catch (err) {
      $('#cp-msg').textContent = err.message;
      $('#cp-msg').className = 'msg err';
    }
  });

  // ---------- utils ----------
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escAttr(str) { return esc(str); }

  checkAuth();
})();
