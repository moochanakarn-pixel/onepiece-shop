const API = 'api/index.php?path=';
let activeTab = 'dashboard';
let _cards = {};
let _sellCards = [];
let _renderToken = 0;   // render lock: ignore stale async results
let _submitLock = {};   // prevent double-submit per action
let _toastTimer = null;
let _msgTimers  = {};

// ─── UTILS
const fmt = n => '฿' + Number(n || 0).toLocaleString('th-TH', {minimumFractionDigits:0, maximumFractionDigits:0});

function c2pUrl(cardNo) {
  return cardNo
    ? 'https://card2price.com/card/' + encodeURIComponent(String(cardNo).trim())
    : 'https://card2price.com/cards';
}

function rarityBadge(r) {
  var map = {R:'b-r', SR:'b-sr', SEC:'b-sec', L:'b-l'};
  return (r && map[r])
    ? '<span class="badge ' + map[r] + '" style="margin-left:5px">' + r + '</span>'
    : '';
}

async function api(path, method, body) {
  method = method || 'GET';
  try {
    var opts = {method: method, headers: {'Content-Type': 'application/json'}};
    if (body) opts.body = JSON.stringify(body);
    var res = await fetch(API + path, opts);
    if (!res.ok) return {};
    return await res.json();
  } catch (e) {
    console.warn('API error:', path, e.message);
    return {};
  }
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── TOAST  (floating pill, auto-dismiss)
function toast(text, ok) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.className = 'show ' + (ok !== false ? 'toast-ok' : 'toast-err');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () {
    el.className = '';
  }, ok !== false ? 3000 : 4000);
}

// inline msg (form validation errors)
function showMsg(elId, text, ok) {
  ok = ok !== false;
  var el = document.getElementById(elId);
  if (!el) return;
  el.className = 'msg ' + (ok ? 'msg-ok' : 'msg-err');
  el.textContent = text;
  clearTimeout(_msgTimers[elId]);
  if (ok) {
    _msgTimers[elId] = setTimeout(function () {
      el.className = ''; el.textContent = '';
    }, 3500);
  }
}

// ─── BUTTON LOCK  (ป้องกันกดซ้ำ)
function lockBtn(key, btn, loadText) {
  if (_submitLock[key]) return false;
  _submitLock[key] = true;
  if (btn) { btn.disabled = true; if (loadText) btn.textContent = loadText; }
  return true;
}
function unlockBtn(key, btn, origText) {
  _submitLock[key] = false;
  if (btn) { btn.disabled = false; if (origText) btn.textContent = origText; }
}

// ─── REFRESH BUTTON
function refreshTab() {
  var btn = document.getElementById('refresh-btn');
  if (btn) {
    btn.classList.add('spinning');
    setTimeout(function () { btn.classList.remove('spinning'); }, 500);
  }
  _renderToken++;
  render();
}

// ─── CUSTOM MODAL  (replaces confirm() and prompt())
var _modalCb = null;
var _modalIsPrompt = false;

function showConfirm(title, msg, onOk) {
  var overlay = document.getElementById('modal-overlay');
  var inp = document.getElementById('modal-input');
  var okBtn = document.getElementById('modal-ok-btn');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').textContent = msg;
  inp.style.display = 'none';
  _modalIsPrompt = false;
  _modalCb = onOk;
  okBtn.textContent = 'ลบ';
  okBtn.className = 'btn btn-danger-fill';
  overlay.style.display = 'flex';
}

function showPromptModal(title, def, onOk) {
  var overlay = document.getElementById('modal-overlay');
  var inp = document.getElementById('modal-input');
  var okBtn = document.getElementById('modal-ok-btn');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').textContent = '';
  inp.value = def != null ? def : '';
  inp.style.display = 'block';
  _modalIsPrompt = true;
  _modalCb = onOk;
  okBtn.textContent = 'บันทึก';
  okBtn.className = 'btn btn-primary';
  overlay.style.display = 'flex';
  setTimeout(function () { inp.focus(); inp.select(); }, 80);
}

function modalOk() {
  var overlay = document.getElementById('modal-overlay');
  var val = _modalIsPrompt ? document.getElementById('modal-input').value : true;
  overlay.style.display = 'none';
  var cb = _modalCb;
  _modalCb = null;
  if (cb) cb(val);
}

