/**
 * kai-travel-planner 完整功能測試（含假資料注入）
 * node test-full.mjs
 */
import { chromium } from '/Users/mac/.nvm/versions/node/v24.15.0/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'fs';
import { CSEL } from './js/selectors.js';

const BASE   = 'http://localhost:4321/?dev=1';
const SS_DIR = './test-screenshots';
mkdirSync(SS_DIR, { recursive: true });

let pass = 0, fail = 0;
const results = [];

function log(name, ok, detail = '') {
  const line = `${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  results.push({ name, ok, detail });
  ok ? pass++ : fail++;
}
async function ss(page, name) {
  await page.screenshot({ path: `${SS_DIR}/${name}.png` });
}

// ─── 今天 / 昨天 / 明天 ───────────────────────────────
const today     = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const tomorrow  = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const inFuture  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const farFuture = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);

// ─── 假資料（完整行程物件）────────────────────────────
const MOCK_TRIPS = {
  current_trips: [
    {
      id: 'trip_ongoing',
      title: '🇯🇵 東京大阪之旅',
      status: 'ongoing',
      start_date: yesterday,
      end_date: tomorrow,
      currency: 'JPY',
      budget: 150000,
      notes: '記得帶雨傘！',
      packing: [
        { id: 'p1', text: '護照',  category: '證件', done: true  },
        { id: 'p2', text: '充電器', category: '電子', done: false },
        { id: 'p3', text: '雨傘',  category: '衣物', done: false },
      ],
      todo: [
        { id: 't1', text: '訂新幹線票', done: false },
        { id: 't2', text: '換日幣',     done: true  },
      ],
      segments: [
        {
          id: 'seg_tokyo',
          name: '東京',
          color: '#0EA5E9',
          start_date: yesterday,
          end_date: today,
          daily: [
            {
              id: 'd1', date: yesterday,
              title: '抵達東京 · Check-in', type: 'transport',
              note: '成田第二航站 → 淺草飯店', lat: 35.6762, lng: 139.6503,
              transport: { mode: 'flight', from: '台北', to: '東京', duration_hours: 3 },
            },
            {
              id: 'd2', date: today,
              title: '淺草寺 · 仲見世通', type: 'sightseeing',
              note: '早上去避人潮', lat: 35.7147, lng: 139.7967,
            },
            {
              id: 'd3', date: today,
              title: '東京晴空塔', type: 'sightseeing',
              note: '350F 展望台票 ¥2100', lat: 35.7101, lng: 139.8107,
            },
          ],
        },
        {
          id: 'seg_osaka',
          name: '大阪',
          color: '#F97316',
          start_date: tomorrow,
          end_date: tomorrow,
          daily: [
            {
              id: 'd4', date: tomorrow,
              title: '搭新幹線至大阪', type: 'transport',
              transport: { mode: 'overnight_train', from: '東京', to: '大阪', duration_hours: 2.5 },
            },
          ],
        },
      ],
      expenses: [
        { id: 'e1', segment_id: 'seg_tokyo', date: yesterday, label: '機票（來回）', amount: 25000, category: 'transport' },
        { id: 'e2', segment_id: 'seg_tokyo', date: today,     label: '淺草周邊午餐', amount:  3500, category: 'food'      },
        { id: 'e3', segment_id: 'seg_tokyo', date: today,     label: '晴空塔門票',   amount:  2100, category: 'activity'  },
        { id: 'e4', segment_id: 'seg_osaka', date: tomorrow,  label: '新幹線（指定席）', amount: 13870, category: 'transport' },
      ],
      trip_ideas: [{ id: 'i1', title: '北海道滑雪', notes: '2027 冬天' }],
    },
    {
      id: 'trip_future',
      title: '🇮🇹 義大利蜜月',
      status: 'planning',
      start_date: inFuture,
      end_date: farFuture,
      currency: 'EUR',
      budget: 300000,
      notes: '',
      packing: [],
      todo: [],
      segments: [
        {
          id: 'seg_rome',
          name: '羅馬',
          color: '#8B5CF6',
          start_date: inFuture,
          end_date: farFuture,
          daily: [
            { id: 'd5', date: inFuture, title: '競技場 Colosseum', type: 'sightseeing', lat: 41.8902, lng: 12.4922 },
          ],
        },
      ],
      expenses: [],
      trip_ideas: [],
    },
  ],
  past_trips: [],
  trip_ideas:  [{ id: 'g1', title: '冰島極光' }],
};

// Supabase REST 回傳格式（maybeSingle → 陣列取第一筆）
const MOCK_TRIPS_ROW    = [{ data: MOCK_TRIPS,  updated_at: new Date().toISOString() }];
const MOCK_PREFS_ROW    = [{ data: {},           updated_at: new Date().toISOString() }];

// ─── 攔截所有 Supabase 請求 ────────────────────────────
async function setupRoutes(page) {
  await page.route('**/rest/v1/user_trips**', async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json',
        headers: { 'Content-Range': '0-0/1' },
        body: JSON.stringify(MOCK_TRIPS_ROW) });
    } else {
      // PATCH / POST (save) → 假裝成功
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_TRIPS_ROW) });
    }
  });
  await page.route('**/rest/v1/user_preferences**', async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_PREFS_ROW) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_PREFS_ROW) });
    }
  });
  // auth.getUser() → null（觸發 dev bypass）
  await page.route('**/auth/v1/user**', async route => {
    await route.fulfill({ status: 401, contentType: 'application/json',
      body: JSON.stringify({ message: 'not authenticated' }) });
  });
}

const browser = await chromium.launch({ headless: false, slowMo: 150 });

// ══════════════════════════════════════════════════════
// A. 桌機 (1440×900)
// ══════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗');
console.log('║  🖥️  桌機版測試  (1440×900)              ║');
console.log('╚══════════════════════════════════════════╝\n');

const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const d = await dCtx.newPage();
await setupRoutes(d);

// localStorage 清空，避免舊快取干擾
await d.addInitScript(() => localStorage.clear());

await d.goto(BASE);

// 1. 啟動
try {
  await d.waitForSelector('#app.ready', { timeout: 10000 });
  log('桌機：app.ready 啟動', true);
} catch(e) { log('桌機：app.ready 啟動', false, e.message); }

// 2. 行程資料正確渲染（有行程標題）
try {
  await d.waitForFunction(() => {
    const el = document.querySelector('.trip-title');
    return el && el.textContent.includes('東京');
  }, { timeout: 6000 });
  log('桌機：行程資料注入成功（東京大阪之旅）', true);
  await ss(d, '01-desktop-with-data');
} catch(e) { log('桌機：行程資料注入成功', false, e.message); }

// 3. 今日快覽卡（旅途中）
try {
  const summaryVisible = await d.locator('.today-summary').isVisible({ timeout: 3000 });
  log('今日快覽卡出現（旅途中）', summaryVisible);
  if (summaryVisible) {
    const title = await d.locator('.today-summary-title').textContent();
    log('今日快覽：標題「今日行程」', title.trim() === '今日行程', `"${title.trim()}"`);
    const items = await d.locator('.today-summary-item').count();
    log(`今日快覽：今天有 ${items} 個行程`, items > 0, `${items} 項`);
    await ss(d, '02-today-summary');
  }
} catch(e) { log('今日快覽卡', false, e.message); }

// 4. 今日 badge（.is-today）
try {
  const todayCard = await d.locator('.day-card.is-today').first();
  const visible   = await todayCard.isVisible({ timeout: 3000 });
  log('今日 Day card（橘色 is-today）', visible);
  const badge = await d.locator('.today-badge').first().isVisible();
  log('今日 badge「今」出現', badge);
  await ss(d, '03-today-badge');
} catch(e) { log('今日 badge', false, e.message); }

// 5. 進度 chip（旅途中 · 第 N / M 天）
try {
  const chip = await d.locator('.trip-stat-chip.accent').first().textContent();
  const isProgress = chip.includes('旅途中') || chip.includes('第');
  log('進度 chip：旅途中 · 第 N / M 天', isProgress, `"${chip.trim()}"`);
} catch(e) { log('進度 chip', false, e.message); }

// 6. 分段顏色（東京 / 大阪）
try {
  const segs = await d.locator('.seg-header').count();
  log(`分段渲染（${segs} 個分段）`, segs === 2, `找到 ${segs} 個`);
  await ss(d, '04-segments');
} catch(e) { log('分段渲染', false, e.message); }

// 7. 分段收合
try {
  const firstHeader = d.locator('.seg-header').first();
  await firstHeader.click();
  await d.waitForTimeout(400);
  const body = d.locator('.seg-block').first().locator('.seg-body');
  const hidden = await body.evaluate(el => el.style.display === 'none');
  log('分段收合：點擊 header 後 body 隱藏', hidden);
  await ss(d, '05-collapsed-seg');

  // 再點一次展開
  await firstHeader.click();
  await d.waitForTimeout(400);
  const shown = await body.evaluate(el => el.style.display !== 'none');
  log('分段展開：再點一次 body 顯示', shown);
} catch(e) { log('分段收合/展開', false, e.message); }

// 8. 分段收合記憶（切換 tab 回來維持）
try {
  const firstHeader = d.locator('.seg-header').first();
  await firstHeader.click();
  await d.waitForTimeout(300);
  await d.locator(CSEL.tabBudget).click();
  await d.waitForTimeout(300);
  await d.locator(CSEL.tabTrips).click();
  await d.waitForTimeout(400);
  const body   = d.locator('.seg-block').first().locator('.seg-body');
  const hidden = await body.evaluate(el => el.style.display === 'none');
  log('分段收合記憶：切換 tab 後維持收合', hidden);
  // 還原展開
  await firstHeader.click();
} catch(e) { log('分段收合記憶', false, e.message); }

// 9. 地圖標記
try {
  // MapLibre WebGL 需較長載入時間
  await d.waitForFunction(
    () => document.querySelectorAll('.maplibregl-marker').length > 0,
    { timeout: 8000 }
  );
  const markers = await d.locator('.maplibregl-marker').count();
  log(`地圖標記渲染（${markers} 個）`, markers > 0, `${markers} 個`);
  await ss(d, '06-map-markers');
} catch(e) {
  const markers = await d.locator('.maplibregl-marker').count();
  log(`地圖標記渲染（${markers} 個）`, markers > 0, `timeout—可能 WebGL headless 限制，markers=${markers}`);
  await ss(d, '06-map-markers');
}

// 10. 地圖 popup（點擊標記）
try {
  const markerCount = await d.locator('.maplibregl-marker').count();
  if (markerCount > 0) {
    await d.locator('.maplibregl-marker').first().click();
    await d.waitForTimeout(800);
    const popup = await d.locator('.maplibregl-popup').isVisible();
    log('地圖 popup 開啟', popup);
    if (popup) await ss(d, '07-map-popup');
    await d.locator(CSEL.map).click({ position: { x: 800, y: 700 } });
  } else {
    log('地圖 popup 開啟', false, '無標記可點擊（WebGL headless 限制）');
  }
} catch(e) { log('地圖 popup', false, e.message); }

// 11. Budget tab 費用分段小計
try {
  await d.locator(CSEL.tabBudget).click();
  await d.waitForTimeout(500);
  const groups = await d.locator('.expense-seg-group').count();
  log(`費用分段小計（${groups} 個分組）`, groups >= 2, `${groups} 組`);
  const subtotals = await d.locator('.expense-seg-subtotal').count();
  log('費用分組小計金額顯示', subtotals >= 2, `${subtotals} 個`);
  await ss(d, '08-budget-seg-groups');
} catch(e) { log('費用分段小計', false, e.message); }

// 12. Budget 總計金額
try {
  const amount = await d.locator('.budget-amount').first().textContent();
  log('Budget 總計金額顯示', amount.length > 0, `"${amount.trim()}"`);
} catch(e) { log('Budget 總計金額', false, e.message); }

// 13. 新增花費（Day Modal 開啟）
try {
  await d.locator(CSEL.tabTrips).click();
  await d.waitForTimeout(300);
  // 點第一個 Day card 的編輯
  const dayCard = d.locator('.day-card').first();
  await dayCard.click();
  await d.waitForTimeout(400);
  await ss(d, '09-day-selected');
  log('Day card 可點選（地圖聯動）', true);
} catch(e) { log('Day card 點選', false, e.message); }

// 14. Trip 編輯 modal
try {
  const editBtn = d.locator(CSEL.tripEditBtn);
  await editBtn.click();
  await d.waitForSelector('#trip-modal.open', { timeout: 3000 });
  log('Trip 編輯 modal 開啟', true);
  const titleVal = await d.locator(CSEL.tmTitle).inputValue();
  log('Trip modal 預填行程名稱', titleVal.includes('東京') || titleVal.includes('大阪'), `"${titleVal}"`);
  const notesVal = await d.locator(CSEL.tmNotes).inputValue();
  log('Trip modal 預填備註', notesVal === '記得帶雨傘！', `"${notesVal}"`);
  await ss(d, '10-trip-edit-modal');
  await d.keyboard.press('Escape');
  await d.waitForTimeout(300);
} catch(e) { log('Trip 編輯 modal', false, e.message); }

// 15. 新增分段 modal
try {
  await d.locator(CSEL.addSegBtn).click();
  await d.waitForSelector('#seg-modal.open', { timeout: 3000 });
  log('新增分段 modal 開啟', true);
  await ss(d, '11-seg-modal');
  await d.keyboard.press('Escape');
  await d.waitForTimeout(300);
} catch(e) { log('新增分段 modal', false, e.message); }

// 16. 新增日程 modal + Nominatim 搜尋欄位
try {
  const addDayBtn = d.locator('.add-day-btn').first();
  await addDayBtn.click();
  await d.waitForSelector('#day-modal.open', { timeout: 3000 });
  log('新增日程 modal 開啟', true);
  const placeSearch = await d.locator(CSEL.dmPlaceSearch).isVisible();
  log('Nominatim 地點搜尋欄位顯示', placeSearch);
  await ss(d, '12-day-modal-nominatim');
} catch(e) { log('新增日程 modal / 地點搜尋', false, e.message); }

// 17. Nominatim 搜尋功能（真實呼叫 OSM）
try {
  await d.locator(CSEL.dmPlaceSearch).fill('淺草寺');
  await d.waitForTimeout(600);
  // 等下拉出現（需 400ms debounce + 網路）
  try {
    await d.waitForSelector(CSEL.dmPlaceResultsLi, { timeout: 5000 });
    const items = await d.locator(CSEL.dmPlaceResultsLi).count();
    log('Nominatim 搜尋結果顯示', items > 0, `${items} 筆`);

    // 點第一筆 → 自動填座標
    await d.locator(CSEL.dmPlaceResultsLi).first().click();
    await d.waitForTimeout(300);
    const lat = await d.locator(CSEL.dmLat).inputValue();
    const lng = await d.locator(CSEL.dmLng).inputValue();
    log('Nominatim 點選後自動填緯度', lat.length > 0, `lat=${lat}`);
    log('Nominatim 點選後自動填經度', lng.length > 0, `lng=${lng}`);
    await ss(d, '13-nominatim-filled');
  } catch {
    log('Nominatim 搜尋結果顯示', false, '可能是網路問題');
    log('Nominatim 點選後自動填緯度', false, '跳過');
    log('Nominatim 點選後自動填經度', false, '跳過');
  }
} catch(e) { log('Nominatim 搜尋', false, e.message); }

// 18. Day modal 存檔 loading 狀態
try {
  await d.locator(CSEL.dmTitle).fill('測試日程');
  await d.locator(CSEL.dmDate).fill(today);
  await d.locator(CSEL.dmType).selectOption('sightseeing');
  const saveBtn = d.locator(CSEL.dmSave);
  const clickPromise = saveBtn.click();
  // 立刻抓按鈕文字
  await d.waitForTimeout(50);
  const loadingText = await saveBtn.textContent();
  await clickPromise;
  await d.waitForTimeout(800);
  log('存檔 loading 狀態（儲存中...）', loadingText.includes('儲存中') || loadingText.includes('儲存'), `"${loadingText}"`);
  await ss(d, '14-save-loading');
} catch(e) { log('存檔 loading 狀態', false, e.message); }

// 關閉 modal
await d.keyboard.press('Escape').catch(() => {});
await d.waitForTimeout(300);

// 19. 刪除日程：透過 day-edit-btn 開 modal 再點刪除
try {
  const editBtn = d.locator('.day-edit-btn').first();
  await editBtn.click();
  await d.waitForSelector('#day-modal.open', { timeout: 3000 });
  const delBtn = d.locator(CSEL.dmDelete);
  const delVisible = await delBtn.isVisible();
  if (delVisible) {
    await delBtn.click();
    await d.waitForSelector(CSEL.confirmModal + '.open', { timeout: 3000 });
    log('刪除日程：自訂確認 modal 開啟', true);
    await ss(d, '15-confirm-modal');
    await d.locator(CSEL.confirmCancel).click();
    await d.waitForTimeout(300);
    const closed = await d.locator(CSEL.confirmModal + '.open').count() === 0;
    log('確認 modal：取消後關閉', closed);
    await d.keyboard.press('Escape');
    await d.waitForTimeout(300);
  } else {
    log('刪除日程：自訂確認 modal 開啟', false, '#dm-delete 不可見');
    log('確認 modal：取消後關閉', false, '跳過');
    await d.keyboard.press('Escape');
  }
} catch(e) {
  log('刪除日程：自訂確認 modal', false, e.message);
  log('確認 modal 取消', false, '跳過');
  await d.keyboard.press('Escape').catch(() => {});
}

// 20. 確認 modal ESC 關閉
try {
  const editBtn = d.locator('.day-edit-btn').first();
  await editBtn.click();
  await d.waitForSelector('#day-modal.open', { timeout: 3000 });
  const delBtn = d.locator(CSEL.dmDelete);
  if (await delBtn.isVisible()) {
    await delBtn.click();
    await d.waitForSelector(CSEL.confirmModal + '.open', { timeout: 3000 });
    await d.keyboard.press('Escape');
    await d.waitForTimeout(300);
    const closed = await d.locator(CSEL.confirmModal + '.open').count() === 0;
    log('確認 modal ESC 關閉', closed);
  } else {
    log('確認 modal ESC 關閉', false, '跳過');
  }
  await d.keyboard.press('Escape').catch(() => {});
  await d.waitForTimeout(300);
} catch(e) { log('確認 modal ESC 關閉', false, e.message); }

// 21. 打包清單渲染
try {
  // 捲動到打包清單
  await d.locator('.checklist-header').first().scrollIntoViewIfNeeded();
  const packingHeader = await d.locator('.checklist-header').first().isVisible();
  log('打包清單 header 可見', packingHeader);
  const packingCount = await d.locator('#' + 'packing-body' + ' .checklist-item').count();
  log(`打包清單項目（${packingCount} 項）`, packingCount === 3, `${packingCount} 項`);
  await ss(d, '16-packing-list');
} catch(e) { log('打包清單', false, e.message); }

// 22. 打包清單勾選
try {
  const unchecked = d.locator('.checklist-item:not(.done)').first();
  await unchecked.click();
  await d.waitForTimeout(400);
  const doneItems = await d.locator('.checklist-item.done').count();
  log('打包清單勾選', doneItems >= 2, `done=${doneItems}`);
} catch(e) { log('打包清單勾選', false, e.message); }

// 23. 待辦清單
try {
  const todoHeaders = await d.locator('.checklist-header').count();
  log('待辦/打包 section 渲染', todoHeaders >= 1, `${todoHeaders} 個 section`);
} catch(e) { log('待辦清單渲染', false, e.message); }

// 24. 偏好 tab
try {
  await d.locator(CSEL.tabPrefs).click();
  await d.waitForTimeout(500);
  const prefsEl = await d.locator(CSEL.prefsContent).isVisible();
  log('偏好 tab 渲染', prefsEl);
  await ss(d, '17-prefs-tab');
} catch(e) { log('偏好 tab', false, e.message); }

// 25. 資料 tab
try {
  await d.locator(CSEL.tabData).click();
  await d.waitForTimeout(500);
  const exportJson  = await d.locator(CSEL.exportJsonBtn).isVisible();
  const exportExcel = await d.locator(CSEL.exportExcelBtn).isVisible();
  const shareBtn    = await d.locator(CSEL.shareBtn).isVisible();
  log('資料 tab：匯出 JSON', exportJson);
  log('資料 tab：匯出 Excel', exportExcel);
  log('資料 tab：分享按鈕', shareBtn);
  await ss(d, '18-data-tab');
} catch(e) { log('資料 tab', false, e.message); }

// 26. JSON 匯出下載
try {
  const [download] = await Promise.all([
    d.waitForEvent('download', { timeout: 4000 }),
    d.locator(CSEL.exportJsonBtn).click(),
  ]);
  const fname = download.suggestedFilename();
  log('JSON 匯出下載觸發', fname.endsWith('.json'), `檔名=${fname}`);
} catch(e) { log('JSON 匯出下載', false, e.message); }

// 27. 行程切換（切到第二筆義大利）
try {
  await d.locator(CSEL.tabTrips).click();
  await d.waitForTimeout(300);
  await d.locator('#trip-selector-btn').click();
  await d.waitForTimeout(400);
  const listItems = await d.locator('#trip-selector-list li').count();
  log(`行程 selector 顯示 ${listItems} 筆`, listItems === 2, `${listItems} 筆`);
  // 點第二筆
  await d.locator('#trip-selector-list li').nth(1).click();
  await d.waitForTimeout(600);
  const newTitle = await d.locator('.trip-title').textContent();
  log('切換行程至義大利蜜月', newTitle.includes('義大利'), `"${newTitle.trim()}"`);
  await ss(d, '19-switch-trip');
} catch(e) { log('行程切換', false, e.message); }

// 28. 深色模式
try {
  await d.emulateMedia({ colorScheme: 'dark' });
  await d.waitForTimeout(500);
  const bg = await d.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim()
  );
  log('深色模式：--c-bg token', bg === '#0F172A', `值=${bg}`);
  const panelBg = await d.locator('#left-panel').evaluate(el =>
    window.getComputedStyle(el).backgroundColor
  );
  log('深色模式：面板實際顏色', panelBg.includes('15, 23, 42'), `bg=${panelBg}`);
  await ss(d, '20-dark-mode-desktop');
  await d.emulateMedia({ colorScheme: 'light' });
} catch(e) { log('深色模式（桌機）', false, e.message); }

// 29. 漢堡按鈕桌機隱藏
try {
  const display = await d.locator(CSEL.panelToggle).evaluate(el =>
    window.getComputedStyle(el).display
  );
  log('桌機：漢堡按鈕隱藏', display === 'none', `display=${display}`);
} catch(e) { log('桌機：漢堡按鈕隱藏', false, e.message); }

// 30. 壓力：快速切換行程 + tab
try {
  for (let i = 0; i < 8; i++) {
    await d.locator('#trip-selector-btn').click();
    await d.waitForTimeout(100);
    const items = await d.locator('#trip-selector-list li').all();
    if (items.length) await items[i % items.length].click();
    await d.waitForTimeout(100);
    await d.locator(CSEL.tabBudget).click();
    await d.locator(CSEL.tabTrips).click();
  }
  const appOk = await d.locator('#app.ready').count() > 0;
  log('壓力：快速切換行程 + tab 不崩潰', appOk);
} catch(e) { log('壓力：快速切換行程', false, e.message); }

await dCtx.close();

// ══════════════════════════════════════════════════════
// B. 手機 (390×844, iPhone)
// ══════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗');
console.log('║  📱  手機版測試  (390×844)                ║');
console.log('╚══════════════════════════════════════════╝\n');

const mCtx = await browser.newContext({
  viewport:  { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
});
const m = await mCtx.newPage();
await setupRoutes(m);
await m.addInitScript(() => localStorage.clear());
await m.goto(BASE);

try {
  await m.waitForSelector('#app.ready', { timeout: 10000 });
  log('手機：app.ready 啟動', true);
} catch(e) { log('手機：app.ready 啟動', false, e.message); }

// 31. 漢堡按鈕可見
try {
  const display = await m.locator(CSEL.panelToggle).evaluate(el =>
    window.getComputedStyle(el).display
  );
  log('手機：漢堡按鈕顯示', display === 'flex', `display=${display}`);
  await ss(m, '21-mobile-map');
} catch(e) { log('手機：漢堡按鈕顯示', false, e.message); }

// 32. 開啟面板 + 行程資料渲染
try {
  await m.locator(CSEL.panelToggle).tap();
  await m.waitForTimeout(500);
  const panelOpen = await m.locator('#left-panel.panel-open').count() > 0;
  log('手機：開啟面板', panelOpen);

  // 等資料渲染
  await m.waitForFunction(() => {
    const el = document.querySelector('.trip-title');
    return el && el.textContent.includes('東京');
  }, { timeout: 6000 });
  log('手機：行程資料渲染', true);
  await ss(m, '22-mobile-panel-data');
} catch(e) { log('手機：面板 + 資料渲染', false, e.message); }

// 33. 今日快覽（手機）
try {
  const summaryVis = await m.locator('.today-summary').isVisible({ timeout: 3000 });
  log('手機：今日快覽卡顯示', summaryVis);
  await ss(m, '23-mobile-today-summary');
} catch(e) { log('手機：今日快覽卡', false, e.message); }

// 34. day-title 字體 15px（手機）
try {
  const fontSize = await m.locator('.day-title').first().evaluate(el =>
    window.getComputedStyle(el).fontSize
  );
  log('手機：day-title 字體 15px', fontSize === '15px', `fontSize=${fontSize}`);
} catch(e) { log('手機：day-title 字體', false, e.message); }

// 35. Day card padding 加高（手機）
try {
  const paddingTop = await m.locator('.day-card').first().evaluate(el =>
    window.getComputedStyle(el).paddingTop
  );
  log('手機：day-card padding-top ≥ 11px', parseInt(paddingTop) >= 11, `paddingTop=${paddingTop}`);
} catch(e) { log('手機：day-card padding', false, e.message); }

// 36. 手機收起面板
try {
  await m.locator(CSEL.panelToggle).tap();
  await m.waitForTimeout(500);
  const closed = await m.locator('#left-panel.panel-open').count() === 0;
  log('手機：收起面板', closed);
  await ss(m, '24-mobile-panel-closed');
} catch(e) { log('手機：收起面板', false, e.message); }

// 37. 手機深色模式
try {
  await m.locator(CSEL.panelToggle).tap();
  await m.waitForTimeout(400);
  await m.emulateMedia({ colorScheme: 'dark' });
  await m.waitForTimeout(400);
  const bg = await m.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim()
  );
  log('手機：深色模式 token', bg === '#0F172A', `值=${bg}`);
  const panelBg = await m.locator('#left-panel').evaluate(el =>
    window.getComputedStyle(el).backgroundColor
  );
  log('手機：深色模式面板顏色', panelBg.includes('15, 23, 42'), `bg=${panelBg}`);
  await ss(m, '25-mobile-dark');
  await m.emulateMedia({ colorScheme: 'light' });
} catch(e) { log('手機：深色模式', false, e.message); }

// 38. 手機 Tab 切換
try {
  for (const [id, name] of [['tab-budget','預算'],['tab-prefs','偏好'],['tab-data','資料'],['tab-trips','行程']]) {
    await m.locator(`#${id}`).tap();
    await m.waitForTimeout(300);
    const active = await m.locator(`#${id}.active`).count() > 0;
    log(`手機 Tab：${name}`, active);
  }
  await ss(m, '26-mobile-tabs');
} catch(e) { log('手機 Tab 切換', false, e.message); }

