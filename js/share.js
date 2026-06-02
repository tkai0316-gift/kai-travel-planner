import * as api from './api.js';
import * as mapMgr from './mapManager.js';
import * as ui from './uiRenderer.js';

async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const loadingEl = document.getElementById('share-loading');
  const appEl = document.getElementById('app');

  if (!id) {
    if (loadingEl) loadingEl.textContent = '無效的分享連結';
    return;
  }

  try {
    const data = await api.fetchShare(id);
    if (loadingEl) loadingEl.style.display = 'none';
    if (appEl) appEl.classList.add('ready');

    const trip = data.trip_data || null;
    const prefs = data.pref_data || {};

    if (trip) {
      const trips = { current_trips: [trip], past_trips: [], trip_ideas: [] };
      ui.renderTripSelector(trips, trip.id);
      ui.renderTimeline(trip);
      ui.renderBudget(trip);
    } else {
      ui.renderTimeline(null);
    }
    ui.renderPrefs(prefs);

    mapMgr.init('map');
    if (trip) mapMgr.renderTrip(trip);

    // Bind day click for map fly-to (read-only)
    window.addEventListener('kai-travel:day-click', (e) => {
      const { lat, lng } = e.detail;
      if (lat != null && lng != null) mapMgr.flyToDay(lat, lng);
    });

    // Tab switching
    ['trips', 'budget', 'prefs'].forEach(tab => {
      const btn = document.getElementById(`tab-${tab}`);
      if (btn) btn.addEventListener('click', () => ui.setActiveTab(tab));
    });

    ui.setActiveTab('trips');
    ui.setOnlineState(navigator.onLine);
  } catch (err) {
    if (loadingEl) loadingEl.textContent = err.message || '分享連結已失效';
  }
}

init().catch(console.error);