function modalCancel() {
  document.getElementById('modal-overlay').style.display = 'none';
  _modalCb = null;
}

function modalBgClick(e) {
  if (e.target === document.getElementById('modal-overlay')) modalCancel();
}

// ─── TABS
var TAB_KEYS = ['dashboard', 'stock', 'buy', 'sell', 'history'];

function setTab(t) {
  activeTab = t;
  _renderToken++;  // invalidate any in-flight renders from old tab
  document.querySelectorAll('.tab').forEach(function (el, i) {
    el.classList.toggle('active', TAB_KEYS[i] === t);
  });
  document.querySelectorAll('.bnav-btn').forEach(function (el, i) {
    el.classList.toggle('active', TAB_KEYS[i] === t);
  });
  TAB_KEYS.forEach(function (id) {
    document.getElementById('tab-' + id).style.display = id === t ? '' : 'none';
  });
  window.scrollTo({top: 0, behavior: 'smooth'});
  render();
}

// ─── SWIPE NAVIGATION  (left/right swipe = prev/next tab)
(function () {
  var sx = 0, sy = 0, disabled = false;
  document.addEventListener('touchstart', function (e) {
    var tag = (e.target || {}).tagName || '';
    disabled = /^(INPUT|SELECT|TEXTAREA)$/.test(tag);
    if (!disabled) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
  }, {passive: true});
  document.addEventListener('touchend', function (e) {
    if (disabled) return;
    var dx = e.changedTouches[0].clientX - sx;
    var dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 70) return;                   // too short
    if (Math.abs(dy) > Math.abs(dx) * 0.75) return;  // mostly vertical scroll
    var idx = TAB_KEYS.indexOf(activeTab);
    if (dx < 0 && idx < TAB_KEYS.length - 1) setTab(TAB_KEYS[idx + 1]);
    else if (dx > 0 && idx > 0)              setTab(TAB_KEYS[idx - 1]);
  }, {passive: true});
})();

// ─── CARD STORE
function saveCards(arr) {
  _cards = {};
  (arr || []).forEach(function (c) { _cards[c.id] = c; });
}

function checkPrice(id) {
  var c = _cards[id] || {};
  window.open(c2pUrl(c.card_no), '_blank');
}

function promptMarket(id) {
  var c = _cards[id];
  if (!c) return;
  showPromptModal(
    'อัปเดตราคาตลาด "' + c.name + '"',
    c.market_price || '',
    async function (val) {
      if (val === '' || val === null) return;
      await api('cards/' + id, 'PUT', {market_price: parseFloat(val) || 0});
      render();
    }
  );
}

function deleteCard(id) {
  var c = _cards[id] || {};
  showConfirm(
    'ลบการ์ดออกจากสต็อก',
    '"' + c.name + '" จะถูกลบถาวร',
    async function () {
      if (!lockBtn('del' + id)) return;
      await api('cards/' + id, 'DELETE');
      unlockBtn('del' + id);
      render();
    }
  );
}

// ─── CARD ITEM HTML
function cardItemHtml(c) {
  var market = Number(c.market_price) || 0;
  var cost   = Number(c.cost) || 0;
  var marketLine = market > 0
    ? '<div class="card-market">📈 ราคาตลาด ' + fmt(market) + ' · กำไร ' + fmt(market - cost) + '/ใบ</div>'
    : '<div class="card-market" style="color:var(--hint)">ยังไม่มีราคาตลาด — กดเช็คราคาเพื่ออัปเดต</div>';
  var meta = [c.card_set, c.card_no, 'ทุน ' + fmt(cost)].filter(Boolean).join(' · ');
  return '<div class="card-item" id="ci-' + c.id + '">'
    + '<div class="card-body">'
      + '<div class="card-name">' + esc(c.name) + rarityBadge(c.rarity)
        + '<span class="badge b-stock" style="margin-left:6px">' + c.qty + ' ใบ</span></div>'
      + '<div class="card-meta">' + esc(meta) + '</div>'
      + marketLine
    + '</div>'
    + '<div class="card-actions btn-row">'
      + '<button class="btn btn-c2p" onclick="checkPrice(' + c.id + ')">เช็คราคา ↗</button>'
      + '<button class="btn" onclick="promptMarket(' + c.id + ')">฿ อัปเดต</button>'
      + '<button class="btn btn-danger" onclick="deleteCard(' + c.id + ')">✕</button>'
    + '</div>'
  + '</div>';
}