// 39. 手機 modal 開啟（Trip）
try {
  await m.locator(CSEL.tabTrips).tap();
  await m.waitForTimeout(300);
  await m.locator('#add-trip-btn').tap();
  await m.waitForSelector('#trip-modal.open', { timeout: 3000 });
  log('手機：Trip modal 開啟', true);
  await ss(m, '27-mobile-trip-modal');
  await m.keyboard.press('Escape');
  await m.waitForTimeout(300);
} catch(e) { log('手機：Trip modal', false, e.message); }

// 40. 手機 Budget tab + 費用分組
try {
  await m.locator(CSEL.tabBudget).tap();
  await m.waitForTimeout(500);
  const groups = await m.locator('.expense-seg-group').count();
  log(`手機：費用分段分組（${groups} 組）`, groups >= 2, `${groups} 組`);
  await ss(m, '28-mobile-budget');
} catch(e) { log('手機：費用分段分組', false, e.message); }

// 41. 手機行程切換
try {
  await m.locator(CSEL.tabTrips).tap();
  await m.waitForTimeout(300);
  await m.locator('#trip-selector-btn').tap();
  await m.waitForTimeout(400);
  const items = await m.locator('#trip-selector-list li').count();
  log(`手機：selector 顯示 ${items} 筆`, items === 2, `${items} 筆`);
  await m.locator('#trip-selector-list li').nth(1).tap();
  await m.waitForTimeout(500);
  const title = await m.locator('.trip-title').textContent();
  log('手機：切換至義大利蜜月', title.includes('義大利'), `"${title.trim()}"`);
  await ss(m, '29-mobile-switch-trip');
  // 切回東京
  await m.locator('#trip-selector-btn').tap();
  await m.waitForTimeout(300);
  await m.locator('#trip-selector-list li').first().tap();
} catch(e) { log('手機：行程切換', false, e.message); }

