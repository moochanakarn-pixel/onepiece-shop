const API = 'api/index.php?path=';
let activeTab = 'dashboard';

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt = n => '฿' + Number(n).toLocaleString('th-TH', {minimumFractionDigits:0, maximumFractionDigits:0});

function c2pUrl(cardNo) {
  return cardNo ? `https://card2price.com/card/${encodeURIComponent(cardNo.trim())}` : 'https://card2price.com/cards';
}

function rarityBadge(r) {
  const map = {R:'b-r',SR:'b-sr',SEC:'b-sec',L:'b-l'};
  return (r && map[r]) ? `<span class="badge ${map[r]}" style="margin-left:5px">${r}</span>` : '';
}

async function api(path, method='GET', body=null) {
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  return res.json();
}

function showMsg(elId, text, ok=true) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = 'msg ' + (ok ? 'msg-ok' : 'msg-err');
  el.textContent = text;
  el.scrollIntoView({behavior:'smooth', block:'nearest'});
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
const TAB_KEYS = ['dashboard','stock','buy','sell','history'];

function setTab(t) {
  activeTab = t;
  // sync top tabs (desktop)
  document.querySelectorAll('.tab').forEach((el,i) =>
    el.classList.toggle('active', TAB_KEYS[i] === t));
  // sync bottom nav (mobile)
  document.querySelectorAll('.bnav-btn').forEach((el,i) =>
    el.classList.toggle('active', TAB_KEYS[i] === t));
  // show/hide panes
  TAB_KEYS.forEach(id =>
    document.getElementById('tab-'+id).style.display = id===t ? '' : 'none');
  window.scrollTo({top:0, behavior:'smooth'});
  render();
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  const [stats, cards] = await Promise.all([api('stats'), api('cards')]);
  const el = document.getElementById('tab-dashboard');
  const unr = stats.unrealized || 0;

  el.innerHTML = `
  <div class="banner">
    <p>ราคาตลาดอ้างอิงจาก <strong>card2price.com</strong> — กดเช็คราคาที่การ์ดเพื่อดูราคาล่าสุด แล้วอัปเดตได้เลย</p>
    <button class="btn btn-c2p" onclick="window.open('https://card2price.com/cards','_blank')">🔗 เปิดเว็บ card2price ↗</button>
  </div>
  <div class="stats-grid">
    <div class="stat"><div class="stat-label">ต้นทุนรวม</div><div class="stat-value">${fmt(stats.total_cost)}</div></div>
    <div class="stat"><div class="stat-label">รายรับรวม</div><div class="stat-value">${fmt(stats.total_revenue)}</div></div>
    <div class="stat"><div class="stat-label">กำไรขายแล้ว</div><div class="stat-value ${stats.total_profit>=0?'profit':'loss'}">${fmt(stats.total_profit)}</div></div>
    <div class="stat"><div class="stat-label">กำไรยังไม่รับ</div><div class="stat-value ${unr>=0?'profit':'loss'}">${fmt(unr)}</div></div>
    <div class="stat"><div class="stat-label">มูลค่าสต็อก (ทุน)</div><div class="stat-value">${fmt(stats.stock_value)}</div></div>
    <div class="stat"><div class="stat-label">มูลค่าสต็อก (ตลาด)</div><div class="stat-value">${fmt(stats.market_value)}</div></div>
    <div class="stat"><div class="stat-label">ซื้อมาทั้งหมด</div><div class="stat-value">${stats.total_bought} ใบ</div></div>
    <div class="stat"><div class="stat-label">สต็อกคงเหลือ</div><div class="stat-value">${stats.stock_count} ใบ</div></div>
  </div>
  <div class="section-hd"><span class="section-title">การ์ดมูลค่าสูงสุดในสต็อก</span></div>
  <div class="card-list">
  ${(cards||[]).slice(0,5).map(c => cardItemHtml(c)).join('') || '<div class="empty">ยังไม่มีสต็อก</div>'}
  </div>`;
}

// ─── CARD ITEM ────────────────────────────────────────────────────────────────
function cardItemHtml(c) {
  const marketLine = c.market_price > 0
    ? `<div class="card-market">📈 ราคาตลาด ${fmt(c.market_price)} · กำไร ${fmt(c.market_price - c.cost)}/ใบ</div>`
    : `<div class="card-market" style="color:var(--hint)">ยังไม่มีราคาตลาด — กดเช็คราคาเพื่ออัปเดต</div>`;

  return `
  <div class="card-item" id="ci-${c.id}">
    <div class="card-body">
      <div class="card-name">${c.name}${rarityBadge(c.rarity)}<span class="badge b-stock" style="margin-left:6px">${c.qty} ใบ</span></div>
      <div class="card-meta">${[c.card_set, c.card_no, 'ทุน '+fmt(c.cost)].filter(Boolean).join(' · ')}</div>
      ${marketLine}
    </div>
    <div class="card-actions btn-row">
      <button class="btn btn-c2p" onclick="window.open('${c2pUrl(c.card_no)}','_blank')">เช็คราคา ↗</button>
      <button class="btn" onclick="promptMarket(${c.id},'${c.name.replace(/'/g,"\\'")}',${c.market_price||0})">฿ อัปเดต</button>
      <button class="btn btn-danger" onclick="deleteCard(${c.id})">✕</button>
    </div>
  </div>`;
}