// ─── DASHBOARD
async function renderDashboard() {
  var token = _renderToken;
  var el = document.getElementById('tab-dashboard');
  el.innerHTML = '<div class="empty loading-pulse">กำลังโหลด...</div>';

  var results = await Promise.all([api('stats'), api('cards')]);
  if (token !== _renderToken) return;

  var stats    = results[0] || {};
  var cards    = Array.isArray(results[1]) ? results[1] : [];
  saveCards(cards);

  var unr      = Number(stats.unrealized) || 0;
  var topCards = cards.slice(0, 5);

  var html = '<div class="banner">'
    + '<p>ราคาตลาดอ้างอิงจาก <strong>card2price.com</strong> — กดเช็คราคาที่การ์ดเพื่อดูราคาล่าสุด แล้วอัปเดตได้เลย</p>'
    + '<button class="btn btn-c2p" onclick="window.open(\'https://card2price.com/cards\',\'_blank\')">🔗 card2price ↗</button>'
    + '</div>';

  html += '<div class="stats-grid">';
  [
    ['ต้นทุนรวม',           stats.total_cost,    false],
    ['รายรับรวม',           stats.total_revenue, false],
    ['กำไรขายแล้ว',       stats.total_profit,  true],
    ['กำไรยังไม่รับ',     unr,                 true],
    ['มูลค่าสต็อก (ทุน)',  stats.stock_value,   false],
    ['มูลค่าสต็อก (ตลาด)', stats.market_value,  false],
    ['ซื้อมาทั้งหมด',       null, false, (stats.total_bought || 0) + ' ใบ'],
    ['สต็อกคงเหลือ',       null, false, (stats.stock_count  || 0) + ' ใบ']
  ].forEach(function (s) {
    var val = s[3] !== undefined ? s[3] : fmt(s[1]);
    var cls = s[2] ? (Number(s[1]) >= 0 ? ' profit' : ' loss') : '';
    html += '<div class="stat"><div class="stat-label">' + s[0]
          + '</div><div class="stat-value' + cls + '">' + val + '</div></div>';
  });
  html += '</div>';

  html += '<div class="section-hd"><span class="section-title">การ์ดมูลค่าสูงสุดในสต็อก</span></div>'
       + '<div class="card-list">';
  if (topCards.length) {
    topCards.forEach(function (c) { html += cardItemHtml(c); });
  } else {
    html += '<div class="empty">ยังไม่มีสต็อก</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

// ─── STOCK
async function renderStock() {
  var token = _renderToken;
  var el = document.getElementById('tab-stock');
  el.innerHTML = '<input class="search-box" placeholder="🔍 ค้นหาชื่อ หรือ เลขการ์ด..." oninput="searchCards(this.value)">'
    + '<div class="section-hd"><span class="section-title" id="stock-count">กำลังโหลด...</span></div>'
    + '<div class="card-list loading-pulse" id="stock-list"></div>';
  var cards = await api('cards');
  if (token !== _renderToken) return;
  cards = Array.isArray(cards) ? cards : [];
  saveCards(cards);
  renderStockList(cards);
}

function renderStockList(cards) {
  var el = document.getElementById('stock-list');
  var ct = document.getElementById('stock-count');
  if (!el || !ct) return;
  ct.textContent = 'สต็อกทั้งหมด (' + cards.length + ' รายการ)';
  el.className = 'card-list';
  var html = '';
  cards.forEach(function (c) { html += cardItemHtml(c); });
  el.innerHTML = html || '<div class="empty">ไม่พบการ์ด</div>';
}

var _searchTimer;
function searchCards(q) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(function () {
    var q2 = q.trim().toLowerCase();
    if (!q2) { renderStockList(Object.values(_cards)); return; }
    var filtered = Object.values(_cards).filter(function (c) {
      return (c.name || '').toLowerCase().indexOf(q2) >= 0
          || (c.card_no || '').toLowerCase().indexOf(q2) >= 0;
    });
    renderStockList(filtered);
  }, 250);
}

// ─── BUY
function renderBuy() {
  document.getElementById('tab-buy').innerHTML =
    '<div class="form-section">'
    + '<div class="form-title">➕ บันทึกการซื้อการ์ด</div>'
    + '<div class="form-grid">'
      + '<div class="field form-full"><label>ชื่อการ์ด</label>'
        + '<input id="b-name" type="text" placeholder="เช่น ロロノア・ゾロ หรือ Zoro" autocomplete="off"'
        + ' onkeydown="if(event.key===\'Enter\')submitBuy()"></div>'
      + '<div class="field"><label>เซต / ภาค</label>'
        + '<input id="b-set" type="text" placeholder="OP-01 ..."'
        + ' onkeydown="if(event.key===\'Enter\')submitBuy()"></div>'
      + '<div class="field"><label>เลขการ์ด</label>'
        + '<input id="b-no" type="text" placeholder="OP01-001"'
        + ' onkeydown="if(event.key===\'Enter\')submitBuy()"></div>'
      + '<div class="field"><label>ความหายาก</label>'
        + '<select id="b-rarity"><option value="">—</option><option>C</option><option>UC</option>'
        + '<option>R</option><option>SR</option><option>SEC</option><option>L</option></select></div>'
      + '<div class="field"><label>ต้นทุนต่อใบ (฿)</label>'
        + '<input id="b-cost" type="number" inputmode="decimal" min="0" placeholder="0"'
        + ' onkeydown="if(event.key===\'Enter\')submitBuy()"></div>'
      + '<div class="field"><label>จำนวน (ใบ)</label>'
        + '<input id="b-qty" type="number" inputmode="numeric" min="1" value="1"'
        + ' onkeydown="if(event.key===\'Enter\')submitBuy()"></div>'
      + '<div class="field-hint form-full">'
        + '<label>📌 ราคาตลาด card2price (฿) — ไม่บังคับ</label>'
        + '<div class="inner">'
          + '<input id="b-market" type="number" inputmode="decimal" min="0" placeholder="ใส่หลังเช็คราคาแล้ว"'
          + ' onkeydown="if(event.key===\'Enter\')submitBuy()">'
          + '<button class="btn btn-c2p" onclick="openC2PBuy()">เช็ค ↗</button></div></div>'
    + '</div>'
    + '<div class="form-actions">'
      + '<button id="buy-btn" class="btn btn-primary btn-full" onclick="submitBuy()">✓ บันทึก</button>'
    + '</div></div>'
    + '<div id="buy-msg"></div>';

  setTimeout(function () {
    var n = document.getElementById('b-name');
    if (n) n.focus();
  }, 100);
}

function openC2PBuy() {
  window.open(c2pUrl(document.getElementById('b-no').value.trim()), '_blank');
}

async function submitBuy() {
  var btn = document.getElementById('buy-btn');
  if (!lockBtn('buy', btn, 'กำลังบันทึก...')) return;

  var name   = document.getElementById('b-name').value.trim();
  var set    = document.getElementById('b-set').value.trim();
  var cardNo = document.getElementById('b-no').value.trim();
  var rarity = document.getElementById('b-rarity').value;
  var cost   = parseFloat(document.getElementById('b-cost').value)   || 0;
  var qty    = parseInt(document.getElementById('b-qty').value)      || 1;
  var market = parseFloat(document.getElementById('b-market').value) || 0;

  if (!name) {
    showMsg('buy-msg', 'กรุณาใส่ชื่อการ์ด', false);
    unlockBtn('buy', btn, '✓ บันทึก');
    return;
  }

  var res = await api('cards', 'POST', {
    name: name, card_set: set, card_no: cardNo,
    rarity: rarity, cost: cost, qty: qty, market_price: market
  });

  if (res && res.success) {
    toast('✓ บันทึก "' + name + '" ' + qty + ' ใบ ต้นทุน ' + fmt(cost));
    ['b-name', 'b-set', 'b-no', 'b-cost', 'b-market'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    document.getElementById('b-qty').value = '1';
    document.getElementById('b-rarity').value = '';
    document.getElementById('b-name').focus();
  } else {
    showMsg('buy-msg', (res && res.error) || 'เกิดข้อผิดพลาด', false);
  }
  unlockBtn('buy', btn, '✓ บันทึก');
}

// ─── SELL
async function renderSell() {
  var token = _renderToken;
  var el = document.getElementById('tab-sell');
  el.innerHTML = '<div class="empty loading-pulse">กำลังโหลด...</div>';

  var cards = await api('cards');
  if (token !== _renderToken) return;
  cards = Array.isArray(cards) ? cards : [];
  _sellCards = cards;
  saveCards(cards);

  if (!cards.length) {
    el.innerHTML = '<div class="empty">ไม่มีสต็อก</div>';
    return;
  }

  el.innerHTML =
    '<input class="search-box" id="sell-search" placeholder="🔍 ค้นหาการ์ดที่ต้องการขาย..." oninput="filterSell(this.value)">'
    + '<div id="sell-list"></div>'
    + '<div id="sell-msg"></div>';
  renderSellList(_sellCards);
}

function filterSell(q) {
  var q2 = q.trim().toLowerCase();
  var filtered = q2
    ? _sellCards.filter(function (c) {
        return (c.name || '').toLowerCase().indexOf(q2) >= 0
            || (c.card_no || '').toLowerCase().indexOf(q2) >= 0;
      })
    : _sellCards;
  renderSellList(filtered);
}

function renderSellList(cards) {
  var el = document.getElementById('sell-list');
  if (!el) return;
  if (!cards.length) { el.innerHTML = '<div class="empty">ไม่พบการ์ด</div>'; return; }
  var html = '';
  cards.forEach(function (c) {
    var market = Number(c.market_price) || 0;
    var defPrice = market > 0 ? market : '';
    var initProfit = defPrice ? _profitText(Number(c.cost), market, 1) : '';
    var initCls   = defPrice ? (market >= Number(c.cost) ? 'sell-profit-pos' : 'sell-profit-neg') : 'sell-profit-empty';
    html += '<div class="sell-card">'
      + '<div class="sell-name">' + esc(c.name) + rarityBadge(c.rarity) + '</div>'
      + '<div class="sell-meta">ทุน ' + fmt(c.cost) + ' · เหลือ ' + c.qty + ' ใบ'
        + (market > 0 ? ' · ตลาด ' + fmt(market) : '') + '</div>'
      + '<div id="sp-profit-' + c.id + '" class="sell-profit ' + initCls + '">' + initProfit + '</div>'
      + '<div class="sell-row-inputs">'
        + '<input class="sell-input" type="number" inputmode="decimal" placeholder="ราคาขาย (฿)"'
          + ' id="sp-' + c.id + '" value="' + (defPrice || '') + '"'
          + ' oninput="updateSellProfit(' + c.id + ')"'
          + ' onkeydown="if(event.key===\'Enter\')submitSell(' + c.id + ')">'
        + '<input class="sell-input" type="number" inputmode="numeric" placeholder="จำนวน"'
          + ' value="1" min="1" max="' + c.qty + '" id="sq-' + c.id + '"'
          + ' oninput="updateSellProfit(' + c.id + ')"'
          + ' onkeydown="if(event.key===\'Enter\')submitSell(' + c.id + ')">'
      + '</div>'
      + '<div class="sell-action-row">'
        + '<button class="btn btn-c2p" onclick="checkPrice(' + c.id + ')">เช็คราคา ↗</button>'
        + '<button class="btn btn-primary" id="sell-btn-' + c.id + '" style="flex:1"'
          + ' onclick="submitSell(' + c.id + ')">ขาย</button>'
      + '</div>'
    + '</div>';
  });
  el.innerHTML = html;
}

function _profitText(cost, price, qty) {
  var p = (price - cost) * qty;
  return (p >= 0 ? '📈 กำไร ' : '📉 ขาดทุน ') + fmt(Math.abs(p))
    + (qty > 1 ? ' (' + qty + ' ใบ)' : '');
}

function updateSellProfit(id) {
  var c = _cards[id];
  if (!c) return;
  var priceEl  = document.getElementById('sp-' + id);
  var qtyEl    = document.getElementById('sq-' + id);
  var profitEl = document.getElementById('sp-profit-' + id);
  if (!priceEl || !qtyEl || !profitEl) return;
  var price = parseFloat(priceEl.value) || 0;
  var qty   = parseInt(qtyEl.value)    || 1;
  if (!price) {
    profitEl.className   = 'sell-profit sell-profit-empty';
    profitEl.textContent = '';
    return;
  }
  var profit = (price - Number(c.cost)) * qty;
  profitEl.className   = 'sell-profit ' + (profit >= 0 ? 'sell-profit-pos' : 'sell-profit-neg');
  profitEl.textContent = _profitText(Number(c.cost), price, qty);
}

async function submitSell(id) {
  var btn = document.getElementById('sell-btn-' + id);
  if (!lockBtn('sell' + id, btn, 'กำลังขาย...')) return;

  var price = parseFloat(document.getElementById('sp-' + id).value) || 0;
  var qty   = parseInt(document.getElementById('sq-' + id).value)   || 1;

  if (!price) {
    showMsg('sell-msg', 'กรุณาใส่ราคาขาย', false);
    unlockBtn('sell' + id, btn, 'ขาย');
    return;
  }

  var res = await api('transactions', 'POST', {card_id: id, price: price, qty: qty});
  if (res && res.success) {
    var p = Number(res.profit) || 0;
    toast('✓ ขาย ' + qty + ' ใบ ที่ ' + fmt(price)
      + ' · ' + (p >= 0 ? 'กำไร' : 'ขาดทุน') + ' ' + fmt(Math.abs(p)));
    renderSell();
  } else {
    showMsg('sell-msg', (res && res.error) || 'เกิดข้อผิดพลาด', false);
    unlockBtn('sell' + id, btn, 'ขาย');
  }
}

// ─── HISTORY
async function renderHistory() {
  var token = _renderToken;
  var el = document.getElementById('tab-history');
  el.innerHTML = '<div class="empty loading-pulse">กำลังโหลด...</div>';

  var txns = await api('transactions?limit=100');
  if (token !== _renderToken) return;
  txns = Array.isArray(txns) ? txns : [];

  if (!txns.length) {
    el.innerHTML = '<div class="section-hd"><span class="section-title">ประวัติธุรกรรมล่าสุด</span></div>'
      + '<div class="empty">ยังไม่มีธุรกรรม</div>';
    return;
  }

  var html = '<div class="section-hd"><span class="section-title">ประวัติธุรกรรมล่าสุด</span></div>';
  txns.forEach(function (t) {
    var isBuy   = t.type === 'buy';
    var total   = Number(t.price) * Number(t.qty);
    var dateStr = t.created_at ? String(t.created_at).slice(0, 10) : '';
    var profitStr = '';
    if (!isBuy && t.profit != null) {
      var p = parseFloat(t.profit);
      profitStr = ' · ' + (p >= 0 ? 'กำไร' : 'ขาดทุน') + ' ' + fmt(Math.abs(p));
    }
    html += '<div class="history-item">'
      + '<div class="h-dot ' + (isBuy ? 'h-buy' : 'h-sell') + '"></div>'
      + '<div class="h-body">'
        + '<div class="h-name">' + esc(t.card_name) + '</div>'
        + '<div class="h-detail">' + (isBuy ? 'ซื้อเข้า' : 'ขายออก') + ' ' + t.qty
          + ' ใบ · ' + fmt(t.price) + '/ใบ' + profitStr + ' · ' + dateStr + '</div>'
      + '</div>'
      + '<div class="h-amt" style="color:' + (isBuy ? 'var(--blue)' : 'var(--green)') + '">'
        + (isBuy ? '−' : '+') + ' ' + fmt(total) + '</div>'
    + '</div>';
  });
  el.innerHTML = html;
}

// ─── RENDER
function render() {
  if      (activeTab === 'dashboard') { renderDashboard(); }
  else if (activeTab === 'stock')     { renderStock();     }
  else if (activeTab === 'buy')       { renderBuy();       }
  else if (activeTab === 'sell')      { renderSell();      }
  else if (activeTab === 'history')   { renderHistory();   }
}

render();
