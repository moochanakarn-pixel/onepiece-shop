const API = 'api/index.php?path=';
let activeTab = 'dashboard';
let _cards = {};

// ─── UTILS
const fmt = n => '฿' + Number(n || 0).toLocaleString('th-TH', {minimumFractionDigits:0, maximumFractionDigits:0});

function c2pUrl(cardNo) {
  return cardNo ? 'https://card2price.com/card/' + encodeURIComponent(String(cardNo).trim()) : 'https://card2price.com/cards';
}

function rarityBadge(r) {
  const map = {R:'b-r', SR:'b-sr', SEC:'b-sec', L:'b-l'};
  return (r && map[r]) ? '<span class="badge ' + map[r] + '" style="margin-left:5px">' + r + '</span>' : '';
}

async function api(path, method, body) {
  method = method || 'GET';
  try {
    var opts = { method: method, headers: {'Content-Type':'application/json'} };
    if (body) opts.body = JSON.stringify(body);
    var res = await fetch(API + path, opts);
    if (!res.ok) return {};
    return await res.json();
  } catch(e) {
    console.warn('API error:', path, e.message);
    return {};
  }
}

function showMsg(elId, text, ok) {
  ok = ok !== false;
  var el = document.getElementById(elId);
  if (!el) return;
  el.className = 'msg ' + (ok ? 'msg-ok' : 'msg-err');
  el.textContent = text;
  el.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── TABS
var TAB_KEYS = ['dashboard','stock','buy','sell','history'];

function setTab(t) {
  activeTab = t;
  document.querySelectorAll('.tab').forEach(function(el, i) {
    el.classList.toggle('active', TAB_KEYS[i] === t);
  });
  document.querySelectorAll('.bnav-btn').forEach(function(el, i) {
    el.classList.toggle('active', TAB_KEYS[i] === t);
  });
  TAB_KEYS.forEach(function(id) {
    document.getElementById('tab-' + id).style.display = id === t ? '' : 'none';
  });
  window.scrollTo({top:0, behavior:'smooth'});
  render();
}

// ─── CARD STORE
function saveCards(arr) {
  _cards = {};
  (arr || []).forEach(function(c) { _cards[c.id] = c; });
}

function checkPrice(id) {
  var c = _cards[id] || {};
  window.open(c2pUrl(c.card_no), '_blank');
}

async function promptMarket(id) {
  var c = _cards[id];
  if (!c) return;
  var val = prompt('ราคาตลาด "' + c.name + '" จาก card2price (฿)', c.market_price || '');
  if (val === null) return;
  await api('cards/' + id, 'PUT', { market_price: parseFloat(val) || 0 });
  render();
}

async function deleteCard(id) {
  var c = _cards[id] || {};
  if (!confirm('ลบการ์ด "' + c.name + '" ออกจากสต็อก?')) return;
  await api('cards/' + id, 'DELETE');
  render();
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
  var el = document.getElementById('tab-dashboard');
  el.innerHTML = '<div class="empty">กำลังโหลด...</div>';

  var results = await Promise.all([api('stats'), api('cards')]);
  var stats = results[0] || {};
  var cards = results[1] || [];
  saveCards(cards);

  var unr = Number(stats.unrealized) || 0;
  var topCards = Array.isArray(cards) ? cards.slice(0, 5) : [];

  var html = '<div class="banner">'
    + '<p>ราคาตลาดอ้างอิงจาก <strong>card2price.com</strong> — กดเช็คราคาที่การ์ดเพื่อดูราคาล่าสุด แล้วอัปเดตได้เลย</p>'
    + '<button class="btn btn-c2p" onclick="window.open(\'https://card2price.com/cards\',\'_blank\')">card2price ↗</button>'
    + '</div>';

  html += '<div class="stats-grid">';
  [
    ['ต้นทุนรวม',           stats.total_cost,     false],
    ['รายรับรวม',           stats.total_revenue,  false],
    ['กำไรขายแล้ว',       stats.total_profit,   true],
    ['กำไรยังไม่รับ',     unr,                  true],
    ['มูลค่าสต็อก (ทุน)',  stats.stock_value,    false],
    ['มูลค่าสต็อก (ตลาด)', stats.market_value,   false],
    ['ซื้อมาทั้งหมด',       null, false, (stats.total_bought||0)+' ใบ'],
    ['สต็อกคงเหลือ',       null, false, (stats.stock_count||0)+' ใบ']
  ].forEach(function(s) {
    var val = s[3] !== undefined ? s[3] : fmt(s[1]);
    var cls = s[2] ? (Number(s[1]) >= 0 ? ' profit' : ' loss') : '';
    html += '<div class="stat"><div class="stat-label">' + s[0] + '</div><div class="stat-value' + cls + '">' + val + '</div></div>';
  });
  html += '</div>';

  html += '<div class="section-hd"><span class="section-title">การ์ดมูลค่าสูงสุดในสต็อก</span></div><div class="card-list">';
  if (topCards.length) {
    topCards.forEach(function(c) { html += cardItemHtml(c); });
  } else {
    html += '<div class="empty">ยังไม่มีสต็อก</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

// ─── STOCK
async function renderStock() {
  var el = document.getElementById('tab-stock');
  // — บรรทัดที่เคย bug: oninput="searchCards(this.value")> — เครื่องหมาย " อยู่ผิดที่
  el.innerHTML = '<input class="search-box" placeholder="🔍 ค้นหาชื่อ หรือ เลขการ์ด..." oninput="searchCards(this.value)">'
    + '<div class="section-hd"><span class="section-title" id="stock-count">กำลังโหลด...</span></div>'
    + '<div class="card-list" id="stock-list"><div class="empty">กำลังโหลด...</div></div>';
  loadStock('');
}

async function loadStock(q) {
  var path = q ? 'cards&q=' + encodeURIComponent(q) : 'cards';
  var cards = await api(path);
  cards = Array.isArray(cards) ? cards : [];
  saveCards(cards);
  document.getElementById('stock-count').textContent = 'สต็อกทั้งหมด (' + cards.length + ' รายการ)';
  var html = '';
  cards.forEach(function(c) { html += cardItemHtml(c); });
  document.getElementById('stock-list').innerHTML = html || '<div class="empty">ไม่พบการ์ด</div>';
}

var searchTimer;
function searchCards(q) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function() { loadStock(q); }, 300);
}

// ─── BUY
function renderBuy() {
  document.getElementById('tab-buy').innerHTML =
    '<div class="form-section">'
    + '<div class="form-title">➕ บันทึกการซื้อการ์ด</div>'
    + '<div class="form-grid">'
      + '<div class="field form-full"><label>ชื่อการ์ด</label><input id="b-name" type="text" placeholder="เช่น ロロノア・ゾロ หรือ Zoro" autocomplete="off"></div>'
      + '<div class="field"><label>เซต / ภาค</label><input id="b-set" type="text" placeholder="OP-01, ST-01 ..."></div>'
      + '<div class="field"><label>เลขการ์ด</label><input id="b-no" type="text" placeholder="OP01-001"></div>'
      + '<div class="field"><label>ความหายาก</label><select id="b-rarity"><option value="">—</option><option>C</option><option>UC</option><option>R</option><option>SR</option><option>SEC</option><option>L</option></select></div>'
      + '<div class="field"><label>ต้นทุนต่อใบ (฿)</label><input id="b-cost" type="number" inputmode="decimal" min="0" placeholder="0"></div>'
      + '<div class="field"><label>จำนวน (ใบ)</label><input id="b-qty" type="number" inputmode="numeric" min="1" value="1"></div>'
      + '<div class="field-hint form-full"><label>📌 ราคาตลาด card2price.com (฿) — ไม่บังคับ</label>'
        + '<div class="inner"><input id="b-market" type="number" inputmode="decimal" min="0" placeholder="ใส่หลังเช็คราคาแล้ว">'
        + '<button class="btn btn-c2p" onclick="openC2PBuy()">เช็คก่อน ↗</button></div></div>'
    + '</div>'
    + '<div class="form-actions"><button class="btn btn-primary btn-full" onclick="submitBuy()">✓ บันทึก</button></div>'
    + '</div><div id="buy-msg"></div>';
}

function openC2PBuy() {
  window.open(c2pUrl(document.getElementById('b-no').value.trim()), '_blank');
}

async function submitBuy() {
  var name   = document.getElementById('b-name').value.trim();
  var set    = document.getElementById('b-set').value.trim();
  var cardNo = document.getElementById('b-no').value.trim();
  var rarity = document.getElementById('b-rarity').value;
  var cost   = parseFloat(document.getElementById('b-cost').value)   || 0;
  var qty    = parseInt(document.getElementById('b-qty').value)      || 1;
  var market = parseFloat(document.getElementById('b-market').value) || 0;

  if (!name) { showMsg('buy-msg', 'กรุณาใส่ชื่อการ์ด', false); return; }

  var res = await api('cards', 'POST', {name:name, card_set:set, card_no:cardNo, rarity:rarity, cost:cost, qty:qty, market_price:market});
  if (res && res.success) {
    showMsg('buy-msg', '✓ บันทึก "' + name + '" ' + qty + ' ใบ ต้นทุน ' + fmt(cost) + ' เรียบร้อย');
    ['b-name','b-cost','b-market'].forEach(function(id) { document.getElementById(id).value = ''; });
    document.getElementById('b-qty').value = '1';
  } else {
    showMsg('buy-msg', (res && res.error) || 'เกิดข้อผิดพลาด', false);
  }
}

// ─── SELL
async function renderSell() {
  var el = document.getElementById('tab-sell');
  el.innerHTML = '<div class="empty">กำลังโหลด...</div>';

  var cards = await api('cards');
  cards = Array.isArray(cards) ? cards : [];
  saveCards(cards);

  if (!cards.length) {
    el.innerHTML = '<div class="empty">ไม่มีสต็อก</div>';
    return;
  }

  var html = '<div class="section-hd"><span class="section-title">เลือกการ์ดที่ต้องการขาย</span></div><div id="sell-list">';
  cards.forEach(function(c) {
    var market = Number(c.market_price) || 0;
    html += '<div class="sell-card">'
      + '<div class="sell-name">' + esc(c.name) + rarityBadge(c.rarity) + '</div>'
      + '<div class="sell-meta">ทุน ' + fmt(c.cost) + ' · เหลือ ' + c.qty + ' ใบ' + (market > 0 ? ' · ตลาด ' + fmt(market) : '') + '</div>'
      + '<div class="sell-row-inputs">'
        + '<input class="sell-input" type="number" inputmode="decimal" placeholder="ราคาขาย (฿)" id="sp-' + c.id + '" value="' + (market > 0 ? market : '') + '">'
        + '<input class="sell-input" type="number" inputmode="numeric" placeholder="จำนวน" value="1" min="1" max="' + c.qty + '" id="sq-' + c.id + '">'
      + '</div>'
      + '<div class="sell-action-row">'
        + '<button class="btn btn-c2p" onclick="checkPrice(' + c.id + ')">เช็คราคา ↗</button>'
        + '<button class="btn btn-primary" style="flex:1" onclick="submitSell(' + c.id + ')">ขาย</button>'
      + '</div>'
    + '</div>';
  });
  html += '</div><div id="sell-msg"></div>';
  el.innerHTML = html;
}

async function submitSell(id) {
  var price = parseFloat(document.getElementById('sp-' + id).value) || 0;
  var qty   = parseInt(document.getElementById('sq-' + id).value)   || 1;
  if (!price) { showMsg('sell-msg', 'กรุณาใส่ราคาขาย', false); return; }
  var res = await api('transactions', 'POST', {card_id:id, price:price, qty:qty});
  if (res && res.success) {
    var p = Number(res.profit) || 0;
    showMsg('sell-msg', '✓ ขาย ' + qty + ' ใบ ที่ ' + fmt(price) + ' · ' + (p >= 0 ? 'กำไร' : 'ขาดทุน') + ' ' + fmt(Math.abs(p)));
    renderSell();
  } else {
    showMsg('sell-msg', (res && res.error) || 'เกิดข้อผิดพลาด', false);
  }
}

// ─── HISTORY
async function renderHistory() {
  var el = document.getElementById('tab-history');
  el.innerHTML = '<div class="empty">กำลังโหลด...</div>';
  var txns = await api('transactions?limit=100');
  txns = Array.isArray(txns) ? txns : [];
  if (!txns.length) {
    el.innerHTML = '<div class="section-hd"><span class="section-title">ประวัติธุรกรรมล่าสุด</span></div><div class="empty">ยังไม่มีธุรกรรม</div>';
    return;
  }
  var html = '<div class="section-hd"><span class="section-title">ประวัติธุรกรรมล่าสุด</span></div>';
  txns.forEach(function(t) {
    var isBuy = t.type === 'buy';
    var total = Number(t.price) * Number(t.qty);
    var dateStr = t.created_at ? String(t.created_at).slice(0,10) : '';
    var profitStr = '';
    if (!isBuy && t.profit != null) {
      var p = parseFloat(t.profit);
      profitStr = ' · ' + (p >= 0 ? 'กำไร' : 'ขาดทุน') + ' ' + fmt(Math.abs(p));
    }
    html += '<div class="history-item">'
      + '<div class="h-dot ' + (isBuy ? 'h-buy' : 'h-sell') + '"></div>'
      + '<div class="h-body">'
        + '<div class="h-name">' + esc(t.card_name) + '</div>'
        + '<div class="h-detail">' + (isBuy ? 'ซื้อเข้า' : 'ขายออก') + ' ' + t.qty + ' ใบ · ' + fmt(t.price) + '/ใบ' + profitStr + ' · ' + dateStr + '</div>'
      + '</div>'
      + '<div class="h-amt" style="color:' + (isBuy ? 'var(--blue)' : 'var(--green)') + '">' + (isBuy ? '−' : '+') + ' ' + fmt(total) + '</div>'
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