// ─── STOCK ────────────────────────────────────────────────────────────────────
async function renderStock() {
  const el = document.getElementById('tab-stock');
  el.innerHTML = `
    <input class="search-box" placeholder="🔍 ค้นหาชื่อ หรือ เลขการ์ด..." oninput="searchCards(this.value)">
    <div class="section-hd"><span class="section-title" id="stock-count">กำลังโหลด...</span></div>
    <div class="card-list" id="stock-list"><div class="empty">กำลังโหลด...</div></div>`;
  loadStock('');
}

async function loadStock(q) {
  const cards = await api('cards' + (q ? `&q=${encodeURIComponent(q)}` : ''));
  document.getElementById('stock-count').textContent = `สต็อกทั้งหมด (${(cards||[]).length} รายการ)`;
  document.getElementById('stock-list').innerHTML =
    cards && cards.length ? cards.map(c => cardItemHtml(c)).join('') : '<div class="empty">ไม่พบการ์ด</div>';
}

let searchTimer;
function searchCards(q) { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadStock(q), 300); }

async function promptMarket(id, name, current) {
  const val = prompt(`ราคาตลาด "${name}" จาก card2price (฿)`, current || '');
  if (val === null) return;
  await api(`cards/${id}`, 'PUT', { market_price: parseFloat(val) || 0 });
  render();
}

async function deleteCard(id) {
  if (!confirm('ลบการ์ดนี้ออกจากสต็อก?')) return;
  await api(`cards/${id}`, 'DELETE');
  render();
}

// ─── BUY ──────────────────────────────────────────────────────────────────────
function renderBuy() {
  document.getElementById('tab-buy').innerHTML = `
  <div class="form-section">
    <div class="form-title">➕ บันทึกการซื้อการ์ด</div>
    <div class="form-grid">
      <div class="field form-full">
        <label>ชื่อการ์ด (ญี่ปุ่น/ไทย)</label>
        <input id="b-name" type="text" placeholder="เช่น ロロノア・ゾロ หรือ Zoro" autocomplete="off">
      </div>
      <div class="field">
        <label>เซต / ภาค</label>
        <input id="b-set" type="text" placeholder="OP-01, ST-01 ...">
      </div>
      <div class="field">
        <label>เลขการ์ด</label>
        <input id="b-no" type="text" placeholder="OP01-001">
      </div>
      <div class="field">
        <label>ความหายาก</label>
        <select id="b-rarity">
          <option value="">—</option>
          <option>C</option><option>UC</option><option>R</option>
          <option>SR</option><option>SEC</option><option>L</option>
        </select>
      </div>
      <div class="field">
        <label>ต้นทุนต่อใบ (฿)</label>
        <input id="b-cost" type="number" inputmode="decimal" min="0" placeholder="0">
      </div>
      <div class="field">
        <label>จำนวน (ใบ)</label>
        <input id="b-qty" type="number" inputmode="numeric" min="1" value="1">
      </div>
      <div class="field-hint form-full">
        <label>📌 ราคาตลาด card2price.com (฿) — ไม่บังคับ</label>
        <div class="inner">
          <input id="b-market" type="number" inputmode="decimal" min="0" placeholder="ใส่หลังเช็คราคาแล้ว">
          <button class="btn btn-c2p" onclick="openC2PBuy()">เช็คก่อน ↗</button>
        </div>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary btn-full" onclick="submitBuy()">✓ บันทึก</button>
    </div>
  </div>
  <div id="buy-msg"></div>`;
}

function openC2PBuy() {
  window.open(c2pUrl(document.getElementById('b-no').value.trim()), '_blank');
}

