# kai-travel-planner

## 專案概述
個人旅遊規劃 Web App — 雙欄佈局（左側 Timeline + 右側 MapLibre 地圖）

## 技術棧
- Frontend: Vanilla JS (ES6 Modules) + MapLibre GL JS (CDN) + Chart.js (CDN) + ExcelJS (CDN)
- Backend: Cloudflare Pages（前端靜態） + Cloudflare Worker（分享快照 API）+ Supabase（Auth + DB）
- 資料庫: `user_trips` / `user_preferences`（jsonb，同 cbdqlyprejzvndvesfpa project）

## 關鍵檔案
- `js/app.js` — 主入口（Auth + 資料載入 + 事件綁定）
- `js/share.js` — 分享頁入口（唯讀，無 Auth）
- `js/uiRenderer.js` — 所有 DOM 渲染（Timeline / Budget / Prefs / Data panel）
- `js/mapManager.js` — MapLibre 初始化、Marker、GeoJSON 路線
- `js/api.js` — Supabase CRUD + 分享 API 呼叫
- `js/store.js` — 狀態管理 + schema 驗證 + localStorage 快取
- `worker/worker.js` — CF Worker：分享快照 KV 存取 + Rate Limit

## Supabase
- Project: cbdqlyprejzvndvesfpa
- Auth: Email OTP，`shouldCreateUser: false`（封閉制）
- Anon key: `sb_publishable_YVutBvxGMw_PC37YURYsKA_AXn32IKZ`（sb_publishable_ 開頭，可 hardcode）

## Worker 部署（分離，非 Pages Function）
1. `cd worker && npx wrangler kv namespace create KAI_TRAVEL_SHARE` → 取得 KV ID
2. 填入 `wrangler.toml` 的 `id` 欄位
3. `npx wrangler secret put ALLOWED_ORIGIN`（設為 Pages URL）
4. `npx wrangler deploy`

## 重要設計決策
- XSS 防護：所有 DOM 寫入統一透過 `esc()` 或 `textContent`，集中在 `utils.js`
- 離線模式：監聽 `navigator.onLine`；離線時鎖定所有 `[data-edit]` 元素
- 地圖樣式：OpenFreeMap liberty style（免 API Key）
- 分享 TTL：30 天（KV expirationTtl）
- icons/icon-192.png 與 icons/icon-512.png 需手動建立（PWA 安裝圖示）
