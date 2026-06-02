const CACHE_KEY = 'kai_travel_v1';
const VALID_TYPES = new Set(['sightseeing', 'transport', 'trekking', 'diving', 'rest']);
const VALID_MODES = new Set(['flight', 'overnight_train', 'bus', 'ferry', 'car', 'other']);

const state = {
  user: null,
  trips: { current_trips: [], past_trips: [], trip_ideas: [] },
  preferences: {},
  isOnline: navigator.onLine,
  activeTab: 'trips',
  activeTripId: null,
  highlightedDate: null,
};

export function getState() { return state; }
export function setState(patch) { Object.assign(state, patch); }

export function validateTripsJson(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: '格式錯誤：非物件' };
  if (!Array.isArray(data.current_trips)) return { ok: false, error: '缺少 current_trips 陣列' };
  if (!Array.isArray(data.past_trips)) return { ok: false, error: '缺少 past_trips 陣列' };
  const allTrips = [...data.current_trips, ...data.past_trips];
  for (const trip of allTrips) {
    if (!trip.id || !trip.title) return { ok: false, error: '行程缺少 id 或 title' };
    if (!Array.isArray(trip.segments)) return { ok: false, error: `行程「${trip.title}」缺少 segments` };
    for (const seg of trip.segments) {
      if (!Array.isArray(seg.daily)) return { ok: false, error: `分段「${seg.name || seg.id}」缺少 daily` };
      for (const day of seg.daily) {
        if (!VALID_TYPES.has(day.type)) return { ok: false, error: `type 無效：${day.type}` };
        if (day.lat != null && (typeof day.lat !== 'number' || day.lat < -90 || day.lat > 90))
          return { ok: false, error: `lat 超出範圍：${day.lat}` };
        if (day.lng != null && (typeof day.lng !== 'number' || day.lng < -180 || day.lng > 180))
          return { ok: false, error: `lng 超出範圍：${day.lng}` };
        if (day.transport && !VALID_MODES.has(day.transport.mode))
          return { ok: false, error: `transport.mode 無效：${day.transport.mode}` };
      }
    }
  }
  return { ok: true };
}

export function saveCache(trips, prefs) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), trips, prefs }));
  } catch (e) { console.warn('cache write failed', e); }
}

export function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearCache() {
  localStorage.removeItem(CACHE_KEY);
}
