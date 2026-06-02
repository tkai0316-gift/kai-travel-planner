import { getState, setState, validateTripsJson, saveCache, loadCache } from './store.js';
import * as api from './api.js';
import * as mapMgr from './mapManager.js';
import * as ui from './uiRenderer.js';
import { showToast, generateId, esc, ICON_GLOBE } from './utils.js';

function getActiveTrip() {
  const { trips, activeTripId } = getState();
  const all = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  return all.find(t => t.id === activeTripId) || null;
}

let pendingEmail = '';

async function init() {
  const IS_DEV_BYPASS =
    window.location.hostname !== 'kai-travel-planner.pages.dev' &&
    new URLSearchParams(location.search).get('dev') === '1';

  let user = await api.getUser();
  if (!user && IS_DEV_BYPASS) {
    user = { id: 'dev-bypass', email: 'dev@bypass' };
    showToast('⚡ Dev bypass 模式（快取資料）', 'warn');
  }

  setState({ user, isOnline: navigator.onLine });

  window.addEventListener('online', () => {
    setState({ isOnline: true });
    ui.setOnlineState(true);
    showToast('已恢復連線', 'success');
    loadData();
  });
  window.addEventListener('offline', () => {
    setState({ isOnline: false });
    ui.setOnlineState(false);
    showToast('已離線，切換為唯讀模式', 'warn');
  });

  bindAuthEvents();

  if (user) {
    ui.hideAuthOverlay();
    await loadData();
    initMap();
    bindAppEvents();
  }
}

async function loadData() {
  const { user, isOnline } = getState();
  if (!user) {
    const cached = loadCache();
    if (cached) setState({ trips: cached.trips, preferences: cached.prefs || {} });
    const { trips } = getState();
    const allTrips = [...(trips.current_trips || []), ...(trips.past_trips || [])];
    if (!getState().activeTripId && allTrips.length > 0) setState({ activeTripId: allTrips[0].id });
    ui.renderTripSelector(trips, getState().activeTripId);
    ui.setActiveTab(getState().activeTab);
    ui.setOnlineState(getState().isOnline);
    renderActiveTrip();
    return;
  }

  if (isOnline) {
    try {
      const [tripsRaw, prefsRaw] = await Promise.all([
        api.fetchTrips(user.id),
        api.fetchPreferences(user.id),
      ]);
      const trips = tripsRaw || { current_trips: [], past_trips: [], trip_ideas: [] };
      const preferences = prefsRaw || {};
      setState({ trips, preferences });
      saveCache(trips, preferences);
    } catch {
      showToast('資料載入失敗，使用快取', 'warn');
      const cached = loadCache();
      if (cached) setState({ trips: cached.trips, preferences: cached.prefs || {} });
    }
  } else {
    const cached = loadCache();
    if (cached) setState({ trips: cached.trips, preferences: cached.prefs || {} });
  }

  const { trips } = getState();
  const allTrips = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  if (!getState().activeTripId && allTrips.length > 0) setState({ activeTripId: allTrips[0].id });

  ui.renderTripSelector(trips, getState().activeTripId);
  ui.setActiveTab(getState().activeTab);
  ui.setOnlineState(getState().isOnline);
  renderActiveTrip();
}

function renderActiveTrip() {
  const { trips, activeTripId, preferences } = getState();
  const allTrips = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  const trip = allTrips.find(t => t.id === activeTripId) || null;

  ui.renderTimeline(trip);
  ui.renderBudget(trip);
  ui.renderPrefs(preferences);
  ui.renderDataPanel();
  bindChecklistEvents(trip);
  bindDataPanelEvents();

  if (trip) mapMgr.renderTrip(trip);
  else mapMgr.clearMap();
}

function initMap() {
  mapMgr.init('map');
  mapMgr.onMarkerClick((date) => {
    ui.scrollTimelineToDate(date);
    setState({ highlightedDate: date });
  });
}

