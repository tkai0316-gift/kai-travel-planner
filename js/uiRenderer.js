import { esc, TYPE_ICONS, TRANSPORT_ICONS, formatDate, formatDateShort, formatCurrency } from './utils.js';

const STATUS_LABELS = { planning: '規劃中', ongoing: '進行中', completed: '已完成' };
const STATUS_COLORS = { planning: 'color:#1d4ed8;background:#dbeafe', ongoing: 'color:#166534;background:#dcfce7', completed: 'color:#475569;background:#f1f5f9' };

export function setOnlineState(isOnline) {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = isOnline ? 'none' : 'block';
  const dot = document.getElementById('online-dot');
  if (dot) dot.style.background = isOnline ? '#34d399' : '#fbbf24';
  document.querySelectorAll('[data-edit]').forEach(el => {
    el.disabled = !isOnline;
    el.style.opacity = isOnline ? '' : '0.4';
    el.style.pointerEvents = isOnline ? '' : 'none';
  });
}

export function setActiveTab(tab) {
  ['trips', 'budget', 'prefs', 'data'].forEach(t => {
    const panel = document.getElementById(`panel-${t}`);
    const btn = document.getElementById(`tab-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      btn.style.borderBottom = t === tab ? '2px solid #0ea5e9' : '2px solid transparent';
      btn.style.color = t === tab ? '#0284c7' : '#64748b';
    }
  });
}

export function renderTripSelector(trips, activeTripId) {
  const sel = document.getElementById('trip-selector');
  if (!sel) return;
  const all = [...(trips.current_trips || []), ...(trips.past_trips || [])];
  if (all.length === 0) { sel.innerHTML = '<option value="">（尚無行程）</option>'; return; }
  sel.innerHTML = all.map(t =>
    `<option value="${esc(t.id)}"${t.id === activeTripId ? ' selected' : ''}>${esc(t.title)}</option>`
  ).join('');
}

export function renderTimeline(trip) {
  const el = document.getElementById('timeline-content');
  if (!el) return;
  if (!trip) {
    el.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">尚無行程資料<br><small>前往「資料」匯入 JSON</small></div>';
    return;
  }

  const statusStyle = STATUS_COLORS[trip.status] || STATUS_COLORS.planning;
  el.innerHTML = `
    <div style="padding:12px 16px 8px;border-bottom:1px solid #f1f5f9">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:600;color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(trip.title)}</span>
        <span style="font-size:11px;padding:2px 8px;border-radius:20px;${statusStyle}">${STATUS_LABELS[trip.status] || ''}</span>
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px">${esc(formatDateShort(trip.start_date))} – ${esc(formatDateShort(trip.end_date))}</div>
    </div>
    <div id="segments-container">${(trip.segments || []).map(seg => renderSegment(seg)).join('')}</div>
  `;

  el.querySelectorAll('.seg-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const body = hdr.nextElementSibling;
      if (!body) return;
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      hdr.querySelector('.seg-arrow').textContent = hidden ? '▼' : '▶';
    });
  });

  el.querySelectorAll('[data-day]').forEach(card => {
    card.addEventListener('click', () => {
      el.querySelectorAll('[data-day]').forEach(c => c.style.outline = '');
      card.style.outline = '2px solid #38bdf8';
      const { day, lat, lng, segId } = card.dataset;
      window.dispatchEvent(new CustomEvent('kai-travel:day-click', {
        detail: { date: day, lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null, segId },
      }));
    });
  });
}

function renderSegment(seg) {
  const color = seg.color || '#64748b';
  const days = seg.daily || [];
  return `
    <div style="margin-bottom:4px">
      <div class="seg-header" style="display:flex;align-items:center;gap:8px;padding:8px 16px;cursor:pointer;border-left:3px solid ${esc(color)};background:#fafafa">
        <span class="seg-arrow" style="font-size:10px;color:#94a3b8">▼</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(seg.name)}</div>
          <div style="font-size:10px;color:#94a3b8">${esc(formatDateShort(seg.start_date))} – ${esc(formatDateShort(seg.end_date))} · ${days.length} 天</div>
        </div>
        <div style="width:10px;height:10px;border-radius:50%;background:${esc(color)};flex-shrink:0"></div>
      </div>
      <div class="seg-body">
        ${days.map(day => renderDayCard(day, seg.id)).join('')}
      </div>
    </div>
  `;
}

function renderDayCard(day, segId) {
  const isTransport = day.type === 'transport';
  const hasLoc = day.lat != null && day.lng != null;
  const t = day.transport;
  const transportInfo = t
    ? `<div style="font-size:11px;color:#64748b;margin-top:3px">${TRANSPORT_ICONS[t.mode] || ''} ${esc(t.from || '')} → ${esc(t.to || '')}${t.duration_hours ? ` · ${t.duration_hours}h` : ''}</div>`
    : '';
  const bg = isTransport ? '#f8fafc' : 'white';

  return `
    <div data-day="${esc(day.date)}" data-lat="${day.lat ?? ''}" data-lng="${day.lng ?? ''}" data-seg-id="${esc(segId)}"
         style="display:flex;gap:10px;padding:8px 16px;cursor:pointer;background:${bg};border-bottom:1px solid #f1f5f9">
      <span style="font-size:16px;flex-shrink:0;margin-top:1px">${TYPE_ICONS[day.type] || '📍'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">${esc(formatDate(day.date))}</div>
        <div style="font-size:13px;color:#1e293b;font-weight:500;line-height:1.3">${esc(day.title || '')}</div>
        ${transportInfo}
        ${day.note ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(day.note)}</div>` : ''}
      </div>
      ${hasLoc ? '<div style="width:6px;height:6px;border-radius:50%;background:#38bdf8;flex-shrink:0;margin-top:6px" title="已標記座標"></div>' : ''}
    </div>
  `;
}

export function renderBudget(trip) {
  const el = document.getElementById('budget-content');
  if (!el) return;
  if (!trip) { el.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">請先選擇行程</div>'; return; }

  const expenses = trip.expenses || [];
  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const budget = trip.budget_total || 0;
  const currency = trip.base_currency || 'TWD';
  const pct = budget ? Math.min(100, Math.round(total / budget * 100)) : 0;
  const byCategory = {};
  expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + (e.amount || 0); });

  el.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:16px">
      <div style="background:#f8fafc;border-radius:12px;padding:16px">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">預算使用</div>
        <div style="display:flex;align-items:baseline;gap:8px">
          <span style="font-size:22px;font-weight:700;color:#1e293b">${esc(formatCurrency(total, currency))}</span>
          ${budget ? `<span style="font-size:13px;color:#94a3b8">/ ${esc(formatCurrency(budget, currency))}</span>` : ''}
        </div>
        ${budget ? `
          <div style="margin-top:8px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden">
            <div style="height:100%;background:#0ea5e9;border-radius:3px;width:${pct}%;transition:width .4s"></div>
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px">${pct}% 已使用</div>
        ` : ''}
      </div>
      ${Object.keys(byCategory).length ? '<div><canvas id="budget-chart" height="200"></canvas></div>' : ''}
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">明細</div>
          <button id="add-expense-btn" data-edit style="font-size:11px;color:#0284c7;background:none;border:none;cursor:pointer">+ 新增</button>
        </div>
        ${expenses.length === 0
          ? '<div style="text-align:center;color:#94a3b8;font-size:13px;padding:16px 0">尚無花費記錄</div>'
          : expenses.map(e => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9">
              <span style="font-size:11px;color:#94a3b8;width:52px;flex-shrink:0">${esc(e.date?.slice(5) || '')}</span>
              <span style="font-size:12px;color:#475569;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.note || e.category)}</span>
              <span style="font-size:12px;font-weight:600;color:#1e293b">${esc(formatCurrency(e.amount, e.currency || currency))}</span>
            </div>`).join('')
        }
      </div>
    </div>
  `;

  if (Object.keys(byCategory).length && window.Chart) {
    setTimeout(() => {
      const ctx = document.getElementById('budget-chart');
      if (!ctx) return;
      if (ctx._ci) ctx._ci.destroy();
      ctx._ci = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: Object.keys(byCategory),
          datasets: [{ data: Object.values(byCategory), backgroundColor: ['#f59e0b','#3b82f6','#22c55e','#a855f7','#ef4444','#0ea5e9','#f97316','#64748b'] }],
        },
        options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } },
      });
    }, 50);
  }
}