// 42. 壓力：手機快速開關 modal + tab 切換
try {
  await m.locator(CSEL.tabTrips).tap();
  await m.waitForTimeout(200);
  for (let i = 0; i < 6; i++) {
    await m.locator('#add-trip-btn').tap();
    await m.waitForTimeout(150);
    await m.keyboard.press('Escape');
    await m.waitForTimeout(150);
    await m.locator(CSEL.tabBudget).tap();
    await m.waitForTimeout(100);
    await m.locator(CSEL.tabTrips).tap();
    await m.waitForTimeout(100);
  }
  const ok = await m.locator('#app.ready').count() > 0;
  log('壓力：手機快速操作不崩潰', ok);
  await ss(m, '30-stress-done');
} catch(e) { log('壓力：手機快速操作', false, e.message); }

await mCtx.close();
await browser.close();

// ══════════════════════════════════════════════════════
// 結果
// ══════════════════════════════════════════════════════
const failed = results.filter(r => !r.ok);
console.log('\n╔══════════════════════════════════════════╗');
console.log(`║  結果：${String(pass).padStart(2)} ✅   ${String(fail).padStart(2)} ❌   共 ${pass+fail} 項`.padEnd(43) + '║');
console.log('╚══════════════════════════════════════════╝\n');
if (failed.length) {
  console.log('❌ 失敗項目：');
  failed.forEach(r => console.log(`   • ${r.name}${r.detail ? '（' + r.detail + '）' : ''}`));
}
console.log(`\n截圖存於：${SS_DIR}/`);
writeFileSync(`${SS_DIR}/report.json`, JSON.stringify({ pass, fail, results }, null, 2));
