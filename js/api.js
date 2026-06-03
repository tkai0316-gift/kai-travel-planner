import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://cbdqlyprejzvndvesfpa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YVutBvxGMw_PC37YURYsKA_AXn32IKZ';
const WORKER_URL = 'https://kai-travel-share.t-kai90316.workers.dev';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function getUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

export async function signInWithOtp(email) {
  return sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
}

export async function verifyOtp(email, token) {
  return sb.auth.verifyOtp({ email, token, type: 'email' });
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

export async function createShare(tripData, prefData) {
  const res = await fetch(`${WORKER_URL}/api/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trip_data: tripData, pref_data: prefData }),
  });
  if (!res.ok) throw new Error('分享建立失敗');
  return res.json();
}

export async function fetchShare(shareId) {
  const res = await fetch(`${WORKER_URL}/api/share/${shareId}`);
  if (!res.ok) throw new Error('分享連結已失效或不存在');
  return res.json();
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
    const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.rates ?? null;
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