function bindAppEvents() {
  ['trips', 'budget', 'prefs', 'data'].forEach(tab => {
    const btn = document.getElementById(`tab-${tab}`);
    if (btn) btn.addEventListener('click', () => { setState({ activeTab: tab }); ui.setActiveTab(tab); });
  });

  const tripSelBtn = document.getElementById('trip-selector-btn');
  const tripSelList = document.getElementById('trip-selector-list');
  if (tripSelBtn && tripSelList) {
    tripSelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = tripSelList.style.display !== 'none';
      tripSelList.style.display = isOpen ? 'none' : 'block';
    });
    tripSelList.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-trip-id]');
      if (!li) return;
      tripSelList.style.display = 'none';
      setState({ activeTripId: li.dataset.tripId });
      renderActiveTrip();
    });
    document.addEventListener('click', () => { tripSelList.style.display = 'none'; });
  }

  window.addEventListener('kai-travel:day-click', (e) => {
    const { lat, lng } = e.detail;
    if (lat != null && lng != null) mapMgr.flyToDay(lat, lng);
  });

  const toggleBtn = document.getElementById('panel-toggle');
  const leftPanel = document.getElementById('left-panel');
  const ICON_MENU = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
  const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  if (toggleBtn && leftPanel) {
    toggleBtn.addEventListener('click', () => {
      const isOpen = leftPanel.classList.toggle('panel-open');
      toggleBtn.innerHTML = isOpen ? ICON_CLOSE : ICON_MENU;
    });
  }

  const signOutBtn = document.getElementById('signout-btn');
  if (signOutBtn) signOutBtn.addEventListener('click', async () => {
    await api.signOut();
    location.reload();
  });

  /* ── Budget event delegation (bound once) ── */
  document.getElementById('budget-content')?.addEventListener('click', e => {
    const trip = getActiveTrip();
    if (!trip) return;
    if (e.target.id === 'add-expense-btn' || e.target.closest('#add-expense-btn')) {
      ui.renderExpenseForm(trip);
      bindExpenseFormEvents(trip);
      return;
    }
    const delBtn = e.target.closest('.expense-del-btn');
    if (delBtn) {
      const expId = delBtn.dataset.expenseId;
      trip.expenses = (trip.expenses || []).filter(ex => ex.id !== expId);
      persistTrip(trip).then(ok => { if (ok) ui.renderBudget(trip); });
    }
  });

  document.getElementById('panel-prefs')?.addEventListener('click', e => {
    if (e.target.id === 'prefs-edit-btn') {
      const { preferences } = getState();
      ui.renderPrefsEdit(preferences);
      bindPrefsEditEvents(preferences);
    }
  });

  document.getElementById('timeline-content')?.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const { activeTripId } = getState();
    const activeTrip = getActiveTrip();

    if (btn.id === 'add-trip-btn') {
      openTripModal(null);
    } else if (btn.id === 'trip-edit-btn') {
      if (activeTrip) openTripModal(activeTrip);
    } else if (btn.id === 'add-seg-btn') {
      openSegModal(null, activeTripId);
    } else if (btn.classList.contains('seg-edit-btn')) {
      const seg = activeTrip?.segments?.find(s => s.id === btn.dataset.segId);
      if (seg) openSegModal(seg, activeTripId);
    } else if (btn.classList.contains('add-day-btn')) {
      openDayModal(null, btn.dataset.segId, activeTripId);
    } else if (btn.classList.contains('day-edit-btn')) {
      const seg = activeTrip?.segments?.find(s => s.id === btn.dataset.segId);
      const day = seg?.daily?.[parseInt(btn.dataset.dayIndex, 10)];
      if (day) openDayModal(day, btn.dataset.segId, activeTripId, parseInt(btn.dataset.dayIndex, 10));
    }
  });
}

