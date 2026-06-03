import { getState, setState, validateTripsJson, saveCache, loadCache } from './store.js';
import * as api from './api.js';
import * as mapMgr from './mapManager.js';
import * as ui from './uiRenderer.js';
import { showToast, generateId, esc, ICON_GLOBE, openConfirm } from './utils.js';
import { SEL } from './selectors.js';

// ── DOM helper ────────────────────────────────────────────────────────────────
const q = id => document.getElementById(id);

// ── Module state ──────────────────────────────────────────────────────────────
let pendingEmail = '';
let _todoComposing   = false;
let _packComposing   = false;
let _ideaComposing   = false;
let _selectorOpen    = false;          // trip-selector dropdown state (truth lives here)
let checklistAC      = new AbortController(); // cleaned up on every renderTimeline

// ── Helpers ───────────────────────────────────────────────────────────────────
function getActiveTrip() {
  const { trips, activeTripId } = getState();
  const all = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  return all.find(t => t.id === activeTripId) || null;
}

// ── Init ──────────────────────────────────────────────────────────────────────
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

  if (user) {
    ui.hideAuthOverlay();
    initMap();
    await loadData();
    bindAppEvents();
  }
}

// ── Data loading ──────────────────────────────────────────────────────────────
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

function getRates(trip) {
  const base = trip?.base_currency || 'TWD';
  return getState().ratesCache[base] || null;
}

function renderActiveTrip() {
  const { trips, activeTripId, preferences } = getState();
  const allTrips = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  const trip = allTrips.find(t => t.id === activeTripId) || null;

  ui.renderTimeline(trip, getState().weatherCache);
  ui.renderDayTabs(trip);
  ui.renderBudget(trip, getRates(trip));
  ui.renderPrefs(preferences);
  ui.renderDataPanel(trips);
  bindChecklistEvents(trip);
  bindDataPanelEvents();

  if (trip) {
    mapMgr.renderTrip(trip);
    loadWeather(trip);
    loadRates(trip);
  } else {
    mapMgr.clearMap();
  }
}

async function loadWeather(trip) {
  const today  = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

  const locations = new Map();
  for (const seg of (trip.segments || [])) {
    for (const day of (seg.daily || [])) {
      if (day.lat == null || day.lng == null) continue;
      if (day.date < today || day.date > cutoff) continue;
      const key = `${day.lat}_${day.lng}`;
      if (!locations.has(key)) locations.set(key, { lat: day.lat, lng: day.lng });
    }
  }
  if (locations.size === 0) return;

  const existing = getState().weatherCache;
  const toFetch  = [...locations.entries()].filter(([key]) => !existing[key]);
  if (toFetch.length === 0) return;

  const results = await Promise.allSettled(
    toFetch.map(async ([key, { lat, lng }]) => ({ key, data: await api.fetchWeather(lat, lng) }))
  );

  const updated = { ...existing };
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value.data) updated[r.value.key] = r.value.data;
  });
  setState({ weatherCache: updated });

  const { trips, activeTripId } = getState();
  const active = [...(trips.current_trips || []), ...(trips.past_trips || [])].find(t => t.id === activeTripId);
  if (active?.id === trip.id) ui.renderTimeline(active, updated);
}

async function loadRates(trip) {
  const base = trip?.base_currency || 'TWD';
  if (getState().ratesCache[base]) return;
  const rates = await api.fetchExchangeRates(base);
  if (!rates) return;
  setState({ ratesCache: { ...getState().ratesCache, [base]: rates } });
  const { trips, activeTripId } = getState();
  const active = [...(trips.current_trips || []), ...(trips.past_trips || [])].find(t => t.id === activeTripId);
  if (active?.id === trip.id) ui.renderBudget(active, rates);
}

function initMap() {
  mapMgr.init(SEL.map);
  mapMgr.onMarkerClick((date) => {
    ui.scrollTimelineToDate(date);
  });
}

