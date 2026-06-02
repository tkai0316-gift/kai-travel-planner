import {
  esc, TYPE_ICONS, TRANSPORT_ICONS, ICON_CHECK, ICON_GLOBE,
  formatDate, formatDateShort, formatCurrency,
} from './utils.js';

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
  const all = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  if (all.length === 0) { if (label) label.textContent = '（尚無行程）'; list.innerHTML = ''; return; }
  const active = all.find(t => t.id === activeTripId) || all[0];
  if (label) label.textContent = active ? active.title : '';
  list.innerHTML = all.map(t =>
    `<li data-trip-id="${esc(t.id)}" class="${t.id === activeTripId ? 'active' : ''}">${esc(t.title)}</li>`
  ).join('');
}

/* ── Timeline ── */
export function renderTimeline(trip) {
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
    </div>
    <div id="segments-container">${(trip.segments || []).map(seg => renderSegment(seg)).join('')}</div>
    ${renderTodoPacking(trip)}
  `;

  el.querySelectorAll('.seg-header').forEach(hdr => {
    hdr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const body  = hdr.nextElementSibling;
      const arrow = hdr.querySelector('.seg-arrow');
      if (!body) return;
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      if (arrow) arrow.textContent = hidden ? '▼' : '▶';
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
}

function renderSegment(seg) {
  const color = esc(seg.color || '#64748b');
  const days  = seg.daily || [];
  return `
    <div class="seg-block">
      <div class="seg-header" style="border-left:3px solid ${color}">
        <span class="seg-arrow">▼</span>
        <div class="seg-info">
          <div class="seg-name">${esc(seg.name)}</div>
          <div class="seg-dates-sm">${esc(formatDateShort(seg.start_date))} – ${esc(formatDateShort(seg.end_date))} · ${days.length} 天</div>
        </div>
        <div class="seg-dot" style="background:${color}"></div>
        <button class="btn btn-icon btn-sm seg-edit-btn" data-seg-id="${esc(seg.id)}" data-edit title="編輯分段">${ICON_EDIT}</button>
      </div>
      <div class="seg-body">
        ${days.map((day, i) => renderDayCard(day, i, seg.id)).join('')}
        <div style="padding:4px var(--pp) 8px">
          <button class="btn btn-link btn-sm add-day-btn" data-seg-id="${esc(seg.id)}" data-edit>＋ 新增日程</button>
        </div>
      </div>
    </div>
  `;
}

function renderDayCard(day, dayIndex, segId) {
  const isTransport = day.type === 'transport';
  const hasLoc = day.lat != null && day.lng != null;
  const t = day.transport;
  const icon = TYPE_ICONS[day.type] || TYPE_ICONS.sightseeing;
  const transportHtml = t
    ? `<div class="day-transport">${TRANSPORT_ICONS[t.mode] || ''}${esc(t.from || '')} → ${esc(t.to || '')}${t.duration_hours ? ` · ${t.duration_hours}h` : ''}</div>`
    : '';
  return `
    <div data-day="${esc(day.date)}" data-lat="${day.lat ?? ''}" data-lng="${day.lng ?? ''}"
         data-day-index="${dayIndex}" data-seg-id="${esc(segId)}"
         class="day-card${isTransport ? ' is-transport' : ''}">
      <div class="day-icon day-icon-${esc(day.type || 'sightseeing')}">${icon}</div>
      <div class="day-body">
        <div class="day-date">${esc(formatDate(day.date))}</div>
        <div class="day-title">${esc(day.title || '')}</div>
        ${transportHtml}
        ${day.note ? `<div class="day-note">${esc(day.note)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
        ${hasLoc ? '<div class="day-loc-dot" title="已標記座標"></div>' : ''}
        <button class="btn btn-icon btn-sm day-edit-btn" data-day-index="${dayIndex}" data-seg-id="${esc(segId)}" data-edit title="編輯日程" style="opacity:.5">${ICON_EDIT}</button>
      </div>
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
export function renderBudget(trip) {
  const el = document.getElementById('budget-content');
  if (!el) return;
  if (!trip) { el.innerHTML = '<div class="empty-state">請先選擇行程</div>'; return; }

  const expenses = trip.expenses || [];
  const total    = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const budget   = trip.budget_total || 0;
  const currency = trip.base_currency || 'TWD';
  const pct      = budget ? Math.min(100, Math.round(total / budget * 100)) : 0;
  const over     = budget && total > budget;
  const byCategory = {};
  expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + (e.amount || 0); });

  el.innerHTML = `
    <div style="padding:var(--pp);display:flex;flex-direction:column;gap:16px">
      <div class="budget-summary">
        <div class="section-lbl">預算使用</div>
        <div class="budget-amount-row">
          <span class="budget-amount">${esc(formatCurrency(total, currency))}</span>
          ${budget ? `<span class="budget-total-lbl">/ ${esc(formatCurrency(budget, currency))}</span>` : ''}
        </div>
        ${budget ? `
          <div class="budget-bar-track">
            <div class="budget-bar-fill${over ? ' over' : ''}" style="width:${pct}%"></div>
          </div>
          <div class="budget-pct">${pct}% 已使用</div>` : ''}
      </div>
      ${Object.keys(byCategory).length ? '<div><canvas id="budget-chart" height="200"></canvas></div>' : ''}
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="section-lbl" style="margin:0">明細</div>
          <button id="add-expense-btn" class="btn btn-link" data-edit>+ 新增</button>
        </div>
        <div id="expense-form-wrap"></div>
        ${expenses.length === 0
          ? '<div style="text-align:center;color:var(--c-muted-lt);font-size:13px;padding:16px 0">尚無花費記錄</div>'
          : `<div id="expense-list">${expenses.map(e => renderExpenseRow(e, currency)).join('')}</div>`
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
        options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11, family: 'Inter' } } } } },
      });
    }, 50);
  }
}