async function submitBuy() {
  const name   = document.getElementById('b-name').value.trim();
  const set    = document.getElementById('b-set').value.trim();
  const cardNo = document.getElementById('b-no').value.trim();
  const rarity = document.getElementById('b-rarity').value;
  const cost   = parseFloat(document.getElementById('b-cost').value) || 0;
  const qty    = parseInt(document.getElementById('b-qty').value) || 1;
  const market = parseFloat(document.getElementById('b-market').value) || 0;

  if (!name) { showMsg('buy-msg', 'กรุณาใส่ชื่อการ์ด', false); return; }

  const res = await api('cards', 'POST', {name, card_set:set, card_no:cardNo, rarity, cost, qty, market_price:market});
  if (res.success) {
    showMsg('buy-msg', `✓ บันทึก "${name}" ${qty} ใบ ต้นทุน ${fmt(cost)} เรียบร้อย`);
    ['b-name','b-cost','b-market'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('b-qty').value = '1';
  } else {
    showMsg('buy-msg', res.error || 'เกิดข้อผิดพลาด', false);
  }
}

// ─── SELL ─────────────────────────────────────────────────────────────────────
async function renderSell() {
  const cards = await api('cards');
  const el = document.getElementById('tab-sell');

  if (!cards || !cards.length) {
    el.innerHTML = '<div class="empty">ไม่มีสต็อก</div>';
    return;
  }

  el.innerHTML = `
  <div class="section-hd"><span class="section-title">เลือกการ์ดที่ต้องการขาย</span></div>
  <div id="sell-list">
  ${cards.map(c => `
    <div class="sell-card">
      <div class="sell-name">${c.name}${rarityBadge(c.rarity)}</div>
      <div class="sell-meta">ทุน ${fmt(c.cost)} · เหลือ ${c.qty} ใบ${c.market_price>0?' · ตลาด '+fmt(c.market_price):''}</div>
      <div class="sell-row-inputs">
        <input class="sell-input" type="number" inputmode="decimal"
          placeholder="ราคาขาย (฿)" id="sp-${c.id}"
          value="${c.market_price > 0 ? c.market_price : ''}">
        <input class="sell-input" type="number" inputmode="numeric"
          placeholder="จำนวน" value="1" min="1" max="${c.qty}" id="sq-${c.id}">
      </div>
      <div class="sell-action-row">
        <button class="btn btn-c2p" onclick="window.open('${c2pUrl(c.card_no)}','_blank')">เช็คราคา ↗</button>
        <button class="btn btn-primary" style="flex:1" onclick="submitSell(${c.id})">ขาย</button>
      </div>
    </div>`).join('')}
  </div>
  <div id="sell-msg"></div>`;
}

async function submitSell(id) {
  const price = parseFloat(document.getElementById('sp-'+id).value) || 0;
  const qty   = parseInt(document.getElementById('sq-'+id).value) || 1;

  if (!price) { showMsg('sell-msg', 'กรุณาใส่ราคาขาย', false); return; }

  const res = await api('transactions', 'POST', {card_id:id, price, qty});
  if (res.success) {
    const p = res.profit;
    showMsg('sell-msg', `✓ ขาย ${qty} ใบ ที่ ${fmt(price)} · ${p>=0?'กำไร':'ขาดทุน'} ${fmt(Math.abs(p))}`);
    renderSell();
  } else {
    showMsg('sell-msg', res.error || 'เกิดข้อผิดพลาด', false);
  }
}

// ─── HISTORY ──────────────────────────────────────────────────────────────────
async function renderHistory() {
  const txns = await api('transactions?limit=100');
  const el = document.getElementById('tab-history');

  el.innerHTML = `
  <div class="section-hd"><span class="section-title">ประวัติธุรกรรมล่าสุด</span></div>
  ${txns && txns.length ? txns.map(t => {
    const isBuy = t.type === 'buy';
    const total = (t.price * t.qty).toFixed(0);
    const dateStr = t.created_at ? t.created_at.slice(0,10) : '';
    const profitStr = !isBuy && t.profit != null
      ? ' · ' + (parseFloat(t.profit)>=0?'กำไร':'ขาดทุน') + ' ' + fmt(Math.abs(t.profit)) : '';
    return `
    <div class="history-item">
      <div class="h-dot ${isBuy?'h-buy':'h-sell'}"></div>
      <div class="h-body">
        <div class="h-name">${t.card_name}</div>
        <div class="h-detail">${isBuy?'ซื้อเข้า':'ขายออก'} ${t.qty} ใบ · ${fmt(t.price)}/ใบ${profitStr} · ${dateStr}</div>
      </div>
      <div class="h-amt" style="color:${isBuy?'var(--blue)':'var(--green)'}">${isBuy?'−':'+'} ${fmt(total)}</div>
    </div>`;
  }).join('') : '<div class="empty">ยังไม่มีธุรกรรม</div>'}`;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  if      (activeTab==='dashboard') renderDashboard();
  else if (activeTab==='stock')     renderStock();
  else if (activeTab==='buy')       renderBuy();
  else if (activeTab==='sell')      renderSell();
  else if (activeTab==='history')   renderHistory();
}

render();
