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
