export const TYPE_LABELS = {
  sightseeing: '觀光', transport: '交通', trekking: '健行', diving: '潛水', rest: '休息',
};

const svgIcon = (path, size = 20) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

export const TYPE_ICONS = {
  sightseeing: svgIcon('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  transport:   svgIcon('<path d="M3.5 8.5 5 4h14l1.5 4.5M3.5 8.5h17M3.5 8.5 2 17h20L18.5 8.5M7 17v3m10-3v3M9 13h6"/>'),
  trekking:    svgIcon('<path d="m3 17 3-9 3 5 3-8 3 7 3-4 3 9"/><path d="M3 20h18"/>'),
  diving:      svgIcon('<path d="M2 12c2-4 5-4 8 0s6 4 8 0M2 17c2-4 5-4 8 0s6 4 8 0"/><circle cx="12" cy="6" r="2"/>'),
  rest:        svgIcon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
};

export const TRANSPORT_ICONS = {
  flight:         svgIcon('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 4c-1 0-1.5.5-3.5 2.5L9 8 2.8 6.2c-.5-.1-.9.4-.8.9l6.4 6.3c.1.1.1.3 0 .4L5.6 17c-.2.2-.1.5.1.6l3.7.4.4 3.7c.1.2.4.3.6.1l3.8-2.8c.1-.1.3-.1.4 0z"/>'),
  overnight_train:svgIcon('<rect x="4" y="3" width="16" height="12" rx="2"/><path d="M4 11h16M8 15v4m8-4v4M9 19h6"/><circle cx="9" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  bus:            svgIcon('<path d="M8 6v4M16 6v4M4 6h16M4 10h16"/><rect x="2" y="3" width="20" height="16" rx="2"/><path d="M4 19v1a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1M16 19v1a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1"/>'),
  ferry:          svgIcon('<path d="M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0M12 4v10M12 4l-3 3M12 4l3 3M5 14l7-4 7 4"/>'),
  car:            svgIcon('<path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2m-8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>'),
  other:          svgIcon('<circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>'),
};

export const ICON_CHECK    = svgIcon('<polyline points="20 6 9 17 4 12"/>', 10);
export const ICON_GLOBE    = svgIcon('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', 16);
export const ICON_MAP_PIN  = svgIcon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', 40);
export const ICON_MENU     = svgIcon('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>', 22);

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

export function openConfirm({ title = '確認', message, okLabel = '確認刪除', danger = true, onConfirm }) {
  const modal = document.getElementById('confirm-modal');
  if (!modal) { if (window.confirm(message)) onConfirm(); return; }
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  const okBtn = document.getElementById('confirm-ok');
  okBtn.textContent = okLabel;
  okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  modal.classList.add('open');
  function close() { modal.classList.remove('open'); }
  function handleOk()     { close(); onConfirm(); cleanup(); }
  function handleCancel() { close(); cleanup(); }
  function cleanup() {
    okBtn.removeEventListener('click', handleOk);
    document.getElementById('confirm-cancel').removeEventListener('click', handleCancel);
  }
  okBtn.addEventListener('click', handleOk);
  document.getElementById('confirm-cancel').addEventListener('click', handleCancel);
}

export function showToast(msg, type = 'info') {
  const colors = { info: '#334155', success: '#059669', error: '#dc2626', warn: '#d97706' };
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;padding:8px 16px;border-radius:8px;color:white;font-size:13px;background:${colors[type]||colors.info};box-shadow:0 4px 12px rgba(0,0,0,.15);transition:opacity .3s;white-space:nowrap;font-family:inherit;`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
}
