'use strict';
/* 三大流星群のページ（calendar/perseids・geminids・quadrantids）の「年ごとの条件」を計算する。tools/calendar-pages.js から呼ばれ、
 * tests/meteor-year.test.js が値を確かめる。極大の日時と見ごろの時刻は国立天文台の発表（tools/official-events.js）をそのまま使い、
 * 月齢・月の出入り・月の高さは tsuki/moonrise.js（国立天文台「各地のこよみ」と 1 分以内: tests/moonrise.test.js）、
 * 太陽と放射点の高さは astro.js / tools/events.js で求める。場所は東京、時刻は日本時間。
 * - 暗い時間: 太陽の高さが DARK_SUN° より低い時間（天文薄明が終わってから始まるまで）
 * - 月明かりのない暗い時間: 暗い時間のうち、月（大気差を入れた中心）が地平線の下にある時間 */
const A = require('../astro.js');
const R = require('../tsuki/moonrise.js');
const E = require('./events.js');

const DEG = A.DEG, MIN = 60000, HOUR = 3600000, DAY = 86400000, JST = 9 * HOUR;
const TOKYO = E.TOKYO;
const DARK_SUN = -18, STEP = 5 * MIN;

const jst = ms => { const t = new Date(ms + JST); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes() }; };
const moonAlt = ms => (R.moonTopo(ms, TOKYO.lat, TOKYO.lon).alt + R.REFRACTION) / DEG;
function radiantAltAz(radiant, ms) {
  const [ra, dec] = A.precessor(ms)(radiant[0] * DEG, radiant[1] * DEG);
  const [alt, az] = A.altAz(Math.sin(dec), Math.cos(dec), ra, A.lstRad(ms, TOKYO.lon), Math.sin(TOKYO.lat * DEG), Math.cos(TOKYO.lat * DEG));
  return { alt: alt / DEG, az: ((az / DEG) % 360 + 360) % 360 };
}
/** 条件が続く区間の一覧 [{from, to}]（STEP 刻み） */
function spans(from, to, ok) {
  const out = []; let cur = null;
  for (let t = from; t <= to; t += STEP) {
    if (ok(t)) { if (!cur) cur = { from: t, to: t }; else cur.to = t; } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * @param {{peak: string, view: string}} rec official-events.js の METEOR_PEAKS の 1 件
 * @param {[number, number]} radiant 放射点（J2000 の赤経・赤緯、度）
 */
function yearCondition(rec, radiant) {
  const peakMs = Date.parse(rec.peak.length > 10 ? rec.peak : rec.peak + 'T00:00:00+09:00');
  const viewMs = Date.parse(rec.view);
  // 見ごろを含む夜: 見ごろが 12 時より前ならその前日の夕方から
  const v = jst(viewMs);
  const eveDay = Date.UTC(v.y, v.m - 1, v.d) - JST - (v.h < 12 ? DAY : 0);   // 夜の始まる日の 0 時（日本時間）
  const from = eveDay + 12 * HOUR, to = eveDay + 36 * HOUR;
  const dark = spans(from, to, t => E.sunAlt(t) < DARK_SUN);
  const moonless = spans(from, to, t => E.sunAlt(t) < DARK_SUN && moonAlt(t) < 0);
  const len = ss => ss.reduce((s, x) => s + (x.to - x.from + STEP), 0) / HOUR;
  // 夜のあいだの月の出・入り（その日と翌日の表から、夜の範囲に入るもの）
  const e0 = jst(eveDay + 12 * HOUR), e1 = jst(eveDay + 36 * HOUR);
  const days = [R.moonDay(e0.y, e0.m, e0.d, TOKYO.lat, TOKYO.lon), R.moonDay(e1.y, e1.m, e1.d, TOKYO.lat, TOKYO.lon)];
  const evs = [];
  for (const d of days) {
    if (d.rise && d.rise.ms >= from && d.rise.ms <= to) evs.push({ type: 'rise', ms: d.rise.ms, az: d.rise.az });
    if (d.set && d.set.ms >= from && d.set.ms <= to) evs.push({ type: 'set', ms: d.set.ms, az: d.set.az });
  }
  evs.sort((a, b) => a.ms - b.ms);
  const mv = R.moonTopo(viewMs, TOKYO.lat, TOKYO.lon);
  const rad = radiantAltAz(radiant, viewMs);
  // 放射点の高さが 30° を超えている暗い時間
  const radHigh = spans(from, to, t => E.sunAlt(t) < DARK_SUN && radiantAltAz(radiant, t).alt >= 30);
  return {
    peakMs, viewMs,
    age: R.moonAge(peakMs), illum: A.moon(peakMs).illum, phase: R.phaseName(R.moonAge(peakMs)),
    viewMoonAlt: moonAlt(viewMs), viewMoonAz: mv.az / DEG, viewMoonIllum: A.moon(viewMs).illum,
    moonEvents: evs, dark, moonless, darkHours: len(dark), moonlessHours: len(moonless),
    radiant: rad, radiantAt21: radiantAltAz(radiant, eveDay + 21 * HOUR).alt, radHigh,
  };
}

module.exports = { yearCondition, radiantAltAz, jst, DARK_SUN, TOKYO };