// ── App-level event bindings (called once after login) ────────────────────────
function bindAppEvents() {
  // Tabs
  [
    [SEL.tabTrips,  'trips'],
    [SEL.tabBudget, 'budget'],
    [SEL.tabPrefs,  'prefs'],
    [SEL.tabData,   'data'],
  ].forEach(([id, tab]) => {
    q(id)?.addEventListener('click', () => { setState({ activeTab: tab }); ui.setActiveTab(tab); });
  });

  // Trip selector dropdown — state tracked in _selectorOpen, not from DOM
  const tripSelBtn  = q(SEL.tripSelectorBtn);
  const tripSelList = q(SEL.tripSelectorList);
  if (tripSelBtn && tripSelList) {
    tripSelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _selectorOpen = !_selectorOpen;
      tripSelList.style.display = _selectorOpen ? 'block' : 'none';
    });
    tripSelList.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-trip-id]');
      if (!li) return;
      _selectorOpen = false;
      tripSelList.style.display = 'none';
      setState({ activeTripId: li.dataset.tripId });
      ui.renderTripSelector(getState().trips, li.dataset.tripId);
      renderActiveTrip();
    });
    document.addEventListener('click', () => {
      if (!_selectorOpen) return;
      _selectorOpen = false;
      tripSelList.style.display = 'none';
    });
  }

  // Day click → map fly-to
  window.addEventListener('kai-travel:day-click', (e) => {
    const { lat, lng } = e.detail;
    if (lat != null && lng != null) mapMgr.flyToDay(lat, lng);
  });

  // Mobile panel toggle
  const toggleBtn = q(SEL.panelToggle);
  const leftPanel = q(SEL.leftPanel);
  const ICON_MENU  = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
  const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  if (toggleBtn && leftPanel) {
    toggleBtn.addEventListener('click', () => {
      const isOpen = leftPanel.classList.toggle('panel-open');
      toggleBtn.innerHTML = isOpen ? ICON_CLOSE : ICON_MENU;
    });
  }

  // Sign out
  q(SEL.signoutBtn)?.addEventListener('click', async () => {
    await api.signOut();
    location.reload();
  });

  // Budget — event delegation (bound once)
  q(SEL.budgetContent)?.addEventListener('click', e => {
    const trip = getActiveTrip();
    if (!trip) return;
    if (e.target.id === 'add-expense-btn' || e.target.closest('#add-expense-btn')) {
      ui.renderExpenseForm(trip, null);
      bindExpenseFormEvents(trip, null);
      return;
    }
    const editBtn = e.target.closest('.expense-edit-btn');
    if (editBtn) {
      const exp = (trip.expenses || []).find(ex => ex.id === editBtn.dataset.expenseId);
      if (exp) { ui.renderExpenseForm(trip, exp); bindExpenseFormEvents(trip, exp); }
      return;
    }
    const delBtn = e.target.closest('.expense-del-btn');
    if (delBtn) {
      const expId = delBtn.dataset.expenseId;
      trip.expenses = (trip.expenses || []).filter(ex => ex.id !== expId);
      persistTrip(trip).then(ok => { if (ok) ui.renderBudget(trip, getRates(trip)); });
    }
  });

  // Data panel idea-delete — event delegation (bound once)
  q(SEL.dataContent)?.addEventListener('click', async e => {
    const delBtn = e.target.closest('[data-idea-del]');
    if (!delBtn) return;
    const { trips, user, isOnline } = getState();
    if (!isOnline) { showToast('離線中，無法刪除', 'warn'); return; }
    const ideaId = delBtn.dataset.ideaDel;
    trips.trip_ideas = (trips.trip_ideas || []).filter(i => i.id !== ideaId);
    setState({ trips });
    if (user) { try { await api.saveTrips(user.id, trips); } catch { showToast('刪除失敗', 'error'); return; } }
    saveCache(trips, getState().preferences);
    ui.renderDataPanel(trips);
    bindDataPanelEvents();
  });

  // Prefs edit button
  q(SEL.panelPrefs)?.addEventListener('click', e => {
    if (e.target.id === 'prefs-edit-btn') {
      const { preferences } = getState();
      ui.renderPrefsEdit(preferences);
      bindPrefsEditEvents(preferences);
    }
  });

  // Timeline — event delegation (bound once)
  q(SEL.timelineContent)?.addEventListener('click', e => {
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

  // ESC closes any open modal
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    [SEL.tripModal, SEL.segModal, SEL.dayModal, SEL.confirmModal].forEach(id => {
      q(id)?.classList.remove('open');
    });
  });

  // Desktop drag-to-scroll for day tabs
  const dayTabsEl = document.getElementById('day-tabs-container');
  if (dayTabsEl) {
    let ptrDown = false, startX = 0, scrollLeft = 0, hasDragged = false;
    dayTabsEl.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      ptrDown = true; hasDragged = false;
      startX = e.clientX; scrollLeft = dayTabsEl.scrollLeft;
      dayTabsEl.classList.add('grabbing');
    });
    dayTabsEl.addEventListener('pointermove', e => {
      if (!ptrDown) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 8) hasDragged = true;
      dayTabsEl.scrollLeft = scrollLeft - dx;
    });
    const endDrag = () => { ptrDown = false; dayTabsEl.classList.remove('grabbing'); };
    dayTabsEl.addEventListener('pointerup', endDrag);
    dayTabsEl.addEventListener('pointerleave', endDrag);
    // 只有確實拖拉時才攔截 click，防止誤觸 day-tab-btn
    dayTabsEl.addEventListener('click', e => {
      if (hasDragged) { e.stopPropagation(); hasDragged = false; }
    }, true);
  }

  // Day tabs — event delegation on #panel-trips (stable across re-renders)
  q('panel-trips')?.addEventListener('click', e => {
    const btn = e.target.closest('.day-tab-btn');
    if (!btn) return;
    const date  = btn.dataset.tabDate;
    const segId = btn.dataset.segId;
    if (!date) return;

    document.querySelectorAll('.day-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (segId) ui.ensureSegExpanded(segId);

    const card = document.querySelector(`[data-day="${date}"]`);
    if (card) {
      setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      const lat = parseFloat(card.dataset.lat);
      const lng = parseFloat(card.dataset.lng);
      if (!isNaN(lat) && !isNaN(lng)) mapMgr.flyToDay(lat, lng);
    }
  });
}