/* ── Checklist (Todo / Packing) ── */
/* ── Prefs Edit ── */
function toArr(val) {
  if (Array.isArray(val)) return [...val];
  if (val && typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function makeTagManager(wrapId, arr) {
  function doAdd() {
    const input = document.querySelector(`#${wrapId} .tag-input`);
    if (!input) return;
    const v = input.value.trim();
    if (v && !arr.includes(v)) { arr.push(v); render(); }
    else if (input) input.value = '';
  }
  function render() {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    wrap.innerHTML = arr.map((t, i) =>
      `<span class="tag-chip">${esc(t)}<button type="button" class="tag-rm" data-i="${i}">×</button></span>`
    ).join('') + `<input class="tag-input" placeholder="輸入後按 Enter" maxlength="40">`;
    wrap.querySelectorAll('.tag-rm').forEach(btn =>
      btn.addEventListener('click', () => { arr.splice(+btn.dataset.i, 1); render(); })
    );
    wrap.querySelector('.tag-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); doAdd(); }
    });
  }
  render();
}

function bindPrefsEditEvents(initPrefs) {
  const langs = toArr(initPrefs?.language_skills);
  const ints  = toArr(initPrefs?.interests);
  const bl    = [...(initPrefs?.bucket_list || [])];

  makeTagManager('pe-lang-wrap', langs);
  makeTagManager('pe-int-wrap',  ints);

  function renderBl() {
    const list = document.getElementById('pe-bl-list');
    if (!list) return;
    list.innerHTML = bl.length
      ? bl.map((b, i) => `
          <div class="bucket-item" style="justify-content:space-between">
            <div style="display:flex;align-items:center;gap:8px;min-width:0">
              <span class="bucket-icon">${ICON_GLOBE}</span>
              <span class="bucket-name">${esc(b.destination)}</span>
              ${b.notes ? `<span class="bucket-note">${esc(b.notes)}</span>` : ''}
            </div>
            <button class="tag-rm" data-i="${i}" style="font-size:18px;padding:0 4px;flex-shrink:0">×</button>
          </div>`).join('')
      : '<div style="font-size:12px;color:var(--c-muted-lt);padding:6px 0">尚無 Bucket List</div>';
    list.querySelectorAll('[data-i]').forEach(btn =>
      btn.addEventListener('click', () => { bl.splice(+btn.dataset.i, 1); renderBl(); })
    );
  }
  renderBl();

  document.getElementById('pe-bl-add')?.addEventListener('click', () => {
    const form = document.getElementById('pe-bl-form');
    if (!form || form.dataset.open === '1') return;
    form.dataset.open = '1';
    form.style.cssText = 'display:block;margin-top:4px';
    form.innerHTML = `
      <div class="bucket-item" style="align-items:flex-start;gap:6px">
        <span class="bucket-icon" style="margin-top:6px">${ICON_GLOBE}</span>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <input id="pe-bl-dest"  class="pref-input" placeholder="目的地" maxlength="80">
          <input id="pe-bl-notes" class="pref-input" placeholder="備註（選填）" maxlength="200">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          <button type="button" id="pe-bl-ok" class="btn btn-primary" style="padding:4px 14px;min-height:unset;font-size:11px">確認</button>
          <button type="button" id="pe-bl-cx" class="btn btn-ghost"   style="padding:4px 14px;min-height:unset;font-size:11px">取消</button>
        </div>
      </div>`;
    document.getElementById('pe-bl-cx')?.addEventListener('click', () => {
      form.style.display = 'none'; form.innerHTML = ''; delete form.dataset.open;
    });
    document.getElementById('pe-bl-ok')?.addEventListener('click', () => {
      const dest = document.getElementById('pe-bl-dest')?.value.trim();
      if (!dest) { showToast('請填寫目的地', 'warn'); return; }
      bl.push({ destination: dest, notes: document.getElementById('pe-bl-notes')?.value.trim() || '' });
      form.style.display = 'none'; form.innerHTML = ''; delete form.dataset.open;
      renderBl();
    });
  });

  document.getElementById('pe-cancel')?.addEventListener('click', () => {
    ui.renderPrefs(getState().preferences);
  });

  document.getElementById('pe-save')?.addEventListener('click', async () => {
    const { user, isOnline } = getState();
    if (!isOnline) { showToast('離線中，無法儲存', 'warn'); return; }
    const updated = {
      ...initPrefs,
      travel_style:      document.getElementById('pe-style')?.value,
      budget_level:      document.getElementById('pe-budget')?.value,
      pace_preference:   document.getElementById('pe-pace')?.value,
      travel_companions: document.getElementById('pe-companion')?.value,
      language_skills:   [...langs],
      interests:         [...ints],
      bucket_list:       [...bl],
    };
    if (user) {
      try { await api.savePreferences(user.id, updated); }
      catch { showToast('儲存失敗，請重試', 'error'); return; }
    }
    setState({ preferences: updated });
    saveCache(getState().trips, updated);
    showToast('偏好設定已儲存', 'success');
    ui.renderPrefs(updated);
  });
}

/* ── Checklist ── */
function bindChecklistEvents(trip) {
  if (!trip) return;

  document.querySelectorAll('[data-toggle]').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const bodyId = hdr.dataset.toggle;
      const body   = document.getElementById(bodyId);
      const arrow  = hdr.querySelector('.seg-arrow');
      if (!body) return;
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      if (arrow) arrow.textContent = hidden ? '▼' : '▶';
    });
  });

  document.querySelectorAll('[data-todo-id]').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-todo-del]')) return;
      toggleTodo(trip, item.dataset.todoId);
    });
  });

  document.querySelectorAll('[data-todo-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.todoDel;
      trip.todo = (trip.todo || []).filter(t => t.id !== id);
      persistTrip(trip).then(ok => {
        if (ok) { ui.renderTimeline(trip); bindChecklistEvents(trip); }
      });
    });
  });

  document.querySelectorAll('[data-packing-id]').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-packing-del]')) return;
      togglePacking(trip, item.dataset.packingId);
    });
  });

  document.querySelectorAll('[data-packing-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.packingDel;
      trip.packing = (trip.packing || []).filter(p => p.id !== id);
      persistTrip(trip).then(ok => {
        if (ok) { ui.renderTimeline(trip); bindChecklistEvents(trip); }
      });
    });
  });

  document.getElementById('todo-add-btn')?.addEventListener('click', () => {
    const input = document.getElementById('todo-add-input');
    const text = input?.value.trim();
    if (!text) return;
    trip.todo = [...(trip.todo || []), { id: generateId('todo'), text, done: false }];
    persistTrip(trip).then(ok => {
      if (ok) { ui.renderTimeline(trip); bindChecklistEvents(trip); }
      else trip.todo.pop();
    });
  });

  document.getElementById('todo-add-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) document.getElementById('todo-add-btn')?.click();
  });

  document.getElementById('packing-add-btn')?.addEventListener('click', () => {
    const nameInput = document.getElementById('packing-add-input');
    const catInput  = document.getElementById('packing-cat-input');
    const text = nameInput?.value.trim();
    if (!text) return;
    const category = catInput?.value.trim() || '其他';
    trip.packing = [...(trip.packing || []), { id: generateId('pack'), text, category, done: false }];
    persistTrip(trip).then(ok => {
      if (ok) { ui.renderTimeline(trip); bindChecklistEvents(trip); }
      else trip.packing.pop();
    });
  });

  document.getElementById('packing-add-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) document.getElementById('packing-add-btn')?.click();
  });
}

