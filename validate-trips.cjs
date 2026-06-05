#!/usr/bin/env node
// 用法：node validate-trips.js <your-file.json>

const fs = require('fs');

const VALID_TYPES = new Set(['sightseeing', 'transport', 'trekking', 'diving', 'rest']);
const VALID_MODES = new Set(['flight', 'overnight_train', 'bus', 'ferry', 'car', 'other']);

function validate(data) {
  if (!data || typeof data !== 'object') return fail('格式錯誤：非物件');
  if (!Array.isArray(data.current_trips)) return fail('缺少 current_trips 陣列');
  if (!Array.isArray(data.past_trips))    return fail('缺少 past_trips 陣列');

  for (const trip of [...data.current_trips, ...data.past_trips]) {
    if (!trip.id || !trip.title) return fail('行程缺少 id 或 title');
    if (!Array.isArray(trip.segments)) return fail(`行程「${trip.title}」缺少 segments`);

    for (const seg of trip.segments) {
      if (!Array.isArray(seg.daily)) return fail(`分段「${seg.name || seg.id}」缺少 daily`);

      for (const day of seg.daily) {
        if (!VALID_TYPES.has(day.type))
          return fail(`type 無效：${day.type}（可用：${[...VALID_TYPES].join(' / ')}）`);
        if (day.lat != null && (typeof day.lat !== 'number' || day.lat < -90 || day.lat > 90))
          return fail(`lat 超出範圍：${day.lat}`);
        if (day.lng != null && (typeof day.lng !== 'number' || day.lng < -180 || day.lng > 180))
          return fail(`lng 超出範圍：${day.lng}`);
        if (day.transport && !VALID_MODES.has(day.transport.mode))
          return fail(`transport.mode 無效：${day.transport.mode}（可用：${[...VALID_MODES].join(' / ')}）`);
      }
    }
  }
  return { ok: true };
}

function fail(error) { return { ok: false, error }; }

const file = process.argv[2];
if (!file) {
  console.error('用法：node validate-trips.js <your-file.json>');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`❌ JSON 解析失敗：${e.message}`);
  process.exit(1);
}

const result = validate(data);
if (result.ok) {
  const ct = data.current_trips?.length ?? 0;
  const pt = data.past_trips?.length ?? 0;
  console.log(`✅ 驗證通過（current: ${ct} 筆，past: ${pt} 筆）`);
} else {
  console.error(`❌ ${result.error}`);
  process.exit(1);
}