export function renderPrefs(prefs) {
  const el = document.getElementById('prefs-content');
  if (!el) return;
  if (!prefs || !Object.keys(prefs).length) {
    el.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">尚無偏好設定<br><small>前往「資料」匯入 preferences.json</small></div>';
    return;
  }
  const bl = prefs.bucket_list || [];
  const row = (label, val) => val ? `<div style="display:flex;gap:8px;font-size:12px;padding:3px 0"><span style="color:#94a3b8;width:72px;flex-shrink:0">${esc(label)}</span><span style="color:#334155">${esc(Array.isArray(val) ? val.join(', ') : val)}</span></div>` : '';
  el.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:16px">
      <div style="background:#f8fafc;border-radius:12px;padding:16px">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">基本資料</div>
        ${row('旅行風格', prefs.travel_style)}
        ${row('預算層級', prefs.budget_level)}
        ${row('旅行節奏', prefs.pace_preference)}
        ${row('同伴', prefs.travel_companions)}
        ${row('語言', prefs.language_skills)}
        ${row('興趣', prefs.interests)}
      </div>
      <div>
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Bucket List (${bl.length})</div>
        ${bl.map(b => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9">
            <span>🌍</span>
            <span style="font-size:13px;color:#334155">${esc(b.destination)}</span>
            ${b.notes ? `<span style="font-size:11px;color:#94a3b8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.notes)}</span>` : ''}
          </div>`).join('')}
      </div>
    </div>
  `;
}

export function renderDataPanel() {
  const el = document.getElementById('data-content');
  if (!el) return;
  el.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:20px">
      <div>
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">匯入資料</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label>
            <div style="font-size:12px;color:#475569;margin-bottom:4px">trips.json</div>
            <input type="file" id="import-trips-file" accept=".json" data-edit style="font-size:11px;color:#64748b">
          </label>
          <label>
            <div style="font-size:12px;color:#475569;margin-bottom:4px">preferences.json</div>
            <input type="file" id="import-prefs-file" accept=".json" data-edit style="font-size:11px;color:#64748b">
          </label>
        </div>
      </div>
      <div>
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">匯出資料</div>
        <div style="display:flex;gap:8px">
          <button id="export-json-btn" style="flex:1;padding:8px;font-size:12px;background:#f1f5f9;border:none;border-radius:8px;cursor:pointer;color:#334155">下載 JSON</button>
          <button id="export-excel-btn" style="flex:1;padding:8px;font-size:12px;background:#ecfdf5;border:none;border-radius:8px;cursor:pointer;color:#166534">匯出 Excel</button>
        </div>
      </div>
      <div>
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">分享（唯讀）</div>
        <button id="share-btn" data-edit style="width:100%;padding:8px;font-size:12px;background:#f0f9ff;border:none;border-radius:8px;cursor:pointer;color:#0284c7">建立唯讀分享連結（TTL 30天）</button>
        <div id="share-result" style="display:none;margin-top:8px">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">分享連結：</div>
          <div id="share-url" style="font-size:11px;font-family:monospace;background:#f1f5f9;padding:8px;border-radius:6px;word-break:break-all"></div>
          <button id="copy-share-btn" style="margin-top:4px;font-size:11px;color:#0284c7;background:none;border:none;cursor:pointer">複製連結</button>
        </div>
      </div>
    </div>
  `;
}

export function showAuthOverlay() {
  const el = document.getElementById('auth-overlay');
  if (el) el.style.display = 'flex';
  const app = document.getElementById('app');
  if (app) app.style.display = 'none';
}

export function hideAuthOverlay() {
  const el = document.getElementById('auth-overlay');
  if (el) el.style.display = 'none';
  const app = document.getElementById('app');
  if (app) app.classList.add('ready');
}

export function showOtpStep(email) {
  const emailForm = document.getElementById('auth-email-form');
  const otpForm = document.getElementById('auth-otp-form');
  const emailDisplay = document.getElementById('auth-email-display');
  if (emailForm) emailForm.style.display = 'none';
  if (otpForm) otpForm.style.display = 'block';
  if (emailDisplay) emailDisplay.textContent = email;
}

export function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

export function clearAuthError() {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

export function scrollTimelineToDate(date) {
  const card = document.querySelector(`[data-day="${date}"]`);
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