// ── Prefs Edit ────────────────────────────────────────────────────────────────
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
    const wrap = q(wrapId);
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

  makeTagManager(SEL.peLangWrap, langs);
  makeTagManager(SEL.peIntWrap,  ints);

  // Custom select (cs) events
  const onCsOutside = e => {
    if (!e.target.closest('.cs')) document.querySelectorAll('.cs.open').forEach(el => el.classList.remove('open'));
  };
  document.addEventListener('click', onCsOutside);

  document.querySelectorAll('.cs').forEach(cs => {
    cs.querySelector('.cs-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = cs.classList.contains('open');
      document.querySelectorAll('.cs.open').forEach(el => el.classList.remove('open'));
      if (!isOpen) cs.classList.add('open');
    });
    cs.querySelectorAll('.cs-opt').forEach(opt => {
      opt.addEventListener('click', e => {
        e.stopPropagation();
        cs.dataset.val = opt.dataset.val;
        cs.querySelector('.cs-label').textContent = opt.textContent;
        cs.querySelectorAll('.cs-opt').forEach(o => o.classList.toggle('cs-on', o === opt));
        cs.classList.remove('open');
      });
    });
  });

  function renderBl() {
    const list = q(SEL.peBlList);
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

  q(SEL.peBlAdd)?.addEventListener('click', () => {
    const form = q(SEL.peBlForm);
    if (!form || form.dataset.open === '1') return;
    form.dataset.open = '1';
    form.style.cssText = 'display:block;margin-top:4px';
    form.innerHTML = `
      <div class="bucket-item" style="align-items:flex-start;gap:6px">
        <span class="bucket-icon" style="margin-top:6px">${ICON_GLOBE}</span>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <input id="${SEL.peBlDest}"  class="pref-input" placeholder="目的地" maxlength="80">
          <input id="${SEL.peBlNotes}" class="pref-input" placeholder="備註（選填）" maxlength="200">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          <button type="button" id="${SEL.peBlOk}" class="btn btn-primary" style="padding:4px 14px;min-height:unset;font-size:11px">確認</button>
          <button type="button" id="${SEL.peBlCx}" class="btn btn-ghost"   style="padding:4px 14px;min-height:unset;font-size:11px">取消</button>
        </div>
      </div>`;
    q(SEL.peBlCx)?.addEventListener('click', () => {
      form.style.display = 'none'; form.innerHTML = ''; delete form.dataset.open;
    });
    q(SEL.peBlOk)?.addEventListener('click', () => {
      const dest = q(SEL.peBlDest)?.value.trim();
      if (!dest) { showToast('請填寫目的地', 'warn'); return; }
      bl.push({ destination: dest, notes: q(SEL.peBlNotes)?.value.trim() || '' });
      form.style.display = 'none'; form.innerHTML = ''; delete form.dataset.open;
      renderBl();
    });
  });

  q(SEL.peCancel)?.addEventListener('click', () => {
    document.removeEventListener('click', onCsOutside);
    ui.renderPrefs(getState().preferences);
  });

  q(SEL.peSave)?.addEventListener('click', async () => {
    const { user, isOnline } = getState();
    if (!isOnline) { showToast('離線中，無法儲存', 'warn'); return; }
    const updated = {
      ...initPrefs,
      travel_style:      q(SEL.peStyle)?.dataset.val,
      budget_level:      q(SEL.peBudget)?.dataset.val,
      pace_preference:   q(SEL.pePace)?.dataset.val,
      travel_companions: q(SEL.peCompanion)?.dataset.val,
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
    document.removeEventListener('click', onCsOutside);
    showToast('偏好設定已儲存', 'success');
    ui.renderPrefs(updated);
  });
}

// ── Checklist — AbortController 確保每次 re-render 後舊 listener 全清 ─────────
function bindChecklistEvents(trip) {
  if (!trip) return;

  checklistAC.abort();
  checklistAC = new AbortController();
  const { signal } = checklistAC;

  document.querySelectorAll('[data-toggle]').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const body  = q(hdr.dataset.toggle);
      const arrow = hdr.querySelector('.seg-arrow');
      if (!body) return;
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      if (arrow) arrow.textContent = hidden ? '▼' : '▶';
    }, { signal });
  });

  document.querySelectorAll('[data-todo-id]').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-todo-del]')) return;
      toggleTodo(trip, item.dataset.todoId);
    }, { signal });
  });

  document.querySelectorAll('[data-todo-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.todoDel;
      trip.todo = (trip.todo || []).filter(t => t.id !== id);
      persistTrip(trip).then(ok => {
        if (ok) { ui.renderTimeline(trip, getState().weatherCache); bindChecklistEvents(trip); }
      });
    }, { signal });
  });

  document.querySelectorAll('[data-packing-id]').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-packing-del]')) return;
      togglePacking(trip, item.dataset.packingId);
    }, { signal });
  });

  document.querySelectorAll('[data-packing-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.packingDel;
      trip.packing = (trip.packing || []).filter(p => p.id !== id);
      persistTrip(trip).then(ok => {
        if (ok) { ui.renderTimeline(trip, getState().weatherCache); bindChecklistEvents(trip); }
      });
    }, { signal });
  });

  q(SEL.todoAddBtn)?.addEventListener('click', () => {
    const input = q(SEL.todoAddInput);
    const text = input?.value.trim();
    if (!text) return;
    trip.todo = [...(trip.todo || []), { id: generateId('todo'), text, done: false }];
    persistTrip(trip).then(ok => {
      if (ok) { ui.renderTimeline(trip, getState().weatherCache); bindChecklistEvents(trip); }
      else trip.todo.pop();
    });
  }, { signal });

  const todoInput = q(SEL.todoAddInput);
  if (todoInput) {
    todoInput.addEventListener('compositionstart', () => { _todoComposing = true; }, { signal });
    todoInput.addEventListener('compositionend',   () => { setTimeout(() => { _todoComposing = false; }, 0); }, { signal });
    todoInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !_todoComposing && !e.isComposing) q(SEL.todoAddBtn)?.click();
    }, { signal });
  }

  q(SEL.packingAddBtn)?.addEventListener('click', () => {
    const nameInput = q(SEL.packingAddInput);
    const catInput  = q(SEL.packingCatInput);
    const text = nameInput?.value.trim();
    if (!text) return;
    const category = catInput?.value.trim() || '其他';
    trip.packing = [...(trip.packing || []), { id: generateId('pack'), text, category, done: false }];
    persistTrip(trip).then(ok => {
      if (ok) { ui.renderTimeline(trip, getState().weatherCache); bindChecklistEvents(trip); }
      else trip.packing.pop();
    });
  }, { signal });

  const packInput = q(SEL.packingAddInput);
  if (packInput) {
    packInput.addEventListener('compositionstart', () => { _packComposing = true; }, { signal });
    packInput.addEventListener('compositionend',   () => { setTimeout(() => { _packComposing = false; }, 0); }, { signal });
    packInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !_packComposing && !e.isComposing) q(SEL.packingAddBtn)?.click();
    }, { signal });
  }
}

async function toggleTodo(trip, id) {
  const item = (trip.todo || []).find(t => t.id === id);
  if (!item) return;
  item.done = !item.done;
  const ok = await persistTrip(trip);
  if (!ok) item.done = !item.done;
  ui.renderTimeline(trip, getState().weatherCache);
  bindChecklistEvents(trip);
}

