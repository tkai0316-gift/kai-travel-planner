export const TYPE_LABELS = {
  sightseeing: '觀光', transport: '交通', trekking: '健行', diving: '潛水', rest: '休息',
};
export const TYPE_ICONS = {
  sightseeing: '🏛️', transport: '✈️', trekking: '🥾', diving: '🤿', rest: '🏨',
};
export const TRANSPORT_ICONS = {
  flight: '✈️', overnight_train: '🚂', bus: '🚌', ferry: '⛴️', car: '🚗', other: '🚀',
};

export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function safeUrl(url) {
  if (!url) return '#';
  try {
    const u = new URL(url);
    if (u.protocol === 'javascript:') return '#';
    return url;
  } catch { return '#'; }
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}

export function formatCurrency(amount, currency = 'TWD') {
  if (amount == null) return '';
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function showToast(msg, type = 'info') {
  const colors = { info: '#334155', success: '#059669', error: '#dc2626', warn: '#d97706' };
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;padding:8px 16px;border-radius:8px;color:white;font-size:13px;background:${colors[type]||colors.info};box-shadow:0 4px 12px rgba(0,0,0,.15);transition:opacity .3s;white-space:nowrap;`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
}