function renderExpenseRow(e, fallbackCurrency) {
  return `
    <div class="expense-row" data-expense-id="${esc(e.id)}">
      <span class="expense-date">${esc(e.date?.slice(5) || '')}</span>
      <span class="expense-note">${esc(e.note || e.category)}</span>
      <span class="expense-amount">${esc(formatCurrency(e.amount, e.currency || fallbackCurrency))}</span>
      <button class="expense-del-btn" data-expense-id="${esc(e.id)}" data-edit title="刪除">×</button>
    </div>`;
}

export function renderExpenseForm(trip) {
  const wrap = document.getElementById('expense-form-wrap');
  if (!wrap) return;
  const currency = trip?.base_currency || 'TWD';
  const segments = trip?.segments || [];
  wrap.innerHTML = `
    <div class="expense-form" id="add-expense-form">
      <div class="expense-form-row">
        <input type="date" id="ef-date" value="${new Date().toISOString().slice(0,10)}" placeholder="日期">
        <select id="ef-category">
          ${['景點','餐飲','交通','住宿','購物','其他'].map(c => `<option>${c}</option>`).join('')}
        </select>
      </div>
      <div class="expense-form-row">
        <input type="number" id="ef-amount" placeholder="金額" min="0">
        <input type="text" id="ef-currency" value="${esc(currency)}" placeholder="幣別" style="width:70px;flex:none">
      </div>
      ${segments.length ? `<select id="ef-segment"><option value="">（不指定分段）</option>${segments.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select>` : ''}
      <input type="text" id="ef-note" placeholder="備註（選填）">
      <div class="expense-form-row">
        <button id="ef-save" class="btn btn-primary" style="flex:1">儲存</button>
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
  const row = (label, val) => val
    ? `<div class="pref-row"><span class="pref-label">${esc(label)}</span><span class="pref-value">${esc(Array.isArray(val) ? val.join(', ') : val)}</span></div>`
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

  const sel = (id, opts, val) =>
    `<select id="${id}" class="pref-select">${opts.map(o =>
      `<option value="${o}"${val===o?' selected':''}>${o}</option>`).join('')}</select>`;

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
export function renderDataPanel() {
  const el = document.getElementById('data-content');
  if (!el) return;
  el.innerHTML = `
    <div style="padding:var(--pp);display:flex;flex-direction:column;gap:20px">
      <div>
        <div class="section-lbl">匯入資料</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label>
            <div class="data-file-label" style="font-size:12px;color:var(--c-muted);margin-bottom:4px">trips.json</div>
            <input type="file" id="import-trips-file" accept=".json" data-edit style="font-size:11px;color:var(--c-muted)">
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
        <div id="share-result" style="display:none;margin-top:8px">
          <div style="font-size:11px;color:var(--c-muted-lt);margin-bottom:4px">分享連結：</div>
          <div id="share-url" class="share-url-box"></div>
          <button id="copy-share-btn" class="btn btn-link" style="margin-top:4px">複製連結</button>
        </div>
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
        <input class="form-input" id="tm-currency" maxlength="5" value="${esc(t.base_currency || 'TWD')}">
      </div>
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
