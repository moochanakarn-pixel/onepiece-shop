const API = 'api/index.php?path=';
let activeTab = 'dashboard';
let _cards = {};
let _sellCards = [];
let _histTxns  = [];
let _renderToken = 0;
let _submitLock  = {};
let _toastTimer  = null;
let _msgTimers   = {};
let _histTimer;
let _searchTimer;

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

// ─── TOAST
function toast(text, ok) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.className = 'show ' + (ok !== false ? 'toast-ok' : 'toast-err');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { el.className = ''; }, ok !== false ? 3000 : 4000);
}

function showMsg(elId, text, ok) {
  ok = ok !== false;
  var el = document.getElementById(elId);
  if (!el) return;
  el.className = 'msg ' + (ok ? 'msg-ok' : 'msg-err');
  el.textContent = text;
  clearTimeout(_msgTimers[elId]);
  if (ok) {
    _msgTimers[elId] = setTimeout(function () { el.className = ''; el.textContent = ''; }, 3500);
  }
}

// ─── BUTTON LOCK
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

// ─── CUSTOM MODAL
var _modalCb = null;
var _modalIsPrompt = false;

function showConfirm(title, msg, onOk) {
  var overlay = document.getElementById('modal-overlay');
  var okBtn   = document.getElementById('modal-ok-btn');
  var box     = document.getElementById('modal-box');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').textContent   = msg;
  document.getElementById('modal-input').style.display = 'none';
  document.getElementById('modal-form').style.display  = 'none';
  box.classList.remove('wide');
  _modalIsPrompt = false;
  _modalCb = onOk;
  okBtn.textContent = 'ลบ';
  okBtn.className   = 'btn btn-danger-fill';
  overlay.style.display = 'flex';
}

function showPromptModal(title, def, onOk) {
  var overlay = document.getElementById('modal-overlay');
  var inp     = document.getElementById('modal-input');
  var okBtn   = document.getElementById('modal-ok-btn');
  var box     = document.getElementById('modal-box');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').textContent   = '';
  document.getElementById('modal-form').style.display = 'none';
  inp.value = def != null ? def : '';
  inp.style.display = 'block';
  box.classList.remove('wide');
  _modalIsPrompt = true;
  _modalCb = onOk;
  okBtn.textContent = 'บันทึก';
  okBtn.className   = 'btn btn-primary';
  overlay.style.display = 'flex';
  setTimeout(function () { inp.focus(); inp.select(); }, 80);
}

// ─── EDIT CARD MODAL
function showEditCard(id) {
  var c = _cards[id];
  if (!c) return;
  var overlay = document.getElementById('modal-overlay');
  var formEl  = document.getElementById('modal-form');
  var okBtn   = document.getElementById('modal-ok-btn');
  var box     = document.getElementById('modal-box');

  document.getElementById('modal-title').textContent      = 'แก้ไขการ์ด';
  document.getElementById('modal-msg').textContent        = '';
  document.getElementById('modal-input').style.display   = 'none';

  var rarOpts = ['','C','UC','R','SR','SEC','L'].map(function (r) {
    return '<option value="' + r + '"' + (c.rarity === r ? ' selected' : '') + '>'
      + (r || '—') + '</option>';
  }).join('');

  formEl.innerHTML =
    '<div class="edit-grid">'
    + '<div class="field edit-full"><label>ชื่อการ์ด</label>'
      + '<input id="ef-name" type="text" value="' + esc(c.name) + '"></div>'
    + '<div class="field"><label>เซต</label>'
      + '<input id="ef-set" type="text" value="' + esc(c.card_set || '') + '"></div>'
    + '<div class="field"><label>เลขการ์ด</label>'
      + '<input id="ef-no" type="text" value="' + esc(c.card_no || '') + '"></div>'
    + '<div class="field"><label>ความหายาก</label>'
      + '<select id="ef-rarity">' + rarOpts + '</select></div>'
    + '<div class="field"><label>ต้นทุน/ใบ (฿)</label>'
      + '<input id="ef-cost" type="number" inputmode="decimal" value="' + (c.cost || 0) + '"></div>'
    + '<div class="field"><label>จำนวนสต็อก</label>'
      + '<input id="ef-qty" type="number" inputmode="numeric" min="0" value="' + (c.qty || 0) + '"></div>'
    + '<div class="field edit-full"><label>ราคาตลาด (฿)</label>'
      + '<input id="ef-market" type="number" inputmode="decimal" value="' + (c.market_price || 0) + '"></div>'
    + '</div>';
  formEl.style.display = 'block';
  box.classList.add('wide');

  _modalIsPrompt = false;
  _modalCb = function () {
    var name   = (document.getElementById('ef-name')   || {value:''}).value.trim();
    var set    = (document.getElementById('ef-set')    || {value:''}).value.trim();
    var cardNo = (document.getElementById('ef-no')     || {value:''}).value.trim();
    var rarity = (document.getElementById('ef-rarity') || {value:''}).value;
    var cost   = parseFloat((document.getElementById('ef-cost')   || {value:'0'}).value) || 0;
    var qty    = parseInt((document.getElementById('ef-qty')    || {value:'0'}).value);
    if (isNaN(qty)) qty = 0;
    var market = parseFloat((document.getElementById('ef-market') || {value:'0'}).value) || 0;

    if (!name) { toast('กรุณาใส่ชื่อการ์ด', false); return; }

    api('cards/' + id, 'PUT', {
      name: name, card_set: set, card_no: cardNo,
      rarity: rarity, cost: cost, qty: qty, market_price: market
    }).then(function (res) {
      if (res && res.success) {
        toast('✓ แก้ไข "' + name + '" เรียบร้อย');
        render();
      } else {
        toast((res && res.error) || 'เกิดข้อผิดพลาด', false);
      }
    });
  };

  okBtn.textContent = 'บันทึก';
  okBtn.className   = 'btn btn-primary';
  overlay.style.display = 'flex';
  setTimeout(function () {
    var n = document.getElementById('ef-name');
    if (n) { n.focus(); n.select(); }
  }, 80);
}

