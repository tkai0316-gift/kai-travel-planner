import { getState, setState, validateTripsJson, saveCache, loadCache } from './store.js';
import * as api from './api.js';
import * as mapMgr from './mapManager.js';
import * as ui from './uiRenderer.js';
import { showToast } from './utils.js';

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

  if (!user) {
    ui.showAuthOverlay();
    bindAuthEvents();
    return;
  }

  ui.hideAuthOverlay();
  await loadData();
  initMap();
  bindAppEvents();
}

async function loadData() {
  const { user, isOnline } = getState();
  if (!user) return;

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
}

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
      await api.saveTrips(user.id, data);
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
      await api.savePreferences(user.id, data);
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
      const urlEl = document.getElementById('share-url');
      if (resultEl) resultEl.style.display = 'block';
      if (urlEl) urlEl.textContent = url;
      const copyBtn = document.getElementById('copy-share-btn');
      if (copyBtn) copyBtn.onclick = () => navigator.clipboard.writeText(url).then(() => showToast('已複製', 'success'));
    } catch (err) { showToast(`分享失敗：${err.message}`, 'error'); }
    finally { shareBtn.disabled = false; shareBtn.textContent = '建立唯讀分享連結（TTL 30天）'; }
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
  const otpForm = document.getElementById('auth-otp-form');

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