async function toggleTodo(trip, id) {
  const item = (trip.todo || []).find(t => t.id === id);
  if (!item) return;
  item.done = !item.done;
  const ok = await persistTrip(trip);
  if (!ok) item.done = !item.done;
  ui.renderTimeline(trip);
  bindChecklistEvents(trip);
}

async function togglePacking(trip, id) {
  const item = (trip.packing || []).find(p => p.id === id);
  if (!item) return;
  item.done = !item.done;
  const ok = await persistTrip(trip);
  if (!ok) item.done = !item.done;
  ui.renderTimeline(trip);
  bindChecklistEvents(trip);
}

async function persistTrip(trip) {
  const { trips, user, isOnline } = getState();
  if (!isOnline) { showToast('離線中，無法儲存', 'warn'); return false; }

  if (!trips.current_trips) trips.current_trips = [];
  const idx = trips.current_trips.findIndex(t => t.id === trip.id);
  if (idx !== -1) {
    trips.current_trips[idx] = trip;
  } else {
    const pastIdx = (trips.past_trips || []).findIndex(t => t.id === trip.id);
    if (pastIdx !== -1) trips.past_trips[pastIdx] = trip;
    else trips.current_trips.unshift(trip);
  }

  if (user) {
    try { await api.saveTrips(user.id, trips); }
    catch { showToast('儲存失敗，請重試', 'error'); return false; }
  }
  setState({ trips });
  saveCache(trips, getState().preferences);
  return true;
}

