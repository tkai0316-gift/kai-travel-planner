import { getState, setState, validateTripsJson, saveCache, loadCache } from './store.js';
import * as api from './api.js';
import * as mapMgr from './mapManager.js';
import * as ui from './uiRenderer.js';
import { showToast, generateId, esc, ICON_GLOBE } from './utils.js';

let pendingEmail = '';

async function init() {
  const user = await api.getUser();
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

  // DEV BYPASS — remove before production
  if (true || user) {
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

  const sel = document.getElementById('trip-selector');
  if (sel) sel.addEventListener('change', (e) => {
    setState({ activeTripId: e.target.value });
    renderActiveTrip();
  });

  window.addEventListener('kai-travel:day-click', (e) => {
    const { lat, lng } = e.detail;
    if (lat != null && lng != null) mapMgr.flyToDay(lat, lng);
  });

  const toggleBtn = document.getElementById('panel-toggle');
  const leftPanel = document.getElementById('left-panel');
  if (toggleBtn && leftPanel) {
    toggleBtn.addEventListener('click', () => leftPanel.classList.toggle('panel-open'));
  }

  const signOutBtn = document.getElementById('signout-btn');
  if (signOutBtn) signOutBtn.addEventListener('click', async () => {
    await api.signOut();
    location.reload();
  });

  document.getElementById('panel-prefs')?.addEventListener('click', e => {
    if (e.target.id === 'prefs-edit-btn') {
      const { preferences } = getState();
      ui.renderPrefsEdit(preferences);
      bindPrefsEditEvents(preferences);
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
  function render() {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    wrap.innerHTML = arr.map((t, i) =>
      `<span class="tag-chip">${esc(t)}<button class="tag-rm" data-i="${i}">×</button></span>`
    ).join('') + `<input class="tag-input" placeholder="新增…" maxlength="40">`;
    wrap.querySelectorAll('.tag-rm').forEach(btn =>
      btn.addEventListener('click', () => { arr.splice(+btn.dataset.i, 1); render(); })
    );
    const input = wrap.querySelector('.tag-input');
    if (input) input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = input.value.trim();
        if (v && !arr.includes(v)) { arr.push(v); render(); }
      }
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
    if (!form || form.style.display === 'flex') return;
    form.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px';
    form.innerHTML = `
      <input id="pe-bl-dest"  class="pref-input" placeholder="目的地" maxlength="80">
      <input id="pe-bl-notes" class="pref-input" placeholder="備註（選填）" maxlength="200">
      <div style="display:flex;gap:6px">
        <button id="pe-bl-cx"  class="btn btn-ghost"   style="flex:1;font-size:12px">取消</button>
        <button id="pe-bl-ok"  class="btn btn-primary" style="flex:1;font-size:12px">新增</button>
      </div>`;
    document.getElementById('pe-bl-cx')?.addEventListener('click', () => {
      form.style.display = 'none'; form.innerHTML = '';
    });
    document.getElementById('pe-bl-ok')?.addEventListener('click', () => {
      const dest = document.getElementById('pe-bl-dest')?.value.trim();
      if (!dest) { showToast('請填寫目的地', 'warn'); return; }
      bl.push({ destination: dest, notes: document.getElementById('pe-bl-notes')?.value.trim() || '' });
      form.style.display = 'none'; form.innerHTML = '';
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

  // Collapsible toggle for checklist sections
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

  // Todo checkbox toggle
  document.querySelectorAll('[data-todo-id]').forEach(item => {
    item.addEventListener('click', () => toggleTodo(trip, item.dataset.todoId));
  });

  // Packing checkbox toggle
  document.querySelectorAll('[data-packing-id]').forEach(item => {
    item.addEventListener('click', () => togglePacking(trip, item.dataset.packingId));
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

  if (!isOnline) {
    showToast('離線中，無法儲存', 'warn');
    return false;
  }

  const idx = (trips.current_trips || []).findIndex(t => t.id === trip.id);
  if (idx !== -1) trips.current_trips[idx] = trip;

  if (user) {
    try {
      await api.saveTrips(user.id, trips);
    } catch {
      showToast('儲存失敗，請重試', 'error');
      return false;
    }
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

  /* ── Add Expense ── */
  const addExpenseBtn = document.getElementById('add-expense-btn');
  if (addExpenseBtn) addExpenseBtn.addEventListener('click', () => {
    const { trips, activeTripId } = getState();
    const trip = [...(trips.current_trips || []), ...(trips.past_trips || [])].find(t => t.id === activeTripId);
    if (!trip) return;
    ui.renderExpenseForm(trip);
    bindExpenseFormEvents(trip);
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

init().catch(console.error);