async function togglePacking(trip, id) {
  const item = (trip.packing || []).find(p => p.id === id);
  if (!item) return;
  item.done = !item.done;
  const ok = await persistTrip(trip);
  if (!ok) item.done = !item.done;
  ui.renderTimeline(trip, getState().weatherCache);
  bindChecklistEvents(trip);
}

// ── Data persistence ──────────────────────────────────────────────────────────
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

// ── Data Panel ────────────────────────────────────────────────────────────────
function bindDataPanelEvents() {
  const importTripsFile = q(SEL.importTripsFile);
  if (importTripsFile) importTripsFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const v = validateTripsJson(data);
      if (!v.ok) { showToast(`格式錯誤：${v.error}`, 'error'); return; }
      const { user, trips: existing } = getState();
      const mergeById = (cur, inc) => {
        const ids = new Set(cur.map(t => t.id));
        return [...cur, ...inc.filter(t => !ids.has(t.id))];
      };
      const merged = {
        current_trips: mergeById(existing.current_trips || [], data.current_trips || []),
        past_trips:    mergeById(existing.past_trips    || [], data.past_trips    || []),
        trip_ideas:    mergeById(existing.trip_ideas    || [], data.trip_ideas    || []),
      };
      const added = (data.current_trips?.length || 0) + (data.past_trips?.length || 0);
      if (user) await api.saveTrips(user.id, merged);
      setState({ trips: merged, activeTripId: getState().activeTripId || merged.current_trips[0]?.id || null });
      saveCache(merged, getState().preferences);
      showToast(`已新增 ${added} 筆行程`, 'success');
      ui.renderTripSelector(merged, getState().activeTripId);
      renderActiveTrip();
    } catch (err) { showToast(`匯入失敗：${err.message}`, 'error'); }
    e.target.value = '';
  });

  const importPrefsFile = q(SEL.importPrefsFile);
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

  q(SEL.downloadTemplateBtn)?.addEventListener('click', () => {
    const template = {
      current_trips: [{
        id: 'trip-tpl-001',
        title: '行程名稱（例：日本春末行）',
        status: 'planning',
        start_date: '2026-07-01',
        end_date: '2026-07-07',
        base_currency: 'TWD',
        budget_total: 50000,
        notes: '這趟旅行的簡短說明',
        segments: [{
          id: 'seg-tpl-001',
          name: '分段名稱（例：東京段）',
          color: '#2C6E8A',
          start_date: '2026-07-01',
          end_date: '2026-07-04',
          daily: [
            {
              date: '2026-07-01',
              type: 'transport',
              title: '出發 → 目的地',
              note: '備註：航班號、接駁方式等',
              lat: 25.0797, lng: 121.2342,
              transport: { mode: 'flight', from: '桃園 TPE', to: '目的地機場', duration_hours: 3 },
            },
            {
              date: '2026-07-02',
              type: 'sightseeing',
              title: '景點名稱 × 另一景點',
              note: '備註：開放時間、購票方式、建議幾點到',
              lat: 35.6762, lng: 139.6503,
            },
            {
              date: '2026-07-03',
              type: 'rest',
              title: '自由日',
              note: '備註：彈性安排',
              lat: 35.6762, lng: 139.6503,
            },
          ],
        }],
        expenses: [
          { id: 'exp-tpl-001', date: '2026-07-01', category: '交通', amount: 15000, currency: 'TWD', note: '來回機票（含稅）', segment_id: 'seg-tpl-001' },
          { id: 'exp-tpl-002', date: '2026-07-01', category: '住宿', amount: 3500,  currency: 'TWD', note: '飯店第一晚',       segment_id: 'seg-tpl-001' },
        ],
        todo: [
          { id: 'todo-tpl-001', text: '訂機票', done: false },
          { id: 'todo-tpl-002', text: '辦理旅遊保險', done: false },
        ],
        packing: [
          { id: 'pack-tpl-001', text: '護照', category: '證件', done: false },
          { id: 'pack-tpl-002', text: '信用卡', category: '證件', done: false },
          { id: 'pack-tpl-003', text: '行動電源', category: '3C', done: false },
        ],
      }],
      past_trips: [],
      trip_ideas: [
        { id: 'idea-tpl-001', title: '夢想目的地', notes: '想去的原因或備註' },
      ],
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'trips-template.json' });
    a.click(); URL.revokeObjectURL(a.href);
  });

  q(SEL.exportJsonBtn)?.addEventListener('click', () => {
    const { trips } = getState();
    const blob = new Blob([JSON.stringify(trips, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `trips_${new Date().toISOString().slice(0,10)}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  });

  q(SEL.exportExcelBtn)?.addEventListener('click', exportExcel);

  q(SEL.downloadExcelTemplateBtn)?.addEventListener('click', downloadExcelTemplate);

  const importTripsExcelFile = q(SEL.importTripsExcelFile);
  if (importTripsExcelFile) importTripsExcelFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importExcel(file);
    e.target.value = '';
  });

  const LS_SHARE_KEY = 'ktp_share_tokens';
  function getShareTokens() { return JSON.parse(localStorage.getItem(LS_SHARE_KEY) || '[]'); }
  function saveShareTokens(arr) { localStorage.setItem(LS_SHARE_KEY, JSON.stringify(arr.slice(-10))); }

  function renderShareTokensList() {
    const el = q(SEL.shareTokensList);
    if (!el) return;
    const tokens = getShareTokens();
    if (!tokens.length) { el.innerHTML = ''; return; }
    el.innerHTML = tokens.map(t => `
      <div class="share-token-row" data-id="${esc(t.id)}">
        <div class="share-url-box">${esc(t.url)}</div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-link share-copy-btn" style="font-size:12px">複製</button>
          <button class="btn btn-danger share-revoke-btn" style="font-size:12px">撤銷連結</button>
        </div>
      </div>`).join('');
    el.querySelectorAll('.share-copy-btn').forEach(btn => {
      const id = btn.closest('[data-id]').dataset.id;
      const token = tokens.find(t => t.id === id);
      btn.onclick = () => navigator.clipboard.writeText(token.url).then(() => showToast('已複製', 'success'));
    });
    el.querySelectorAll('.share-revoke-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.closest('[data-id]').dataset.id;
        try {
          btn.disabled = true; btn.textContent = '撤銷中...';
          await api.deleteShare(id);
          saveShareTokens(getShareTokens().filter(t => t.id !== id));
          renderShareTokensList();
          showToast('連結已撤銷', 'success');
        } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = '撤銷連結'; }
      };
    });
  }

  q(SEL.shareBtn)?.addEventListener('click', async () => {
    const shareBtn = q(SEL.shareBtn);
    try {
      shareBtn.disabled = true; shareBtn.textContent = '產生中...';
      const { trips, preferences, activeTripId } = getState();
      const trip = [...(trips.current_trips || []), ...(trips.past_trips || [])].find(t => t.id === activeTripId);
      const { id } = await api.createShare(trip, preferences);
      const url = `${location.origin}/share.html?id=${id}`;
      saveShareTokens([...getShareTokens(), { id, url }]);
      renderShareTokensList();
      showToast('分享連結已建立', 'success');
    } catch (err) { showToast(`分享失敗：${err.message}`, 'error'); }
    finally { shareBtn.disabled = false; shareBtn.textContent = '建立唯讀分享連結（TTL 30天）'; }
  });
  renderShareTokensList();

  // Trip Ideas
  const ideaAddBtn    = q(SEL.ideaAddBtn);
  const ideaInput     = q(SEL.ideaAddInput);
  const ideaNotesInput = q(SEL.ideaNotesInput);
  if (ideaAddBtn) ideaAddBtn.addEventListener('click', async () => {
    const title = ideaInput?.value.trim();
    if (!title) return;
    const notes = ideaNotesInput?.value.trim() || '';
    const { trips, user, isOnline } = getState();
    if (!isOnline) { showToast('離線中，無法新增', 'warn'); return; }
    const newIdea = { id: generateId('idea'), title, notes };
    trips.trip_ideas = [...(trips.trip_ideas || []), newIdea];
    setState({ trips });
    if (user) {
      try { await api.saveTrips(user.id, trips); }
      catch { showToast('儲存失敗', 'error'); trips.trip_ideas = trips.trip_ideas.filter(i => i.id !== newIdea.id); setState({ trips }); return; }
    }
    saveCache(trips, getState().preferences);
    if (ideaInput) ideaInput.value = '';
    if (ideaNotesInput) ideaNotesInput.value = '';
    ui.renderDataPanel(trips);
    bindDataPanelEvents();
  });
  if (ideaInput) {
    ideaInput.addEventListener('compositionstart', () => { _ideaComposing = true; });
    ideaInput.addEventListener('compositionend',   () => { setTimeout(() => { _ideaComposing = false; }, 0); });
    ideaInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !_ideaComposing && !e.isComposing) ideaAddBtn?.click();
    });
  }
}

// ── Expense Form ──────────────────────────────────────────────────────────────
function bindExpenseFormEvents(trip, existingExp = null) {
  const cancelBtn = q(SEL.efCancel);
  const saveBtn   = q(SEL.efSave);
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    const wrap = q(SEL.expenseFormWrap);
    if (wrap) wrap.innerHTML = '';
  });
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const date     = q(SEL.efDate)?.value;
    const category = q(SEL.efCategory)?.value;
    const amount   = parseFloat(q(SEL.efAmount)?.value);
    const currency = q(SEL.efCurrency)?.value?.trim() || trip.base_currency || 'TWD';
    const segEl    = q(SEL.efSegment);
    const note     = q(SEL.efNote)?.value?.trim();
    if (!date || !category || isNaN(amount) || amount <= 0) {
      showToast('請填寫日期、類別和金額', 'warn'); return;
    }
    if (existingExp) {
      const idx = (trip.expenses || []).findIndex(e => e.id === existingExp.id);
      if (idx !== -1) trip.expenses[idx] = { ...trip.expenses[idx], date, category, amount, currency, segment_id: segEl?.value || null, note: note || '' };
    } else {
      trip.expenses = [...(trip.expenses || []), { id: generateId('exp'), segment_id: segEl?.value || null, date, category, amount, currency, note: note || '' }];
    }
    const ok = await persistTrip(trip);
    if (!ok) { if (!existingExp) trip.expenses = trip.expenses.slice(0, -1); return; }
    showToast(existingExp ? '花費已更新' : '花費已新增', 'success');
    ui.renderBudget(trip, getRates(trip));
  });
}

// ── Excel Export ──────────────────────────────────────────────────────────────
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

// ── Excel Template Download ────────────────────────────────────────────────────
async function downloadExcelTemplate() {
  if (!window.ExcelJS) { showToast('ExcelJS 載入中，請稍後再試', 'warn'); return; }
  const wb = new ExcelJS.Workbook();

  const infoWs = wb.addWorksheet('行程資訊');
  infoWs.columns = [
    { header: '行程名稱', key: 'title', width: 22 },
    { header: '開始日期', key: 'start_date', width: 14 },
    { header: '結束日期', key: 'end_date', width: 14 },
    { header: '總預算', key: 'budget_total', width: 12 },
    { header: '幣別', key: 'base_currency', width: 8 },
    { header: '備註', key: 'notes', width: 30 },
  ];
  infoWs.addRow(['日本春末行', '2026-07-01', '2026-07-07', 50000, 'TWD', '第一次去日本，以東京為主']);

  const dayWs = wb.addWorksheet('日程');
  dayWs.columns = [
    { header: '分段名稱', key: 'seg_name', width: 16 },
    { header: '分段開始', key: 'seg_start', width: 14 },
    { header: '分段結束', key: 'seg_end', width: 14 },
    { header: '日期', key: 'date', width: 14 },
    { header: '類型', key: 'type', width: 10 },
    { header: '標題', key: 'title', width: 30 },
    { header: '備註', key: 'note', width: 36 },
    { header: '緯度', key: 'lat', width: 12 },
    { header: '經度', key: 'lng', width: 12 },
  ];
  dayWs.addRows([
    ['東京段', '2026-07-01', '2026-07-04', '2026-07-01', '交通', '桃園 → 成田（NH203）', '航班 10:30 起飛，提前 2 小時到機場', 35.7681, 140.3868],
    ['東京段', '2026-07-01', '2026-07-04', '2026-07-02', '觀光', '淺草寺 × 晴空塔', '建議早上 8 點前到淺草，人少', 35.7148, 139.7967],
    ['東京段', '2026-07-01', '2026-07-04', '2026-07-03', '休息', '自由日', '可去秋葉原或台場', 35.6762, 139.6503],
    ['京都段', '2026-07-04', '2026-07-07', '2026-07-04', '交通', '東京 → 京都（新幹線）', '自由席，約 2.5 小時', 34.9859, 135.7587],
    ['京都段', '2026-07-04', '2026-07-07', '2026-07-05', '觀光', '嵐山 × 金閣寺', '', 35.0094, 135.6716],
  ]);

  const expWs = wb.addWorksheet('花費');
  expWs.columns = [
    { header: '日期', key: 'date', width: 14 },
    { header: '分段名稱', key: 'seg_name', width: 16 },
    { header: '類別', key: 'category', width: 12 },
    { header: '金額', key: 'amount', width: 12 },
    { header: '幣別', key: 'currency', width: 8 },
    { header: '備註', key: 'note', width: 30 },
  ];
  expWs.addRows([
    ['2026-07-01', '東京段', '交通', 15000, 'TWD', '來回機票（含稅）'],
    ['2026-07-01', '東京段', '住宿', 4500, 'TWD', '飯店第一晚'],
    ['2026-07-04', '京都段', '交通', 4400, 'JPY', '新幹線自由席'],
  ]);

  const helpWs = wb.addWorksheet('說明');
  [
    ['【填寫說明】'],
    [''],
    ['■ 行程資訊（第一個 sheet）'],
    ['  填一列，代表整筆行程的基本資料。幣別可填 TWD / JPY / USD / EUR 等。'],
    [''],
    ['■ 日程（第二個 sheet）'],
    ['  每一列代表一天的行程，同一分段的列填相同的「分段名稱」。'],
    ['  類型欄填入：觀光 / 交通 / 健行 / 潛水 / 休息（其他值會視為觀光）'],
    ['  緯度／經度可留空，匯入後在 app 內用地點搜尋補充。'],
    [''],
    ['■ 花費（第三個 sheet）'],
    ['  分段名稱需和日程 sheet 的分段名稱一致，才能正確歸類。'],
    ['  類別可自由填寫，例：交通、住宿、餐飲、門票、購物、其他。'],
    [''],
    ['■ 注意事項'],
    ['  - 匯入時每筆行程皆會新增為「規劃中」狀態，不會覆蓋既有資料。'],
    ['  - Todo 和 Packing list 欄位請匯入後在 app 內補充。'],
    ['  - 日期格式請使用 YYYY-MM-DD（例：2026-07-01）。'],
  ].forEach(r => helpWs.addRow(r));

  [infoWs, dayWs, expWs, helpWs].forEach(ws => {
    ws.getRow(1).font = { bold: true };
  });

  const buf = await wb.xlsx.writeBuffer();
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
    download: 'trips-template.xlsx',
  });
  a.click(); URL.revokeObjectURL(a.href);
}

// ── Excel Import ───────────────────────────────────────────────────────────────
function xlsxDateToString(val) {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  const d = new Date(s);
  return isNaN(d) ? s.slice(0, 10) : d.toISOString().slice(0, 10);
}

async function importExcel(file) {
  if (!window.ExcelJS) { showToast('ExcelJS 載入中，請稍後再試', 'warn'); return; }
  try {
    const buf = await file.arrayBuffer();
    const wb  = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const infoWs = wb.getWorksheet('行程資訊');
    const dayWs  = wb.getWorksheet('日程');
    const expWs  = wb.getWorksheet('花費');

    if (!dayWs) { showToast('找不到「日程」sheet，請使用官方範本', 'error'); return; }

    const TYPE_MAP = { '觀光': 'sightseeing', '交通': 'transport', '健行': 'trekking', '潛水': 'diving', '休息': 'rest' };

    let tripTitle = '未命名行程', tripStart = '', tripEnd = '', tripBudget = null, tripCurrency = 'TWD', tripNotes = '';
    if (infoWs) {
      const r = infoWs.getRow(2).values;
      tripTitle    = String(r[1] || '未命名行程');
      tripStart    = xlsxDateToString(r[2]);
      tripEnd      = xlsxDateToString(r[3]);
      tripBudget   = r[4] ? parseFloat(r[4]) : null;
      tripCurrency = String(r[5] || 'TWD');
      tripNotes    = String(r[6] || '');
    }

    const segMap = new Map();
    dayWs.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return;
      const vals = row.values;
      const segName  = String(vals[1] || '主要行程');
      const segStart = xlsxDateToString(vals[2]) || tripStart;
      const segEnd   = xlsxDateToString(vals[3]) || tripEnd;
      const date     = xlsxDateToString(vals[4]);
      const type     = TYPE_MAP[String(vals[5] || '')] || 'sightseeing';
      const title    = String(vals[6] || '');
      const note     = String(vals[7] || '');
      const lat      = vals[8] != null ? parseFloat(vals[8]) : null;
      const lng      = vals[9] != null ? parseFloat(vals[9]) : null;
      if (!date || !title) return;

      if (!segMap.has(segName)) {
        segMap.set(segName, { id: generateId(), name: segName, color: '#2C6E8A', start_date: segStart, end_date: segEnd, daily: [] });
      }
      segMap.get(segName).daily.push({ date, type, title, note, lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng });
    });

    const segNameToId = new Map([...segMap.entries()].map(([k, v]) => [k, v.id]));
    const expenses = [];
    if (expWs) {
      expWs.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum === 1) return;
        const vals = row.values;
        const date     = xlsxDateToString(vals[1]);
        const segName  = String(vals[2] || '');
        const category = String(vals[3] || '其他');
        const amount   = parseFloat(vals[4]);
        const currency = String(vals[5] || tripCurrency);
        const note     = String(vals[6] || '');
        if (!date || isNaN(amount)) return;
        expenses.push({ id: generateId(), date, segment_id: segNameToId.get(segName) || null, category, amount, currency, note });
      });
    }

    const trip = {
      id: generateId(), title: tripTitle, status: 'planning',
      start_date: tripStart, end_date: tripEnd,
      budget_total: tripBudget, base_currency: tripCurrency, notes: tripNotes,
      segments: [...segMap.values()], expenses, todo: [], packing: [],
    };

    const { user, trips: existing } = getState();
    const merged = {
      ...existing,
      current_trips: [...(existing.current_trips || []), trip],
    };
    if (user) await api.saveTrips(user.id, merged);
    setState({ trips: merged, activeTripId: trip.id });
    saveCache(merged, getState().preferences);
    showToast(`Excel 匯入成功：${trip.title}`, 'success');
    ui.renderTripSelector(merged, trip.id);
    renderActiveTrip();
  } catch (err) { showToast(`Excel 匯入失敗：${err.message}`, 'error'); }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function bindAuthEvents() {
  const emailForm = q(SEL.authEmailForm);
  const otpForm   = q(SEL.authOtpForm);

  emailForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    ui.clearAuthError();
    const email = q(SEL.authEmailInput)?.value.trim();
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
    const token = q(SEL.authOtpInput)?.value.trim();
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

// ── Trip Modal ────────────────────────────────────────────────────────────────
function openTripModal(trip) {
  ui.renderTripModal(trip);
  const tripId = trip?.id || null;

  const overlay = q(SEL.tripModal);
  let _tripDownOnOverlay = false;
  overlay.onpointerdown = e => { _tripDownOnOverlay = e.target === overlay; };
  overlay.onclick = e => { if (e.target === overlay && _tripDownOnOverlay) closeTripModal(); };
  q(SEL.tripModalClose).onclick = closeTripModal;
  q(SEL.tmCancel).onclick = closeTripModal;
  q(SEL.tmSave).onclick = () => saveTripFromModal(tripId);

  const delBtn = q(SEL.tmDelete);
  if (delBtn) delBtn.onclick = () => {
    openConfirm({
      title: '刪除行程',
      message: `確定要刪除「${trip?.title || '這個行程'}」？此動作無法復原。`,
      okLabel: '刪除行程',
      onConfirm: () => { closeTripModal(); handleDeleteTrip(tripId); },
    });
  };
}

function closeTripModal() {
  q(SEL.tripModal)?.classList.remove('open');
}

async function saveTripFromModal(existingId) {
  const saveBtn = q(SEL.tmSave);
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '儲存中...'; }
  try {
    const title    = q(SEL.tmTitle)?.value.trim();
    const start    = q(SEL.tmStart)?.value;
    const end      = q(SEL.tmEnd)?.value;
    const status   = q(SEL.tmStatus)?.value || 'planning';
    const budget   = parseFloat(q(SEL.tmBudget)?.value) || 0;
    const currency = (q(SEL.tmCurrency)?.value.trim() || 'TWD').toUpperCase();
    const notes    = q(SEL.tmNotes)?.value.trim() || '';

    if (!title)         { showToast('請填寫行程名稱', 'warn'); return; }
    if (!start || !end) { showToast('請填寫起訖日期', 'warn'); return; }
    if (start > end)    { showToast('開始日期不能晚於結束日期', 'warn'); return; }

    const { trips } = getState();
    const allTrips  = [...(trips.current_trips || []), ...(trips.past_trips || [])];
    const existing  = allTrips.find(t => t.id === existingId);

    const updated = {
      ...(existing || {}),
      id:            existingId || generateId(),
      title, start_date: start, end_date: end, status,
      budget_total: budget, base_currency: currency, notes,
      segments: existing?.segments || [],
      todo:     existing?.todo     || [],
      packing:  existing?.packing  || [],
      expenses: existing?.expenses || [],
    };

    const ok = await persistTrip(updated);
    if (!ok) return;

    closeTripModal();
    if (!existingId) setState({ activeTripId: updated.id });
    ui.renderTripSelector(getState().trips, getState().activeTripId);
    renderActiveTrip();
    showToast(existingId ? '行程已更新' : '行程已新增', 'success');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '儲存'; }
  }
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

// ── Segment Modal ─────────────────────────────────────────────────────────────
function openSegModal(seg, tripId) {
  const { trips } = getState();
  const allTrips = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  const trip     = allTrips.find(t => t.id === tripId);
  ui.renderSegModal(seg, trip?.start_date || '', trip?.end_date || '');
  const segId = seg?.id || null;

  const overlay = q(SEL.segModal);
  let _segDownOnOverlay = false;
  overlay.onpointerdown = e => { _segDownOnOverlay = e.target === overlay; };
  overlay.onclick = e => { if (e.target === overlay && _segDownOnOverlay) closeSegModal(); };
  q(SEL.segModalClose).onclick = closeSegModal;
  q(SEL.smCancel).onclick = closeSegModal;
  q(SEL.smSave).onclick = () => saveSegFromModal(segId, tripId);

  q(SEL.smColors).onclick = e => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    document.querySelectorAll(`#${SEL.smColors} .color-swatch`).forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
  };

  const delBtn = q(SEL.smDelete);
  if (delBtn) delBtn.onclick = () => {
    openConfirm({
      title: '刪除分段',
      message: '確定要刪除此分段？其中的每日行程也會一併移除。',
      okLabel: '刪除分段',
      onConfirm: () => { closeSegModal(); handleDeleteSeg(segId, tripId); },
    });
  };
}

function closeSegModal() {
  q(SEL.segModal)?.classList.remove('open');
}

async function saveSegFromModal(existingId, tripId) {
  const saveBtn = q(SEL.smSave);
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '儲存中...'; }
  try {
    const name  = q(SEL.smName)?.value.trim();
    const start = q(SEL.smStart)?.value;
    const end   = q(SEL.smEnd)?.value;
    const color = document.querySelector(`#${SEL.smColors} .color-swatch.selected`)?.dataset.color || '#0EA5E9';

    if (!name)          { showToast('請填寫分段名稱', 'warn'); return; }
    if (!start || !end) { showToast('請填寫起訖日期', 'warn'); return; }
    if (start > end)    { showToast('開始日期不能晚於結束日期', 'warn'); return; }

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
      id: existingId || generateId(),
      name, start_date: start, end_date: end, color,
      daily: idx !== -1 ? segments[idx].daily : [],
    };

    if (idx !== -1) segments[idx] = segData;
    else segments.push(segData);

    trip.segments = segments;
    const ok = await persistTrip(trip);
    if (!ok) return;

    closeSegModal();
    renderActiveTrip();
    showToast(existingId ? '分段已更新' : '分段已新增', 'success');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '儲存'; }
  }
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

// ── Day Modal ─────────────────────────────────────────────────────────────────
function openDayModal(day, segId, tripId, dayIndex = -1) {
  const { trips } = getState();
  const trip = [...(trips.current_trips || []), ...(trips.past_trips || [])].find(t => t.id === tripId);
  const seg  = trip?.segments?.find(s => s.id === segId);
  ui.renderDayModal(day, seg?.start_date || '', seg?.end_date || '');

  const overlay = q(SEL.dayModal);
  let _dayDownOnOverlay = false;
  overlay.onpointerdown = e => { _dayDownOnOverlay = e.target === overlay; };
  overlay.onclick = e => { if (e.target === overlay && _dayDownOnOverlay) closeDayModal(); };
  q(SEL.dayModalClose).onclick = closeDayModal;
  q(SEL.dmCancel).onclick = closeDayModal;
  q(SEL.dmSave).onclick = () => saveDayFromModal(dayIndex, segId, tripId);

  const delBtn = q(SEL.dmDelete);
  if (delBtn) delBtn.onclick = () => {
    openConfirm({
      title: '刪除日程',
      message: '確定要刪除此日程？',
      okLabel: '刪除',
      onConfirm: () => { closeDayModal(); handleDeleteDay(dayIndex, segId, tripId); },
    });
  };

  // Nominatim 地點搜尋
  const placeSearch  = q(SEL.dmPlaceSearch);
  const placeResults = q(SEL.dmPlaceResults);
  let placeTimer = null;
  if (placeSearch && placeResults) {
    placeSearch.addEventListener('input', () => {
      clearTimeout(placeTimer);
      const qs = placeSearch.value.trim();
      if (qs.length < 2) { placeResults.style.display = 'none'; return; }
      placeTimer = setTimeout(async () => {
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(qs)}&format=json&limit=5&accept-language=zh-TW,en`);
          const data = await res.json();
          if (!data.length) { placeResults.style.display = 'none'; return; }
          placeResults.innerHTML = data.map(item => {
            const label = item.display_name.split(',').slice(0, 3).join(', ');
            return `<li data-lat="${item.lat}" data-lng="${item.lon}" data-full="${esc(item.display_name)}">${esc(label)}</li>`;
          }).join('');
          placeResults.style.display = 'block';
        } catch { placeResults.style.display = 'none'; }
      }, 400);
    });
    placeSearch.addEventListener('blur', () => {
      setTimeout(() => { placeResults.style.display = 'none'; }, 200);
    });
    placeResults.addEventListener('click', e => {
      const li = e.target.closest('li');
      if (!li) return;
      q(SEL.dmLat).value = parseFloat(li.dataset.lat).toFixed(6);
      q(SEL.dmLng).value = parseFloat(li.dataset.lng).toFixed(6);
      const titleInput = q(SEL.dmTitle);
      if (titleInput && !titleInput.value.trim()) {
        titleInput.value = li.dataset.full.split(',')[0].trim();
      }
      placeSearch.value = li.textContent;
      placeResults.style.display = 'none';
    });
  }
}

function closeDayModal() {
  q(SEL.dayModal)?.classList.remove('open');
}

async function saveDayFromModal(existingIndex, segId, tripId) {
  const saveBtn = q(SEL.dmSave);
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '儲存中...'; }
  try {
    const date   = q(SEL.dmDate)?.value;
    const type   = q(SEL.dmType)?.value || 'sightseeing';
    const title  = q(SEL.dmTitle)?.value.trim();
    const note   = q(SEL.dmNote)?.value.trim();
    const latRaw = q(SEL.dmLat)?.value;
    const lngRaw = q(SEL.dmLng)?.value;
    const lat = latRaw !== '' && latRaw != null ? parseFloat(latRaw) : null;
    const lng = lngRaw !== '' && lngRaw != null ? parseFloat(lngRaw) : null;

    if (!date)  { showToast('請填寫日期', 'warn'); return; }
    if (!title) { showToast('請填寫標題', 'warn'); return; }

    let transport = null;
    if (type === 'transport') {
      transport = {
        mode:           q(SEL.dmTMode)?.value || 'other',
        from:           q(SEL.dmTFrom)?.value.trim() || '',
        to:             q(SEL.dmTTo)?.value.trim() || '',
        carrier:        q(SEL.dmTCarrier)?.value.trim() || '',
        duration_hours: parseFloat(q(SEL.dmTDuration)?.value) || null,
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
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '儲存'; }
  }
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