function modalOk() {
  var overlay = document.getElementById('modal-overlay');
  var formEl  = document.getElementById('modal-form');
  var val = _modalIsPrompt ? document.getElementById('modal-input').value : true;
  overlay.style.display = 'none';
  if (formEl) formEl.style.display = 'none';
  var cb = _modalCb;
  _modalCb = null;
  if (cb) cb(val);
  if (formEl) formEl.innerHTML = '';
}

function modalCancel() {
  var overlay = document.getElementById('modal-overlay');
  var formEl  = document.getElementById('modal-form');
  var box     = document.getElementById('modal-box');
  overlay.style.display = 'none';
  if (formEl) { formEl.style.display = 'none'; formEl.innerHTML = ''; }
  if (box) box.classList.remove('wide');
  _modalCb = null;
}

function modalBgClick(e) {
  if (e.target === document.getElementById('modal-overlay')) modalCancel();
}

// ─── CSV EXPORT
function _downloadCSV(filename, rows) {
  var csv = rows.map(function (r) {
    return r.map(function (v) {
      v = String(v == null ? '' : v);
      return /[,"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',');
  }).join('\n');
  var blob = new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

function exportStock() {
  var cards = Object.values(_cards);
  if (!cards.length) { toast('ไม่มีข้อมูลสต็อก', false); return; }
  var rows = [['ชื่อการ์ด','เซต','เลขการ์ด','ความหายาก','ต้นทุน/ใบ','จำนวน','ราคาตลาด','มูลค่ารวม(ทุน)']];
  cards.forEach(function (c) {
    rows.push([c.name, c.card_set||'', c.card_no||'', c.rarity||'',
               c.cost||0, c.qty||0, c.market_price||0,
               ((Number(c.cost)||0) * (Number(c.qty)||0))]);
  });
  _downloadCSV('stock_' + new Date().toISOString().slice(0,10) + '.csv', rows);
  toast('✓ Export สต็อก ' + cards.length + ' รายการ');
}

function exportHistory() {
  if (!_histTxns.length) { toast('ไม่มีข้อมูลประวัติ', false); return; }
  var rows = [['วันที่','ประเภท','ชื่อการ์ด','จำนวน','ราคา/ใบ','รวม','กำไร/ขาดทุน']];
  _histTxns.forEach(function (t) {
    var total = (Number(t.price)||0) * (Number(t.qty)||0);
    rows.push([
      String(t.created_at||'').slice(0,10),
      t.type === 'buy' ? 'ซื้อเข้า' : 'ขายออก',
      t.card_name||'', t.qty||0, t.price||0, total,
      t.profit != null ? t.profit : ''
    ]);
  });
  _downloadCSV('transactions_' + new Date().toISOString().slice(0,10) + '.csv', rows);
  toast('✓ Export ' + _histTxns.length + ' รายการ');
}

// ─── TABS
var TAB_KEYS = ['dashboard', 'stock', 'buy', 'sell', 'history'];

function setTab(t) {
  activeTab = t;
  _renderToken++;
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

// ─── SWIPE NAVIGATION
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
    if (Math.abs(dx) < 70) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.75) return;
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
    : '<div class="card-market" style="color:var(--hint)">ยังไม่มีราคาตลาด</div>';
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
      + '<button class="btn" onclick="showEditCard(' + c.id + ')">✎ แก้ไข</button>'
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
    ['กำไรขายแล้ว',        stats.total_profit,  true],
    ['กำไรยังไม่รับ',      unr,                 true],
    ['มูลค่าสต็อก (ทุน)',  stats.stock_value,   false],
    ['มูลค่าสต็อก (ตลาด)', stats.market_value,  false],
    ['ซื้อมาทั้งหมด',       null, false, (stats.total_bought || 0) + ' ใบ'],
    ['สต็อกคงเหลือ',        null, false, (stats.stock_count  || 0) + ' ใบ']
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
  el.innerHTML =
    '<input class="search-box" placeholder="🔍 ค้นหาชื่อ หรือ เลขการ์ด..." oninput="searchCards(this.value)">'
    + '<div class="section-hd">'
      + '<span class="section-title" id="stock-count">กำลังโหลด...</span>'
      + '<button class="btn btn-c2p" onclick="exportStock()">📥 Export</button>'
    + '</div>'
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

// ─── CARD SCAN (Tesseract.js OCR)
var _tWorker = null;

async function _getTWorker() {
  if (!_tWorker) _tWorker = await Tesseract.createWorker('eng');
  return _tWorker;
}

async function identifyCard(input) {
  var file = input.files[0];
  if (!file) return;

  var prevRow = document.getElementById('cs-prev');
  var imgEl   = document.getElementById('cs-thumb');
  if (imgEl)   imgEl.src = URL.createObjectURL(file);
  if (prevRow) prevRow.style.display = 'flex';
  _csStatus('กำลังอ่านตัวอักษรบนการ์ด...', '');
  var chipsEl = document.getElementById('cs-chips');
  if (chipsEl) chipsEl.innerHTML = '';

  if (typeof Tesseract === 'undefined') {
    _csStatus('โหลด OCR ไม่สำเร็จ — กรอกชื่อเองได้เลย', 'var(--red)');
    return;
  }

  try {
    var worker = await _getTWorker();
    var result = await worker.recognize(file);
    var text   = result.data.text || '';

    var m = text.replace(/[ \t]/g, '').match(/([A-Z]{1,3})(\d{1,2})-(\d{2,3})/);
    if (m) {
      var setCode = m[1];
      var setNum  = m[2].padStart(2, '0');
      var cardNum = m[3].padStart(3, '0');
      var cardNo  = setCode + setNum + '-' + cardNum;
      var noEl  = document.getElementById('b-no');
      var setEl = document.getElementById('b-set');
      if (noEl)  noEl.value  = cardNo;
      if (setEl) setEl.value = setCode + '-' + setNum;
    }

    var seen = {}, chips = [];
    (result.data.words || []).forEach(function (w) {
      if (w.confidence < 55) return;
      var t = w.text.replace(/[^A-Za-z\-']/g, '').trim();
      if (t.length < 3 || /^\d/.test(t) || seen[t.toLowerCase()]) return;
      seen[t.toLowerCase()] = true;
      chips.push(t);
    });

    var prefix = m
      ? '✓ ' + m[1] + m[2].padStart(2,'0') + '-' + m[3].padStart(3,'0') + '  '
      : 'ไม่พบเลขการ์ด  ';
    _csStatus(prefix + '· แตะคำเพื่อใช้เป็นชื่อ', m ? 'var(--green)' : '');
    _csChips(chips.slice(0, 16));
  } catch (e) {
    _csStatus('อ่านไม่สำเร็จ — กรอกชื่อเองได้เลย', 'var(--red)');
  }
}

function _csStatus(msg, color) {
  var el = document.getElementById('cs-status');
  if (el) { el.textContent = msg; el.style.color = color || ''; }
}

function _csChips(words) {
  var el = document.getElementById('cs-chips');
  if (!el) return;
  el.innerHTML = words.map(function (w) {
    return '<button class="id-chip" onclick="useChip(\'' + w.replace(/'/g, "\\'") + '\',this)">'
      + esc(w) + '</button>';
  }).join('');
}

function useChip(word, btn) {
  var n = document.getElementById('b-name');
  if (n) { n.value = word; n.focus(); }
  document.querySelectorAll('.id-chip').forEach(function (el) { el.classList.remove('used'); });
  if (btn) btn.classList.add('used');
}

// ─── BUY
function renderBuy() {
  document.getElementById('tab-buy').innerHTML =
    '<div class="form-section">'
    + '<div class="form-title">➕ บันทึกการซื้อการ์ด</div>'

    // card scan
    + '<div class="card-scan">'
      + '<div class="cs-top">'
        + '<span class="cs-icon">📷</span>'
        + '<div class="cs-texts">'
          + '<b class="cs-title">สแกนการ์ด</b>'
          + '<span class="cs-sub">อัพโหลดหรือถ่ายรูปการ์ด — ดึงเลขการ์ดอัตโนมัติ</span>'
        + '</div>'
      + '</div>'
      + '<div class="cs-ctrl">'
        + '<input type="file" id="cs-file" accept="image/*" style="display:none" onchange="identifyCard(this)">'
        + '<label class="btn btn-c2p" for="cs-file" style="cursor:pointer;flex-shrink:0">📷 เลือกรูป</label>'
        + '<span id="cs-status" class="cs-status">เลือกรูปการ์ดเพื่อดึงข้อมูล</span>'
      + '</div>'
      + '<div id="cs-prev" class="cs-prev" style="display:none">'
        + '<img id="cs-thumb" class="cs-thumb" alt="card">'
        + '<div id="cs-chips" class="id-chips"></div>'
      + '</div>'
    + '</div>'

    + '<div class="form-grid">'
      + '<div class="field form-full"><label>ชื่อการ์ด</label>'
        + '<input id="b-name" type="text" placeholder="เช่น Zoro หรือ โซโล่" autocomplete="off"'
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
    var initCls    = defPrice ? (market >= Number(c.cost) ? 'sell-profit-pos' : 'sell-profit-neg') : 'sell-profit-empty';
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

  var txns = await api('transactions?limit=2000');
  if (token !== _renderToken) return;
  txns = Array.isArray(txns) ? txns : [];
  _histTxns = txns;

  if (!txns.length) {
    el.innerHTML = '<div class="section-hd"><span class="section-title">ประวัติธุรกรรม</span></div>'
      + '<div class="empty">ยังไม่มีธุรกรรม</div>';
    return;
  }

  el.innerHTML =
    '<div class="hist-filter">'
      + '<input class="search-box" id="hist-q" placeholder="🔍 ค้นหาชื่อการ์ด..." oninput="filterHistory()">'
      + '<div class="hist-filter-row">'
        + '<select id="hist-type" class="hist-sel" onchange="filterHistory()">'
          + '<option value="">ทุกประเภท</option>'
          + '<option value="buy">ซื้อเข้า</option>'
          + '<option value="sell">ขายออก</option>'
        + '</select>'
        + '<input type="date" id="hist-from" class="hist-date" onchange="filterHistory()">'
        + '<input type="date" id="hist-to"   class="hist-date" onchange="filterHistory()">'
        + '<button class="btn" onclick="clearHistFilter()" title="ล้างตัวกรอง">✕</button>'
      + '</div>'
    + '</div>'
    + '<div class="section-hd">'
      + '<span class="section-title" id="hist-count"></span>'
      + '<button class="btn btn-c2p" onclick="exportHistory()">📥 Export</button>'
    + '</div>'
    + '<div id="hist-list"></div>';

  filterHistory();
}

function filterHistory() {
  clearTimeout(_histTimer);
  _histTimer = setTimeout(function () {
    var q    = ((document.getElementById('hist-q')    || {}).value || '').trim().toLowerCase();
    var type = ((document.getElementById('hist-type') || {}).value || '');
    var from = ((document.getElementById('hist-from') || {}).value || '');
    var to   = ((document.getElementById('hist-to')   || {}).value || '');

    var filtered = _histTxns.filter(function (t) {
      if (q    && !(t.card_name||'').toLowerCase().includes(q)) return false;
      if (type && t.type !== type) return false;
      var d = String(t.created_at||'').slice(0,10);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });

    renderHistList(filtered);
  }, 200);
}

function clearHistFilter() {
  ['hist-q','hist-from','hist-to'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var sel = document.getElementById('hist-type'); if (sel) sel.value = '';
  filterHistory();
}

function renderHistList(txns) {
  var listEl  = document.getElementById('hist-list');
  var countEl = document.getElementById('hist-count');
  if (!listEl) return;
  if (countEl) countEl.textContent = 'แสดง ' + txns.length + ' / ' + _histTxns.length + ' รายการ';
  if (!txns.length) { listEl.innerHTML = '<div class="empty">ไม่พบรายการ</div>'; return; }

  var html = '';
  txns.forEach(function (t) {
    var isBuy    = t.type === 'buy';
    var total    = Number(t.price) * Number(t.qty);
    var dateStr  = t.created_at ? String(t.created_at).slice(0, 10) : '';
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
  listEl.innerHTML = html;
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

// ─── PWA — Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('SW:', e.message);
    });
  });
}
