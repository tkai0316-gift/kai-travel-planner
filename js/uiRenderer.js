import {
  esc, safeUrl, TYPE_ICONS, TRANSPORT_ICONS, ICON_CHECK, ICON_GLOBE,
  formatDate, formatDateShort, formatCurrency,
} from './utils.js';

const collapsedSegs = new Set();
const expandedDays  = new Set();  // key: `${segId}:${dayIndex}`

const CURRENCIES = [
  ['TWD','台幣'],['USD','美元'],['JPY','日圓'],['EUR','歐元'],['GBP','英鎊'],
  ['HKD','港幣'],['SGD','新幣'],['KRW','韓元'],['AUD','澳幣'],['CNY','人民幣'],
  ['THB','泰銖'],['MYR','馬幣'],['IDR','印尼盾'],['PHP','披索'],['VND','越南盾'],
  ['CAD','加幣'],['CHF','瑞士法郎'],
];
function currencySelect(id, selected = 'TWD') {
  const found = CURRENCIES.find(([c]) => c === selected);
  const lbl   = found ? `${found[0]} ${found[1]}` : selected;
  const opts  = CURRENCIES.map(([c, n]) =>
    `<div class="cs-opt${c === selected ? ' cs-on' : ''}" data-val="${c}">${c} ${n}</div>`
  ).join('');
  return `<div class="cs cs-currency" id="${id}-cs">
    <input type="hidden" id="${id}" value="${esc(selected)}">
    <button class="cs-btn" type="button"><span class="cs-val">${esc(lbl)}</span><span class="cs-arr">▾</span></button>
    <div class="cs-opts">
      <input class="cs-search-input" type="text" placeholder="搜尋..." autocomplete="off">
      <div class="cs-opts-list">${opts}</div>
    </div>
  </div>`;
}

const ICON_CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

const STATUS_LABELS = { planning: '規劃中', ongoing: '進行中', completed: '已完成' };
const STATUS_BADGE  = { planning: 'badge-planning', ongoing: 'badge-ongoing', completed: 'badge-completed' };
const SEG_COLORS    = ['#0EA5E9','#8B5CF6','#22C55E','#F97316','#EF4444','#F59E0B','#EC4899','#64748B'];
const ICON_EDIT     = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;

/* ── Online / Offline ── */
export function setOnlineState(isOnline) {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = isOnline ? 'none' : 'block';
  const dot = document.getElementById('online-dot');
  if (dot) dot.style.background = isOnline ? '#34d399' : '#fbbf24';
  document.querySelectorAll('[data-edit]').forEach(el => {
    el.disabled = !isOnline;
    el.style.opacity = isOnline ? '' : '0.4';
    el.style.pointerEvents = isOnline ? '' : 'none';
  });
}

