import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://cbdqlyprejzvndvesfpa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YVutBvxGMw_PC37YURYsKA_AXn32IKZ';
const WORKER_URL = 'https://kai-travel-share.t-kai90316.workers.dev';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function getUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

// 個人系統（比照 kai-trip / kai-admin）：GitHub 登入且為擁有者才放行；DB 端 user_trips / user_preferences RLS 同樣只限擁有者
const OWNER_UID = '1b65fb0d-ab62-46fc-ba96-c0405f5480c5';

export async function getOwnerUser() {
  const user = await getUser();
  if (!user) return { user: null, rejected: false };
  if (user.app_metadata?.provider !== 'github' || user.id !== OWNER_UID) {
    await sb.auth.signOut();
    return { user: null, rejected: true };
  }
  return { user, rejected: false };
}

export async function signInWithGitHub() {
  return sb.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: location.origin + location.pathname },
  });
}

export async function signOut() {
  return sb.auth.signOut();
}

export async function fetchTrips(userId) {
  const { data, error } = await sb
    .from('user_trips')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}

export async function saveTrips(userId, tripsData) {
  const { error } = await sb
    .from('user_trips')
    .upsert({ user_id: userId, data: tripsData, updated_at: new Date().toISOString() },
             { onConflict: 'user_id' });
  if (error) throw error;
}

export async function fetchPreferences(userId) {
  const { data, error } = await sb
    .from('user_preferences')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}

export async function savePreferences(userId, prefData) {
  const { error } = await sb
    .from('user_preferences')
    .upsert({ user_id: userId, data: prefData, updated_at: new Date().toISOString() },
             { onConflict: 'user_id' });
  if (error) throw error;
}

// 快照分享只帶地圖/時間軸需要的欄位（與 RPC get_planner_map 白名單一致）；
// 不帶花費、預算、待辦、打包清單、偏好設定——快照 JSON 對拿到連結的人是完整可讀的
function pickShareFields(trip) {
  return {
    id: trip.id, title: trip.title, start_date: trip.start_date, end_date: trip.end_date,
    segments: (trip.segments || []).map(s => ({
      id: s.id, name: s.name, color: s.color, start_date: s.start_date, end_date: s.end_date,
      daily: (s.daily || []).map(d => ({
        date: d.date, type: d.type, title: d.title, note: d.note, lat: d.lat, lng: d.lng, transport: d.transport,
      })),
    })),
  };
}

export async function createShare(tripData) {
  const res = await fetch(`${WORKER_URL}/api/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trip_data: pickShareFields(tripData), pref_data: {} }),
  });
  if (!res.ok) throw new Error('分享建立失敗');
  return res.json();
}

export async function fetchShare(shareId) {
  const res = await fetch(`${WORKER_URL}/api/share/${shareId}`);
  if (!res.ok) throw new Error('分享連結已失效或不存在');
  return res.json();
}

// planner 行程編輯時選「對應 kai-trip 行程」用（trips 為 Tier A，僅擁有者讀得到）
export async function fetchKaiTrips() {
  const { data, error } = await sb.from('trips').select('id, title, depart_date').order('depart_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

// kai-trip 分享頁的即時地圖：以 kai-trip 行程的 share_uuid 查，未開放時回 null
export async function fetchLinkedMap(tripShareUuid) {
  const { data, error } = await sb.rpc('get_planner_map', { p_uuid: tripShareUuid });
  if (error) throw new Error('地圖載入失敗');
  if (!data) throw new Error('此行程地圖尚未開放分享');
  return data;
}

export async function deleteShare(shareId) {
  const res = await fetch(`${WORKER_URL}/api/share/${shareId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error('撤銷失敗');
}

const WMO_ICON = {
  0: '☀️', 1: '🌤', 2: '⛅', 3: '☁️',
  45: '🌫', 48: '🌫',
  51: '🌦', 53: '🌦', 55: '🌦',
  61: '🌧', 63: '🌧', 65: '🌧',
  71: '🌨', 73: '🌨', 75: '🌨',
  80: '🌦', 81: '🌧', 82: '🌧',
  95: '⛈', 96: '⛈', 99: '⛈',
};

export async function fetchExchangeRates(base = 'TWD') {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.result === 'success' ? json.rates : null;
  } catch { return null; }
}

export async function fetchWeather(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const { daily } = await res.json();
  const result = {};
  daily.time.forEach((date, i) => {
    result[date] = {
      icon:   WMO_ICON[daily.weather_code[i]] ?? '🌡',
      max:    Math.round(daily.temperature_2m_max[i]),
      min:    Math.round(daily.temperature_2m_min[i]),
      precip: daily.precipitation_probability_max[i] ?? null,
    };
  });
  return result;
}