async function deleteTrip(tripId) {
  const { trips, user, isOnline } = getState();
  if (!isOnline) { showToast('離線中，無法刪除', 'warn'); return false; }
  trips.current_trips = (trips.current_trips || []).filter(t => t.id !== tripId);
  trips.past_trips    = (trips.past_trips    || []).filter(t => t.id !== tripId);
  if (user) {
    try { await api.saveTrips(user.id, trips); }
    catch { showToast('刪除失敗，請重試', 'error'); return false; }
  }
  setState({ trips });
  saveCache(trips, getState().preferences);
  return true;
}

/* ── Data Panel ── */
function bindDataPanelEvents() {
  const importTripsFile = document.getElementById('import-trips-file');
  if (importTripsFile) importTripsFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const v = validateTripsJson(data);
      if (!v.ok) { showToast(`格式錯誤：${v.error}`, 'error'); return; }
      const { user } = getState();
      if (user) await api.saveTrips(user.id, data);
      setState({ trips: data, activeTripId: data.current_trips[0]?.id || null });
      saveCache(data, getState().preferences);
      showToast('行程匯入成功', 'success');
      ui.renderTripSelector(data, getState().activeTripId);
      renderActiveTrip();
    } catch (err) { showToast(`匯入失敗：${err.message}`, 'error'); }
    e.target.value = '';
  });

  const importPrefsFile = document.getElementById('import-prefs-file');
  if (importPrefsFile) importPrefsFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const { user } = getState();
      if (user) await api.savePreferences(user.id, data);
      setState({ preferences: data });
      saveCache(getState().trips, data);
      showToast('偏好設定匯入成功', 'success');
      ui.renderPrefs(data);
    } catch (err) { showToast(`匯入失敗：${err.message}`, 'error'); }
    e.target.value = '';
  });

  const exportJsonBtn = document.getElementById('export-json-btn');
  if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => {
    const { trips } = getState();
    const blob = new Blob([JSON.stringify(trips, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `trips_${new Date().toISOString().slice(0,10)}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  });

  const exportExcelBtn = document.getElementById('export-excel-btn');
  if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportExcel);

  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    try {
      shareBtn.disabled = true; shareBtn.textContent = '產生中...';
      const { trips, preferences, activeTripId } = getState();
      const trip = [...(trips.current_trips || []), ...(trips.past_trips || [])].find(t => t.id === activeTripId);
      const { id } = await api.createShare(trip, preferences);
      const url = `${location.origin}/share.html?id=${id}`;
      const resultEl = document.getElementById('share-result');
      const urlEl    = document.getElementById('share-url');
      if (resultEl) resultEl.style.display = 'block';
      if (urlEl) urlEl.textContent = url;
      const copyBtn = document.getElementById('copy-share-btn');
      if (copyBtn) copyBtn.onclick = () => navigator.clipboard.writeText(url).then(() => showToast('已複製', 'success'));
    } catch (err) { showToast(`分享失敗：${err.message}`, 'error'); }
    finally { shareBtn.disabled = false; shareBtn.textContent = '建立唯讀分享連結（TTL 30天）'; }
  });

}

function bindExpenseFormEvents(trip) {
  const saveBtn   = document.getElementById('ef-save');
  const cancelBtn = document.getElementById('ef-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    const wrap = document.getElementById('expense-form-wrap');
    if (wrap) wrap.innerHTML = '';
  });
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const date     = document.getElementById('ef-date')?.value;
    const category = document.getElementById('ef-category')?.value;
    const amount   = parseFloat(document.getElementById('ef-amount')?.value);
    const currency = document.getElementById('ef-currency')?.value?.trim() || trip.base_currency || 'TWD';
    const segEl    = document.getElementById('ef-segment');
    const note     = document.getElementById('ef-note')?.value?.trim();
    if (!date || !category || isNaN(amount) || amount <= 0) {
      showToast('請填寫日期、類別和金額', 'warn'); return;
    }
    const newExp = { id: generateId('exp'), segment_id: segEl?.value || null, date, category, amount, currency, note: note || '' };
    trip.expenses = [...(trip.expenses || []), newExp];
    const ok = await persistTrip(trip);
    if (!ok) { trip.expenses = trip.expenses.slice(0, -1); return; }
    showToast('花費已新增', 'success');
    ui.renderBudget(trip);
    bindDataPanelEvents();
  });
}

async function exportExcel() {
  const { trips, activeTripId } = getState();
  const trip = [...(trips.current_trips || []), ...(trips.past_trips || [])].find(t => t.id === activeTripId);
  if (!trip) { showToast('請先選擇行程', 'warn'); return; }
  if (!window.ExcelJS) { showToast('ExcelJS 載入中，請稍後再試', 'warn'); return; }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('行程');
  ws.columns = [
    { header: '日期', key: 'date', width: 14 },
    { header: '分段', key: 'segment', width: 14 },
    { header: '類型', key: 'type', width: 10 },
    { header: '行程', key: 'title', width: 36 },
    { header: '備註', key: 'note', width: 30 },
    { header: '交通', key: 'transport', width: 22 },
  ];
  for (const seg of (trip.segments || [])) {
    for (const day of (seg.daily || [])) {
      const t = day.transport;
      ws.addRow({ date: day.date, segment: seg.name, type: day.type, title: day.title || '', note: day.note || '', transport: t ? `${t.mode}: ${t.from}→${t.to}` : '' });
    }
  }

  if ((trip.expenses || []).length > 0) {
    const ws2 = wb.addWorksheet('花費');
    ws2.columns = [
      { header: '日期', key: 'date', width: 12 }, { header: '分段', key: 'segment', width: 14 },
      { header: '類別', key: 'category', width: 12 }, { header: '金額', key: 'amount', width: 12 },
      { header: '幣別', key: 'currency', width: 8 }, { header: '備註', key: 'note', width: 30 },
    ];
    for (const e of trip.expenses) {
      const seg = (trip.segments || []).find(s => s.id === e.segment_id);
      ws2.addRow({ date: e.date, segment: seg?.name || '', category: e.category, amount: e.amount, currency: e.currency, note: e.note });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
    download: `${trip.title}_${new Date().toISOString().slice(0,10)}.xlsx`,
  });
  a.click(); URL.revokeObjectURL(a.href);
}

function bindAuthEvents() {
  const emailForm = document.getElementById('auth-email-form');
  const otpForm   = document.getElementById('auth-otp-form');

  emailForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    ui.clearAuthError();
    const email = document.getElementById('auth-email-input')?.value.trim();
    if (!email) return;
    const btn = emailForm.querySelector('button[type=submit]');
    if (btn) btn.disabled = true;
    try {
      const { error } = await api.signInWithOtp(email);
      if (error) throw error;
      pendingEmail = email;
      ui.showOtpStep(email);
    } catch (err) {
      ui.showAuthError(err.message || '發送失敗，請確認信箱是否已授權');
    } finally { if (btn) btn.disabled = false; }
  });

  otpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    ui.clearAuthError();
    const token = document.getElementById('auth-otp-input')?.value.trim();
    if (!token) return;
    const btn = otpForm.querySelector('button[type=submit]');
    if (btn) btn.disabled = true;
    try {
      const { error } = await api.verifyOtp(pendingEmail, token);
      if (error) throw error;
      const user = await api.getUser();
      setState({ user });
      ui.hideAuthOverlay();
      await loadData();
      initMap();
      bindAppEvents();
    } catch (err) {
      ui.showAuthError(err.message || 'OTP 驗證失敗');
    } finally { if (btn) btn.disabled = false; }
  });
}

/* ── Trip Modal ── */
function openTripModal(trip) {
  ui.renderTripModal(trip);
  const tripId = trip?.id || null;

  const overlay = document.getElementById('trip-modal');
  overlay.onclick = e => { if (e.target === overlay) closeTripModal(); };
  document.getElementById('trip-modal-close').onclick = closeTripModal;
  document.getElementById('tm-cancel').onclick = closeTripModal;
  document.getElementById('tm-save').onclick = () => saveTripFromModal(tripId);

  const delBtn = document.getElementById('tm-delete');
  if (delBtn) delBtn.onclick = () => {
    if (confirm('確定要刪除這個行程？此動作無法復原。')) {
      closeTripModal();
      handleDeleteTrip(tripId);
    }
  };
}

function closeTripModal() {
  document.getElementById('trip-modal')?.classList.remove('open');
}

async function saveTripFromModal(existingId) {
  const title    = document.getElementById('tm-title')?.value.trim();
  const start    = document.getElementById('tm-start')?.value;
  const end      = document.getElementById('tm-end')?.value;
  const status   = document.getElementById('tm-status')?.value || 'planning';
  const budget   = parseFloat(document.getElementById('tm-budget')?.value) || 0;
  const currency = (document.getElementById('tm-currency')?.value.trim() || 'TWD').toUpperCase();

  if (!title)        { showToast('請填寫行程名稱', 'warn'); return; }
  if (!start || !end){ showToast('請填寫起訖日期', 'warn'); return; }
  if (start > end)   { showToast('開始日期不能晚於結束日期', 'warn'); return; }

  const { trips } = getState();
  const allTrips  = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  const existing  = allTrips.find(t => t.id === existingId);

  const updated = {
    ...(existing || {}),
    id:            existingId || generateId(),
    title,
    start_date:    start,
    end_date:      end,
    status,
    budget_total:  budget,
    base_currency: currency,
    segments:      existing?.segments  || [],
    todo:          existing?.todo      || [],
    packing:       existing?.packing   || [],
    expenses:      existing?.expenses  || [],
  };

  const ok = await persistTrip(updated);
  if (!ok) return;

  closeTripModal();
  if (!existingId) setState({ activeTripId: updated.id });
  ui.renderTripSelector(getState().trips, getState().activeTripId);
  renderActiveTrip();
  showToast(existingId ? '行程已更新' : '行程已新增', 'success');
}

async function handleDeleteTrip(tripId) {
  const ok = await deleteTrip(tripId);
  if (!ok) return;
  const { trips } = getState();
  const allTrips  = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  setState({ activeTripId: allTrips[0]?.id || null });
  ui.renderTripSelector(trips, getState().activeTripId);
  renderActiveTrip();
  showToast('行程已刪除', 'success');
}

/* ── Segment Modal ── */
function openSegModal(seg, tripId) {
  const { trips } = getState();
  const allTrips = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  const trip     = allTrips.find(t => t.id === tripId);
  ui.renderSegModal(seg, trip?.start_date || '', trip?.end_date || '');
  const segId = seg?.id || null;

  const overlay = document.getElementById('seg-modal');
  overlay.onclick = e => { if (e.target === overlay) closeSegModal(); };
  document.getElementById('seg-modal-close').onclick = closeSegModal;
  document.getElementById('sm-cancel').onclick = closeSegModal;
  document.getElementById('sm-save').onclick = () => saveSegFromModal(segId, tripId);

  document.getElementById('sm-colors').onclick = e => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    document.querySelectorAll('#sm-colors .color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
  };

  const delBtn = document.getElementById('sm-delete');
  if (delBtn) delBtn.onclick = () => {
    if (confirm('確定要刪除此分段？其中的每日行程也會一併移除。')) {
      closeSegModal();
      handleDeleteSeg(segId, tripId);
    }
  };
}

function closeSegModal() {
  document.getElementById('seg-modal')?.classList.remove('open');
}

async function saveSegFromModal(existingId, tripId) {
  const name  = document.getElementById('sm-name')?.value.trim();
  const start = document.getElementById('sm-start')?.value;
  const end   = document.getElementById('sm-end')?.value;
  const color = document.querySelector('#sm-colors .color-swatch.selected')?.dataset.color || '#0EA5E9';

  if (!name)         { showToast('請填寫分段名稱', 'warn'); return; }
  if (!start || !end){ showToast('請填寫起訖日期', 'warn'); return; }
  if (start > end)   { showToast('開始日期不能晚於結束日期', 'warn'); return; }

  const { trips } = getState();
  const allTrips  = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  const trip      = allTrips.find(t => t.id === tripId);
  if (!trip) return;

  if (trip.start_date && start < trip.start_date) {
    showToast(`分段開始日期不能早於行程（${trip.start_date}）`, 'warn'); return;
  }
  if (trip.end_date && end > trip.end_date) {
    showToast(`分段結束日期不能晚於行程（${trip.end_date}）`, 'warn'); return;
  }

  const segments = [...(trip.segments || [])];
  const idx      = segments.findIndex(s => s.id === existingId);
  const segData  = {
    ...(idx !== -1 ? segments[idx] : {}),
    id:         existingId || generateId(),
    name,
    start_date: start,
    end_date:   end,
    color,
    daily:      idx !== -1 ? segments[idx].daily : [],
  };

  if (idx !== -1) segments[idx] = segData;
  else segments.push(segData);

  trip.segments = segments;
  const ok = await persistTrip(trip);
  if (!ok) return;

  closeSegModal();
  renderActiveTrip();
  showToast(existingId ? '分段已更新' : '分段已新增', 'success');
}

async function handleDeleteSeg(segId, tripId) {
  const { trips } = getState();
  const allTrips  = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  const trip      = allTrips.find(t => t.id === tripId);
  if (!trip) return;
  trip.segments = (trip.segments || []).filter(s => s.id !== segId);
  const ok = await persistTrip(trip);
  if (!ok) return;
  renderActiveTrip();
  showToast('分段已刪除', 'success');
}

/* ── Day Modal ── */
function openDayModal(day, segId, tripId, dayIndex = -1) {
  const { trips } = getState();
  const trip = [...(trips.current_trips || []), ...(trips.past_trips || [])].find(t => t.id === tripId);
  const seg  = trip?.segments?.find(s => s.id === segId);
  ui.renderDayModal(day, seg?.start_date || '', seg?.end_date || '');

  const overlay = document.getElementById('day-modal');
  overlay.onclick = e => { if (e.target === overlay) closeDayModal(); };
  document.getElementById('day-modal-close').onclick = closeDayModal;
  document.getElementById('dm-cancel').onclick = closeDayModal;
  document.getElementById('dm-save').onclick = () => saveDayFromModal(dayIndex, segId, tripId);

  const delBtn = document.getElementById('dm-delete');
  if (delBtn) delBtn.onclick = () => {
    if (confirm('確定要刪除此日程？')) {
      closeDayModal();
      handleDeleteDay(dayIndex, segId, tripId);
    }
  };
}

function closeDayModal() {
  document.getElementById('day-modal')?.classList.remove('open');
}

async function saveDayFromModal(existingIndex, segId, tripId) {
  const date  = document.getElementById('dm-date')?.value;
  const type  = document.getElementById('dm-type')?.value || 'sightseeing';
  const title = document.getElementById('dm-title')?.value.trim();
  const note  = document.getElementById('dm-note')?.value.trim();
  const latRaw = document.getElementById('dm-lat')?.value;
  const lngRaw = document.getElementById('dm-lng')?.value;
  const lat = latRaw !== '' && latRaw != null ? parseFloat(latRaw) : null;
  const lng = lngRaw !== '' && lngRaw != null ? parseFloat(lngRaw) : null;

  if (!date)  { showToast('請填寫日期', 'warn'); return; }
  if (!title) { showToast('請填寫標題', 'warn'); return; }

  let transport = null;
  if (type === 'transport') {
    transport = {
      mode:           document.getElementById('dm-t-mode')?.value || 'other',
      from:           document.getElementById('dm-t-from')?.value.trim() || '',
      to:             document.getElementById('dm-t-to')?.value.trim() || '',
      carrier:        document.getElementById('dm-t-carrier')?.value.trim() || '',
      duration_hours: parseFloat(document.getElementById('dm-t-duration')?.value) || null,
    };
  }

  const { trips } = getState();
  const allTrips = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  const trip = allTrips.find(t => t.id === tripId);
  const seg  = trip?.segments?.find(s => s.id === segId);
  if (!trip || !seg) return;

  const dayData = { date, type, title, note: note || '', lat, lng, transport };

  const days = [...(seg.daily || [])];
  if (existingIndex >= 0) days[existingIndex] = dayData;
  else days.push(dayData);

  days.sort((a, b) => a.date.localeCompare(b.date));
  seg.daily = days;

  const ok = await persistTrip(trip);
  if (!ok) return;

  closeDayModal();
  renderActiveTrip();
  showToast(existingIndex >= 0 ? '日程已更新' : '日程已新增', 'success');
}

async function handleDeleteDay(dayIndex, segId, tripId) {
  const { trips } = getState();
  const allTrips = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  const trip = allTrips.find(t => t.id === tripId);
  const seg  = trip?.segments?.find(s => s.id === segId);
  if (!trip || !seg) return;
  seg.daily = (seg.daily || []).filter((_, i) => i !== dayIndex);
  const ok = await persistTrip(trip);
  if (!ok) return;
  renderActiveTrip();
  showToast('日程已刪除', 'success');
}

init().catch(console.error);