/* ── Tab Bar ── */
export function setActiveTab(tab) {
  ['trips', 'budget', 'prefs', 'data'].forEach(t => {
    const panel = document.getElementById(`panel-${t}`);
    const btn   = document.getElementById(`tab-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (btn)   btn.classList.toggle('active', t === tab);
  });
}

/* ── Trip Selector ── */
export function renderTripSelector(trips, activeTripId) {
  const btn = document.getElementById('trip-selector-btn');
  const label = document.getElementById('trip-selector-label');
  const list = document.getElementById('trip-selector-list');
  if (!btn || !list) return;
  const all = [...(trips.current_trips || []), ...(trips.past_trips || [])]
    .sort((a, b) => {
      const today = Date.now();
      const da = Math.abs(new Date(a.start_date || '').getTime() - today);
      const db = Math.abs(new Date(b.start_date || '').getTime() - today);
      return da - db;
    });
  if (all.length === 0) { if (label) label.textContent = '（尚無行程）'; list.innerHTML = ''; return; }
  const active = all.find(t => t.id === activeTripId) || all[0];
  if (label) label.textContent = active ? active.title : '';
  list.innerHTML = all.map(t =>
    `<li data-trip-id="${esc(t.id)}" class="${t.id === activeTripId ? 'active' : ''}">${esc(t.title)}</li>`
  ).join('');
}

/* ── Day Tabs ── */
export function renderDayTabs(trip) {
  const el = document.getElementById('day-tabs-container');
  if (!el) return;
  if (!trip) { el.innerHTML = ''; return; }

  const allDays = [];
  (trip.segments || []).forEach(seg => {
    (seg.daily || []).forEach(day => {
      if (day.date) allDays.push({ date: day.date, segId: seg.id });
    });
  });
  allDays.sort((a, b) => a.date.localeCompare(b.date));
  if (allDays.length === 0) { el.innerHTML = ''; return; }

  const today = new Date().toISOString().slice(0, 10);
  el.innerHTML = allDays.map((d, i) => {
    const isToday = d.date === today;
    return `<button class="day-tab-btn${isToday ? ' is-today-tab' : ''}" data-tab-date="${esc(d.date)}" data-seg-id="${esc(d.segId)}" type="button">
      <span class="day-tab-num">Day ${i + 1}</span>
      <span class="day-tab-date">${esc(d.date.slice(5))}</span>
    </button>`;
  }).join('');
}

/* ── Ensure segment is expanded (called from app.js day-tab click) ── */
export function ensureSegExpanded(segId) {
  collapsedSegs.delete(segId);
  const block = document.querySelector(`.seg-block[data-seg-id="${esc(segId)}"]`);
  if (!block) return;
  const body  = block.querySelector('.seg-body');
  const arrow = block.querySelector('.seg-arrow');
  if (body)  body.style.display = 'block';
  if (arrow) arrow.textContent = '▼';
}

/* ── Timeline ── */
export function renderTimeline(trip, weatherCache = {}) {
  const el = document.getElementById('timeline-content');
  if (!el) return;

  if (!trip) {
    el.innerHTML = `
      <div style="padding:8px var(--pp);border-bottom:1px solid var(--c-border)">
        <button class="btn btn-primary btn-sm btn-full" id="add-trip-btn" data-edit>＋ 新增行程</button>
      </div>
      <div class="empty-state">尚無行程資料<br><small>點擊上方按鈕新增</small></div>`;
    return;
  }

  const badgeClass = STATUS_BADGE[trip.status] || 'badge-planning';
  const today = new Date().toISOString().slice(0, 10);
  const totalDays  = (trip.segments || []).reduce((n, s) => n + (s.daily || []).length, 0);
  const totalDests = (trip.segments || []).flatMap(s => s.daily || []).filter(d => d.lat != null).length;
  const packing = trip.packing || [];
  const packedCount = packing.filter(p => p.done).length;
  const allPacked = packing.length > 0 && packedCount === packing.length;
  let daysChip = '';
  if (trip.start_date && trip.end_date) {
    const startDiff = Math.ceil((new Date(trip.start_date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    const endDiff   = Math.ceil((new Date(trip.end_date   + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    if (startDiff === 0) {
      daysChip = `<span class="trip-stat-chip accent">今天出發 🎉</span>`;
    } else if (startDiff > 0 && startDiff <= 90) {
      daysChip = `<span class="trip-stat-chip">還有 ${startDiff} 天</span>`;
    } else if (startDiff < 0 && endDiff >= 0) {
      const dayNum = -startDiff + 1;
      const totalTripDays = Math.ceil((new Date(trip.end_date + 'T00:00:00') - new Date(trip.start_date + 'T00:00:00')) / 86400000) + 1;
      daysChip = `<span class="trip-stat-chip accent">旅途中 · 第 ${dayNum} / ${totalTripDays} 天</span>`;
    }
  }
  const startDiff = trip.start_date ? Math.ceil((new Date(trip.start_date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) : null;
  const endDiff   = trip.end_date   ? Math.ceil((new Date(trip.end_date   + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) : null;
  const isOngoing = startDiff !== null && endDiff !== null && startDiff < 0 && endDiff >= 0;
  let todaySummaryHtml = '';
  if (isOngoing) {
    const todayItems = (trip.segments || []).flatMap(seg =>
      (seg.daily || []).filter(d => d.date === today).map(d => ({ ...d, _segName: seg.name, _segColor: seg.color || '#64748b' }))
    );
    if (todayItems.length) {
      const dayNum = -startDiff + 1;
      todaySummaryHtml = `<div class="today-summary">
        <div class="today-summary-hdr">
          <span class="today-summary-title">今日行程</span>
          <span class="today-summary-day">第 ${dayNum} 天</span>
        </div>
        ${todayItems.map(d => {
          const wk = d.lat != null && d.lng != null ? `${d.lat}_${d.lng}` : null;
          const w  = wk && weatherCache[wk]?.[today];
          const wHtml = w ? `<span class="today-weather">${w.icon} ${w.max}°/${w.min}°${w.precip != null ? ` 💧${w.precip}%` : ''}</span>` : '';
          return `
          <div class="today-summary-item">
            <span class="day-icon day-icon-${esc(d.type || 'sightseeing')}">${TYPE_ICONS[d.type] || TYPE_ICONS.sightseeing}</span>
            <div class="today-summary-body">
              <div class="today-summary-item-title">${esc(d.title || '')}${wHtml}</div>
              ${d.note ? `<div class="today-summary-item-note">${esc(d.note)}</div>` : ''}
            </div>
            <span class="today-summary-seg" style="color:${esc(d._segColor)}">${esc(d._segName)}</span>
          </div>`;
        }).join('')}
      </div>`;
    }
  }

  const statsHtml = `<div class="trip-stats">
    ${totalDays ? `<span class="trip-stat-chip">${totalDays} 天行程</span>` : ''}
    ${totalDests ? `<span class="trip-stat-chip">${totalDests} 個地點</span>` : ''}
    ${packing.length ? `<span class="trip-stat-chip${allPacked ? ' accent' : ''}">打包 ${packedCount}/${packing.length}</span>` : ''}
    ${daysChip}
  </div>`;
  el.innerHTML = `
    <div style="padding:8px var(--pp);display:flex;gap:6px;border-bottom:1px solid var(--c-border)">
      <button class="btn btn-primary btn-sm" id="add-trip-btn" data-edit style="flex:1">＋ 新增行程</button>
      <button class="btn btn-secondary btn-sm" id="add-seg-btn" data-edit style="flex:1">＋ 新增分段</button>
    </div>
    <div class="trip-header">
      <div class="trip-header-row">
        <span class="trip-title">${esc(trip.title)}</span>
        <span class="badge ${badgeClass}">${STATUS_LABELS[trip.status] || ''}</span>
        <button class="btn btn-icon btn-sm" id="trip-edit-btn" data-edit title="編輯行程" style="margin-left:auto">${ICON_EDIT}</button>
      </div>
      <div class="trip-dates">${esc(formatDateShort(trip.start_date))} – ${esc(formatDateShort(trip.end_date))}</div>
      ${statsHtml}
      ${trip.notes ? `<div class="trip-notes">${esc(trip.notes)}</div>` : ''}
    </div>
    ${todaySummaryHtml}
    <div id="segments-container">${(trip.segments || []).map(seg => renderSegment(seg, today, weatherCache)).join('')}</div>
    ${renderTodoPacking(trip)}
  `;

  el.querySelectorAll('.seg-header').forEach(hdr => {
    hdr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const body  = hdr.nextElementSibling;
      const arrow = hdr.querySelector('.seg-arrow');
      const segId = hdr.closest('.seg-block')?.dataset.segId;
      if (!body) return;
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      if (arrow) arrow.textContent = hidden ? '▼' : '▶';
      if (segId) { if (hidden) collapsedSegs.delete(segId); else collapsedSegs.add(segId); }
    });
  });

  el.querySelectorAll('[data-day]').forEach(card => {
    card.addEventListener('click', () => {
      el.querySelectorAll('[data-day]').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      const { day, lat, lng } = card.dataset;
      window.dispatchEvent(new CustomEvent('kai-travel:day-click', {
        detail: { date: day, lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null },
      }));
    });
  });

  el.querySelectorAll('.day-expand-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const card   = btn.closest('.day-card');
      const detail = card?.querySelector('.day-detail');
      if (!detail) return;
      const isExpanded = detail.style.display !== 'none';
      detail.style.display = isExpanded ? 'none' : 'block';
      btn.classList.toggle('expanded', !isExpanded);
      const key = `${card.dataset.segId}:${card.dataset.dayIndex}`;
      if (isExpanded) expandedDays.delete(key); else expandedDays.add(key);
    });
  });

  el.querySelectorAll('.day-detail').forEach(det => {
    det.addEventListener('click', e => e.stopPropagation());
  });

  setTimeout(() => {
    const todayCard = el.querySelector('.day-card.is-today');
    if (todayCard) todayCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 150);
}

function renderSegment(seg, today = '', weatherCache = {}) {
  const color = esc(seg.color || '#64748b');
  const days  = seg.daily || [];
  const isCollapsed = collapsedSegs.has(seg.id);

  const bodyHtml = days.map((day, i) => renderDayCard(day, i, seg.id, today, weatherCache)).join('');

  return `
    <div class="seg-block" data-seg-id="${esc(seg.id)}">
      <div class="seg-header" style="border-left:3px solid ${color}">
        <span class="seg-arrow">${isCollapsed ? '▶' : '▼'}</span>
        <div class="seg-info">
          <div class="seg-name">${esc(seg.name)}</div>
          <div class="seg-dates-sm">${esc(formatDateShort(seg.start_date))} – ${esc(formatDateShort(seg.end_date))} · ${days.length} 天</div>
        </div>
        <div class="seg-dot" style="background:${color}"></div>
        <button class="btn btn-icon btn-sm seg-edit-btn" data-seg-id="${esc(seg.id)}" data-edit title="編輯分段">${ICON_EDIT}</button>
      </div>
      <div class="seg-body"${isCollapsed ? ' style="display:none"' : ''}>
        ${bodyHtml}
        <div style="padding:4px var(--pp) 8px">
          <button class="btn btn-link btn-sm add-day-btn" data-seg-id="${esc(seg.id)}" data-edit>＋ 新增日程</button>
        </div>
      </div>
    </div>
  `;
}

function renderDayCard(day, dayIndex, segId, today = '', weatherCache = {}) {
  const isTransport = day.type === 'transport';
  const isToday = today && day.date === today;
  const hasLoc = day.lat != null && day.lng != null;
  const t = day.transport;
  const icon = TYPE_ICONS[day.type] || TYPE_ICONS.sightseeing;
  const transportHtml = t
    ? `<div class="day-transport">${TRANSPORT_ICONS[t.mode] || ''}${esc(t.from || '')} → ${esc(t.to || '')}${t.duration_hours ? ` · ${t.duration_hours}h` : ''}</div>`
    : '';

  const rawMapsUrl = hasLoc ? `https://www.google.com/maps/search/?api=1&query=${day.lat},${day.lng}` : null;
  const mapsHref   = rawMapsUrl ? esc(safeUrl(rawMapsUrl)) : null;
  const mapsLink   = mapsHref && mapsHref !== '#'
    ? `<a class="day-maps-btn" href="${mapsHref}" target="_blank" rel="noopener noreferrer">📍 Google 地圖</a>`
    : '';

  const wKey = hasLoc ? `${day.lat}_${day.lng}` : null;
  const w    = wKey ? weatherCache[wKey]?.[day.date] : null;
  const weatherHtml = w
    ? `<div class="day-weather">${w.icon} ${w.max}°/${w.min}°${w.precip != null ? ` 💧${w.precip}%` : ''}</div>`
    : '';

  const expandKey  = `${segId}:${dayIndex}`;
  const detailOpen = expandedDays.has(expandKey);
  const detailHtml = mapsLink ? `
    <div class="day-detail"${detailOpen ? '' : ' style="display:none"'}>
      ${mapsLink}
    </div>` : '';

  return `
    <div data-day="${esc(day.date)}" data-lat="${day.lat ?? ''}" data-lng="${day.lng ?? ''}"
         data-day-index="${dayIndex}" data-seg-id="${esc(segId)}"
         class="day-card${isTransport ? ' is-transport' : ''}${isToday ? ' is-today' : ''}">
      <div class="day-icon day-icon-${esc(day.type || 'sightseeing')}">${icon}</div>
      <div class="day-body">
        <div class="day-date">${esc(formatDate(day.date))}${isToday ? '<span class="today-badge">今</span>' : ''}</div>
        <div class="day-title">${esc(day.title || '')}</div>
        ${weatherHtml}
        ${transportHtml}
        ${day.note ? `<div class="day-note">${esc(day.note)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
        ${hasLoc ? '<div class="day-loc-dot" title="已標記座標"></div>' : ''}
        ${mapsLink ? `<button class="btn btn-icon btn-sm day-expand-btn${detailOpen ? ' expanded' : ''}" title="展開詳情" aria-label="展開詳情">${ICON_CHEVRON}</button>` : ''}
        <button class="btn btn-icon btn-sm day-edit-btn" data-day-index="${dayIndex}" data-seg-id="${esc(segId)}" data-edit title="編輯日程" style="opacity:.5">${ICON_EDIT}</button>
      </div>
      ${detailHtml}
    </div>
  `;
}

/* ── Todo / Packing ── */
function renderTodoPacking(trip) {
  const todo    = trip.todo    || [];
  const packing = trip.packing || [];

  const doneTodo    = todo.filter(i => i.done).length;
  const donePacking = packing.filter(i => i.done).length;

  const todoItems = todo.map(item => `
    <div class="checklist-item${item.done ? ' done' : ''}" data-todo-id="${esc(item.id)}">
      <div class="checklist-cb">${item.done ? ICON_CHECK : ''}</div>
      <span class="checklist-text">${esc(item.text)}</span>
      <button class="checklist-del-btn" data-todo-del="${esc(item.id)}" data-edit title="刪除">×</button>
    </div>`).join('');

  const catMap = {};
  packing.forEach(p => { (catMap[p.category || '其他'] ??= []).push(p); });
  const packingItems = Object.entries(catMap).map(([cat, items]) => `
    <div class="packing-cat-label">${esc(cat)}</div>
    ${items.map(item => `
    <div class="checklist-item${item.done ? ' done' : ''}" data-packing-id="${esc(item.id)}">
      <div class="checklist-cb">${item.done ? ICON_CHECK : ''}</div>
      <span class="checklist-text">${esc(item.text)}</span>
      <button class="checklist-del-btn" data-packing-del="${esc(item.id)}" data-edit title="刪除">×</button>
    </div>`).join('')}`).join('');

  return `
    <div class="checklist-section">
      <div class="checklist-header" data-toggle="todo-body">
        <span class="seg-arrow">▼</span>
        <span class="checklist-header-title">待辦清單</span>
        <span class="checklist-count">${doneTodo}/${todo.length}</span>
      </div>
      <div id="todo-body">
        ${todoItems}
        <div class="checklist-add-row" data-edit>
          <input class="checklist-add-input" id="todo-add-input" placeholder="新增待辦事項" maxlength="100">
          <button class="btn btn-link btn-sm" id="todo-add-btn" data-edit>新增</button>
        </div>
      </div>
    </div>
    <div class="checklist-section">
      <div class="checklist-header" data-toggle="packing-body">
        <span class="seg-arrow">▼</span>
        <span class="checklist-header-title">打包清單</span>
        <span class="checklist-count">${donePacking}/${packing.length}</span>
      </div>
      <div id="packing-body">
        ${packingItems}
        <div class="checklist-add-row" data-edit>
          <input class="checklist-add-input" id="packing-add-input" placeholder="物品名稱" maxlength="100" style="flex:2">
          <input class="checklist-add-input" id="packing-cat-input" placeholder="分類" maxlength="40" style="flex:1">
          <button class="btn btn-link btn-sm" id="packing-add-btn" data-edit>新增</button>
        </div>
      </div>
    </div>
  `;
}

/* ── Budget ── */
function toBase(amount, currency, base, rates) {
  if (!currency || currency === base || !rates) return amount;
  const r = rates[currency];
  return r ? amount / r : amount;
}

export function renderBudget(trip, rates = null) {
  const el = document.getElementById('budget-content');
  if (!el) return;
  if (!trip) { el.innerHTML = '<div class="empty-state">請先選擇行程</div>'; return; }

  const expenses  = [...(trip.expenses || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const base      = trip.base_currency || 'TWD';
  const hasMixed  = expenses.some(e => e.currency && e.currency !== base);
  const total     = expenses.reduce((s, e) => s + toBase(e.amount || 0, e.currency || base, base, rates), 0);
  const budget    = trip.budget_total || 0;
  const pct       = budget ? Math.min(100, Math.round(total / budget * 100)) : 0;
  const over      = budget && total > budget;
  const byCategory = {};
  expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + toBase(e.amount || 0, e.currency || base, base, rates); });

  el.innerHTML = `
    <div style="padding:var(--pp);display:flex;flex-direction:column;gap:16px">
      <div class="budget-summary">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div class="section-lbl">預算使用</div>
          <a href="${esc(safeUrl(`https://www.xe.com/currencytables/?from=${base}`))}" target="_blank" rel="noopener noreferrer" class="budget-rate-link">查看匯率 ↗</a>
        </div>
        <div class="budget-amount-row">
          <span class="budget-amount">${esc(formatCurrency(total, base))}</span>
          ${budget ? `<span class="budget-total-lbl">/ ${esc(formatCurrency(budget, base))}</span>` : ''}
        </div>
        ${hasMixed && rates ? `<div class="budget-converted-note">匯率換算合計</div>` : ''}
        ${budget ? `
          <div class="budget-bar-track">
            <div class="budget-bar-fill${over ? ' over' : ''}" style="width:${pct}%"></div>
          </div>
          <div class="budget-pct">${pct}% 已使用</div>` : ''}
      </div>
      ${Object.keys(byCategory).length ? '<div class="chart-wrap"><canvas id="budget-chart"></canvas></div>' : ''}
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="section-lbl" style="margin:0">明細</div>
          <button id="add-expense-btn" class="btn btn-link" data-edit>+ 新增</button>
        </div>
        <div id="expense-form-wrap"></div>
        ${expenses.length === 0
          ? '<div style="text-align:center;color:var(--c-muted-lt);font-size:13px;padding:16px 0">尚無花費記錄</div>'
          : `<div id="expense-list">${renderExpensesByDate(expenses, base, rates)}</div>`
        }
      </div>
    </div>
  `;

  if (Object.keys(byCategory).length && window.Chart) {
    setTimeout(() => {
      const ctx = document.getElementById('budget-chart');
      if (!ctx) return;
      if (ctx._ci) ctx._ci.destroy();
      ctx._ci = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: Object.keys(byCategory),
          datasets: [{ data: Object.values(byCategory), backgroundColor: ['#f59e0b','#3b82f6','#22c55e','#a855f7','#ef4444','#0ea5e9','#f97316','#64748b'] }],
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11, family: 'Noto Sans TC' } } } } },
      });
    }, 50);
  }
}

const ICON_EDIT_SM = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;

function renderExpenseRow(e, fallbackCurrency) {
  return `
    <div class="expense-row" data-expense-id="${esc(e.id)}">
      <span class="expense-cat-chip">${esc(e.category || '其他')}</span>
      <span class="expense-note">${esc(e.note || '')}</span>
      <span class="expense-amount">${esc(formatCurrency(e.amount, e.currency || fallbackCurrency))}</span>
      <button class="expense-edit-btn" data-expense-id="${esc(e.id)}" data-edit title="編輯">${ICON_EDIT_SM}</button>
      <button class="expense-del-btn" data-expense-id="${esc(e.id)}" data-edit title="刪除">×</button>
    </div>`;
}

function renderExpensesByDate(expenses, base, rates = null) {
  const dateMap = new Map();
  expenses.forEach(e => {
    const d = e.date || '';
    if (!dateMap.has(d)) dateMap.set(d, []);
    dateMap.get(d).push(e);
  });

  return [...dateMap.entries()].map(([date, items]) => {
    const subtotal = items.reduce((s, e) => s + toBase(e.amount || 0, e.currency || base, base, rates), 0);
    const label = date ? esc(formatDate(date)) : '未指定日期';
    return `
      <div class="expense-date-card">
        <div class="expense-date-hdr">
          <span class="expense-date-hdr-label">${label}</span>
          <span class="expense-date-hdr-subtotal">${esc(formatCurrency(subtotal, base))}</span>
        </div>
        ${items.map(e => renderExpenseRow(e, base)).join('')}
      </div>`;
  }).join('');
}

export function renderExpenseForm(trip, exp = null) {
  const wrap = document.getElementById('expense-form-wrap');
  if (!wrap) return;
  const currency = exp?.currency || trip?.base_currency || 'TWD';
  const segments = trip?.segments || [];
  wrap.innerHTML = `
    <div class="expense-form" id="add-expense-form">
      <div class="expense-form-row">
        <input type="date" id="ef-date" value="${exp ? esc(exp.date || '') : new Date().toISOString().slice(0,10)}" placeholder="日期">
        <select id="ef-category">
          ${['景點','餐飲','交通','住宿','購物','其他'].map(c => `<option${exp?.category === c ? ' selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="expense-form-row">
        <input type="number" id="ef-amount" value="${exp ? exp.amount : ''}" placeholder="金額" min="0" autocomplete="off">
        ${currencySelect('ef-currency', currency)}
      </div>
      ${segments.length ? `<select id="ef-segment"><option value="">（不指定分段）</option>${segments.map(s => `<option value="${esc(s.id)}"${exp?.segment_id === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
      <input type="text" id="ef-note" value="${exp ? esc(exp.note || '') : ''}" placeholder="備註（選填）" autocomplete="off">
      <div class="expense-form-row">
        <button id="ef-save" class="btn btn-primary" style="flex:1">${exp ? '更新' : '儲存'}</button>
        <button id="ef-cancel" class="btn btn-ghost" style="flex:1">取消</button>
      </div>
    </div>
  `;
}

/* ── Prefs ── */
export function renderPrefs(prefs) {
  const el = document.getElementById('prefs-content');
  if (!el) return;
  if (!prefs || !Object.keys(prefs).length) {
    el.innerHTML = `
      <div style="padding:var(--pp)">
        <div class="empty-state">尚無偏好設定</div>
        <button id="prefs-edit-btn" class="btn btn-primary" style="width:100%;margin-top:12px">開始設定</button>
      </div>`;
    return;
  }
  const bl  = prefs.bucket_list || [];
  const PREF_LABELS = {
    adaptable: '彈性自由', budget: '節省', comfort: '舒適', luxury: '豪華', adventure: '冒險戶外',
    moderate: '適中', varies_by_destination: '依目的地', high: '高端',
    slow: '慢步調', fast: '緊湊',
    solo: '獨旅', couple: '雙人', family: '家庭', group: '團體',
  };
  const localize = v => PREF_LABELS[v] || v;
  const row = (label, val) => val
    ? `<div class="pref-row"><span class="pref-label">${esc(label)}</span><span class="pref-value">${esc(Array.isArray(val) ? val.map(localize).join('、') : localize(String(val)))}</span></div>`
    : '';

  el.innerHTML = `
    <div style="padding:var(--pp);display:flex;flex-direction:column;gap:16px">
      <div class="surface-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span class="section-lbl" style="margin:0">基本資料</span>
          <button id="prefs-edit-btn" class="btn btn-ghost" style="font-size:11px;padding:3px 10px;min-height:unset">編輯</button>
        </div>
        ${row('旅行風格', prefs.travel_style)}
        ${row('預算層級', prefs.budget_level)}
        ${row('旅行節奏', prefs.pace_preference)}
        ${row('同伴',     prefs.travel_companions)}
        ${row('語言',     prefs.language_skills)}
        ${row('興趣',     prefs.interests)}
      </div>
      <div>
        <div class="section-lbl">Bucket List (${bl.length})</div>
        ${bl.length ? bl.map(b => `
          <div class="bucket-item">
            <span class="bucket-icon">${ICON_GLOBE}</span>
            <span class="bucket-name">${esc(b.destination)}</span>
            ${b.notes ? `<span class="bucket-note">${esc(b.notes)}</span>` : ''}
          </div>`).join('') : '<div style="font-size:12px;color:var(--c-muted-lt);padding:6px 0">尚無 Bucket List</div>'}
      </div>
    </div>
  `;
}

export function renderPrefsEdit(prefs) {
  const el = document.getElementById('prefs-content');
  if (!el) return;
  const p = prefs || {};
  const STYLE_OPTS     = ['adaptable','budget','comfort','luxury','adventure'];
  const BUDGET_OPTS    = ['budget','moderate','varies_by_destination','high'];
  const PACE_OPTS      = ['slow','moderate','fast'];
  const COMPANION_OPTS = ['solo','couple','family','group'];
  const OPT_LABELS = {
    adaptable: '彈性自由', budget: '節省', comfort: '舒適', luxury: '豪華', adventure: '冒險戶外',
    moderate: '適中', varies_by_destination: '依目的地', high: '高端',
    slow: '慢步調', fast: '緊湊',
    solo: '獨旅', couple: '雙人', family: '家庭', group: '團體',
  };
  const lbl = o => OPT_LABELS[o] || o;

  const sel = (id, opts, val) =>
    `<div class="cs" id="${id}" data-val="${esc(val || opts[0])}">
      <button type="button" class="cs-btn"><span class="cs-label">${esc(lbl(val || opts[0]))}</span><span class="cs-arr">▾</span></button>
      <div class="cs-opts">${opts.map(o =>
        `<div class="cs-opt${o === val ? ' cs-on' : ''}" data-val="${o}">${esc(lbl(o))}</div>`
      ).join('')}</div>
    </div>`;

  const erow = (label, content) =>
    `<div class="pref-edit-row"><span class="pref-label">${label}</span>${content}</div>`;

  el.innerHTML = `
    <div style="padding:var(--pp);display:flex;flex-direction:column;gap:16px">
      <div class="surface-card">
        <div class="section-lbl">基本資料</div>
        ${erow('旅行風格', sel('pe-style',     STYLE_OPTS,     p.travel_style))}
        ${erow('預算層級', sel('pe-budget',    BUDGET_OPTS,    p.budget_level))}
        ${erow('旅行節奏', sel('pe-pace',      PACE_OPTS,      p.pace_preference))}
        ${erow('同伴',     sel('pe-companion', COMPANION_OPTS, p.travel_companions))}
        ${erow('語言',     '<div class="tag-wrap" id="pe-lang-wrap"></div>')}
        ${erow('興趣',     '<div class="tag-wrap" id="pe-int-wrap"></div>')}
      </div>
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span class="section-lbl" style="margin:0">Bucket List</span>
          <button id="pe-bl-add" class="btn btn-ghost" style="font-size:11px;padding:3px 10px;min-height:unset">＋ 新增</button>
        </div>
        <div id="pe-bl-list"></div>
        <div id="pe-bl-form" style="display:none"></div>
      </div>
      <div style="display:flex;gap:8px">
        <button id="pe-cancel" class="btn btn-ghost" style="flex:1">取消</button>
        <button id="pe-save"   class="btn btn-primary" style="flex:1">儲存</button>
      </div>
    </div>
  `;
}

/* ── Data Panel ── */
export function renderDataPanel(trips = null) {
  const el = document.getElementById('data-content');
  if (!el) return;
  const ideas = trips?.trip_ideas || [];
  el.innerHTML = `
    <div style="padding:var(--pp);display:flex;flex-direction:column;gap:20px">
      <div>
        <div class="section-lbl">旅遊構想</div>
        ${ideas.map(i => `
          <div class="idea-item" data-idea-id="${esc(i.id)}">
            <div class="idea-item-body">
              <div class="idea-item-title">${esc(i.title)}</div>
              ${i.notes ? `<div class="idea-item-notes">${esc(i.notes)}</div>` : ''}
            </div>
            <button class="idea-del-btn" data-idea-del="${esc(i.id)}" data-edit title="刪除">×</button>
          </div>`).join('')}
        ${ideas.length === 0 ? '<div style="font-size:12px;color:var(--c-muted-lt);padding:4px 0 8px">尚無構想，輸入目的地後按新增</div>' : ''}
        <div class="checklist-add-row" data-edit style="margin-top:4px;flex-wrap:wrap;gap:4px">
          <input type="text" id="idea-add-input" class="checklist-add-input" placeholder="目的地或構想" style="flex:2;min-width:120px">
          <input type="text" id="idea-notes-input" class="checklist-add-input" placeholder="備註（選填）" style="flex:3;min-width:160px">
          <button class="btn btn-link btn-sm" id="idea-add-btn" data-edit>新增</button>
        </div>
      </div>
      <div>
        <div class="section-lbl">匯入資料</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;color:var(--c-muted)">trips.json</span>
              <button id="download-template-btn" class="btn btn-link" style="font-size:11px;padding:0;min-height:unset">下載範本</button>
            </div>
            <input type="file" id="import-trips-file" accept=".json" data-edit style="font-size:11px;color:var(--c-muted)">
          </label>
          <label>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;color:var(--c-muted)">trips.xlsx <span style="color:var(--c-muted-lt)">（給他人填寫）</span></span>
              <button id="download-excel-template-btn" class="btn btn-link" style="font-size:11px;padding:0;min-height:unset">下載範本</button>
            </div>
            <input type="file" id="import-trips-excel-file" accept=".xlsx" data-edit style="font-size:11px;color:var(--c-muted)">
          </label>
          <label>
            <div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">preferences.json</div>
            <input type="file" id="import-prefs-file" accept=".json" data-edit style="font-size:11px;color:var(--c-muted)">
          </label>
        </div>
      </div>
      <div>
        <div class="section-lbl">匯出資料</div>
        <div style="display:flex;gap:8px">
          <button id="export-json-btn" class="btn btn-ghost" style="flex:1">下載 JSON</button>
          <button id="export-excel-btn" class="btn btn-success" style="flex:1">匯出 Excel</button>
        </div>
      </div>
      <div>
        <div class="section-lbl">分享（唯讀）</div>
        <button id="share-btn" class="btn btn-primary" style="width:100%" data-edit>建立唯讀分享連結（TTL 30天）</button>
        <div id="share-tokens-list" style="margin-top:8px"></div>
      </div>
    </div>
  `;
}

/* ── Trip Modal ── */
export function renderTripModal(trip) {
  const isEdit = !!trip;
  const t = trip || { title: '', start_date: '', end_date: '', status: 'planning', budget_total: '', base_currency: 'TWD' };
  document.getElementById('trip-modal-title').textContent = isEdit ? '編輯行程' : '新增行程';
  document.getElementById('trip-modal-body').innerHTML = `
    <div class="form-row">
      <label class="form-label">行程名稱 <span style="color:#dc2626">*</span></label>
      <input class="form-input" id="tm-title" maxlength="80" value="${esc(t.title)}" placeholder="例：東京春旅" required>
    </div>
    <div class="form-2col">
      <div class="form-row">
        <label class="form-label">開始日期 <span style="color:#dc2626">*</span></label>
        <input type="date" class="form-input" id="tm-start" value="${esc(t.start_date || '')}" required>
      </div>
      <div class="form-row">
        <label class="form-label">結束日期 <span style="color:#dc2626">*</span></label>
        <input type="date" class="form-input" id="tm-end" value="${esc(t.end_date || '')}" required>
      </div>
    </div>
    <div class="form-row">
      <label class="form-label">狀態</label>
      <select class="form-input" id="tm-status">
        <option value="planning"${t.status === 'planning' ? ' selected' : ''}>規劃中</option>
        <option value="ongoing"${t.status === 'ongoing' ? ' selected' : ''}>進行中</option>
        <option value="completed"${t.status === 'completed' ? ' selected' : ''}>已完成</option>
      </select>
    </div>
    <div class="form-2col">
      <div class="form-row">
        <label class="form-label">總預算</label>
        <input type="number" class="form-input" id="tm-budget" min="0" value="${esc(String(t.budget_total || ''))}">
      </div>
      <div class="form-row">
        <label class="form-label">幣別</label>
        ${currencySelect('tm-currency', t.base_currency || 'TWD')}
      </div>
    </div>
    <div class="form-row">
      <label class="form-label">備註</label>
      <textarea class="form-input" id="tm-notes" rows="2" maxlength="500" placeholder="旅遊備忘、注意事項..." style="resize:vertical">${esc(t.notes || '')}</textarea>
    </div>
  `;
  document.getElementById('trip-modal-footer').innerHTML = `
    ${isEdit ? `<button class="btn btn-danger btn-sm" id="tm-delete" style="margin-right:auto">刪除行程</button>` : ''}
    <button class="btn btn-secondary" id="tm-cancel">取消</button>
    <button class="btn btn-primary" id="tm-save">儲存</button>
  `;
  document.getElementById('trip-modal').classList.add('open');
}

/* ── Segment Modal ── */
export function renderSegModal(seg, tripStart, tripEnd) {
  const isEdit = !!seg;
  const s = seg || { name: '', start_date: '', end_date: '', color: SEG_COLORS[0] };
  const selectedColor = s.color || SEG_COLORS[0];
  const minAttr = tripStart ? `min="${esc(tripStart)}"` : '';
  const maxAttr = tripEnd   ? `max="${esc(tripEnd)}"`   : '';
  document.getElementById('seg-modal-title').textContent = isEdit ? '編輯分段' : '新增分段';
  document.getElementById('seg-modal-body').innerHTML = `
    <div class="form-row">
      <label class="form-label">分段名稱 <span style="color:#dc2626">*</span></label>
      <input class="form-input" id="sm-name" maxlength="60" value="${esc(s.name)}" placeholder="例：東京" required>
    </div>
    <div class="form-2col">
      <div class="form-row">
        <label class="form-label">開始日期 <span style="color:#dc2626">*</span></label>
        <input type="date" class="form-input" id="sm-start" value="${esc(s.start_date || '')}" ${minAttr} ${maxAttr} required>
      </div>
      <div class="form-row">
        <label class="form-label">結束日期 <span style="color:#dc2626">*</span></label>
        <input type="date" class="form-input" id="sm-end" value="${esc(s.end_date || '')}" ${minAttr} ${maxAttr} required>
      </div>
    </div>
    <div class="form-row">
      <label class="form-label">顏色</label>
      <div class="color-swatch-row" id="sm-colors">
        ${SEG_COLORS.map(c => `<div class="color-swatch${c === selectedColor ? ' selected' : ''}" data-color="${esc(c)}" style="background:${esc(c)}"></div>`).join('')}
      </div>
    </div>
  `;
  document.getElementById('seg-modal-footer').innerHTML = `
    ${isEdit ? `<button class="btn btn-danger btn-sm" id="sm-delete" style="margin-right:auto">刪除分段</button>` : ''}
    <button class="btn btn-secondary" id="sm-cancel">取消</button>
    <button class="btn btn-primary" id="sm-save">儲存</button>
  `;
  document.getElementById('seg-modal').classList.add('open');
}

/* ── Day Modal ── */
export function renderDayModal(day, segStart, segEnd) {
  const isEdit = !!day;
  const d = day || { date: '', type: 'sightseeing', title: '', note: '', lat: null, lng: null };
  const t = d.transport || {};
  const types = ['sightseeing','transport','trekking','diving','rest'];
  const typeLabels = { sightseeing:'觀光', transport:'交通', trekking:'健行', diving:'潛水', rest:'休息' };
  const transportModes = ['flight','overnight_train','bus','ferry','car','other'];
  const modeLabels = { flight:'飛機', overnight_train:'夜臥火車', bus:'巴士', ferry:'渡輪', car:'自駕', other:'其他' };
  const minAttr = segStart ? `min="${esc(segStart)}"` : '';
  const maxAttr = segEnd   ? `max="${esc(segEnd)}"`   : '';

  document.getElementById('day-modal-title').textContent = isEdit ? '編輯日程' : '新增日程';
  document.getElementById('day-modal-body').innerHTML = `
    <div class="form-row">
      <label class="form-label">日期 <span style="color:#dc2626">*</span></label>
      <input type="date" class="form-input" id="dm-date" value="${esc(d.date || '')}" ${minAttr} ${maxAttr} required>
    </div>
    <div class="form-row">
      <label class="form-label">類型</label>
      <select class="form-input" id="dm-type">
        ${types.map(tp => `<option value="${tp}"${d.type===tp?' selected':''}>${typeLabels[tp]}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <label class="form-label">標題 <span style="color:#dc2626">*</span></label>
      <input class="form-input" id="dm-title" maxlength="100" value="${esc(d.title || '')}" placeholder="例：淺草寺、搭乘 NH203">
    </div>
    <div class="form-row">
      <label class="form-label">備註</label>
      <input class="form-input" id="dm-note" maxlength="200" value="${esc(d.note || '')}" placeholder="選填">
    </div>
    <div class="form-row" style="position:relative">
      <label class="form-label">搜尋地點 <span style="color:var(--c-muted-lt);font-weight:400">（自動帶入座標）</span></label>
      <input class="form-input" id="dm-place-search" placeholder="例：淺草寺、東京鐵塔、Colosseum..." maxlength="100" autocomplete="off">
      <ul id="dm-place-results" class="place-dropdown" style="display:none"></ul>
    </div>
    <div class="form-2col">
      <div class="form-row">
        <label class="form-label">緯度</label>
        <input type="number" class="form-input" id="dm-lat" step="any" value="${d.lat ?? ''}" placeholder="35.6812">
      </div>
      <div class="form-row">
        <label class="form-label">經度</label>
        <input type="number" class="form-input" id="dm-lng" step="any" value="${d.lng ?? ''}" placeholder="139.7671">
      </div>
    </div>
    <div id="dm-transport-wrap" style="display:${d.type==='transport'?'block':'none'};margin-top:4px;padding-top:8px;border-top:1px solid var(--c-border)">
      <div class="form-2col">
        <div class="form-row">
          <label class="form-label">交通方式</label>
          <select class="form-input" id="dm-t-mode">
            ${transportModes.map(m => `<option value="${m}"${t.mode===m?' selected':''}>${modeLabels[m]}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">時長（小時）</label>
          <input type="number" class="form-input" id="dm-t-duration" min="0" step="0.5" value="${t.duration_hours ?? ''}">
        </div>
      </div>
      <div class="form-2col">
        <div class="form-row">
          <label class="form-label">出發地</label>
          <input class="form-input" id="dm-t-from" maxlength="60" value="${esc(t.from || '')}">
        </div>
        <div class="form-row">
          <label class="form-label">目的地</label>
          <input class="form-input" id="dm-t-to" maxlength="60" value="${esc(t.to || '')}">
        </div>
      </div>
      <div class="form-row">
        <label class="form-label">航班/班次</label>
        <input class="form-input" id="dm-t-carrier" maxlength="60" value="${esc(t.carrier || '')}">
      </div>
    </div>
  `;

  document.getElementById('dm-type').addEventListener('change', e => {
    document.getElementById('dm-transport-wrap').style.display = e.target.value === 'transport' ? 'block' : 'none';
  });

  document.getElementById('day-modal-footer').innerHTML = `
    ${isEdit ? `<button class="btn btn-danger btn-sm" id="dm-delete" style="margin-right:auto">刪除</button>` : ''}
    <button class="btn btn-secondary" id="dm-cancel">取消</button>
    <button class="btn btn-primary" id="dm-save">儲存</button>
  `;
  document.getElementById('day-modal').classList.add('open');
}

/* ── Auth ── */
export function showAuthOverlay() {
  const el = document.getElementById('auth-overlay');
  if (el) el.style.display = 'flex';
  const app = document.getElementById('app');
  if (app) app.classList.remove('ready');
}

export function hideAuthOverlay() {
  const el = document.getElementById('auth-overlay');
  if (el) el.style.display = 'none';
  const app = document.getElementById('app');
  if (app) app.classList.add('ready');
}

export function showOtpStep(email) {
  const emailForm  = document.getElementById('auth-email-form');
  const otpForm    = document.getElementById('auth-otp-form');
  const emailDisp  = document.getElementById('auth-email-display');
  if (emailForm) emailForm.style.display = 'none';
  if (otpForm)   otpForm.style.display = 'block';
  if (emailDisp) emailDisp.textContent = email;
}

export function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

export function clearAuthError() {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

/* ── Timeline helpers ── */
export function scrollTimelineToDate(date) {
  const card = document.querySelector(`[data-day="${date}"]`);
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
