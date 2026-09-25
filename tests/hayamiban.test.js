'use strict';
/* 星座早見盤（hayamiban/）の答え合わせ。
   プラネタリウム（main.js）と同じ天文計算（astro.js: 歳差・恒星時・高度方位）で出した「その日時の空」と、
   紙の盤の目盛りを合わせたときに窓に見える星の位置を比べる。実行: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const A = require('../astro.js');
const H = require('../hayamiban/planisphere.js');
const { CONS } = require('../data.js');

const DEG = A.DEG;
/** 2 方向の角距離（度） */
const sep = (a1, d1, a2, d2) => Math.acos(Math.min(1, Math.sin(d1 * DEG) * Math.sin(d2 * DEG) + Math.cos(d1 * DEG) * Math.cos(d2 * DEG) * Math.cos((a1 - a2) * DEG))) / DEG;
/** 日本時間の日時 → UNIX ミリ秒 */
const jst = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);
/** プラネタリウムと同じ計算: J2000 の星を、その日の春分点へ歳差 → 地方恒星時 → 高度・方位（度） */
function planetarium(ms, lat, lon, raDeg, decDeg) {
  const P = A.precessor(ms);
  const [ra, dec] = P(raDeg * DEG, decDeg * DEG);
  const [alt, az] = A.altAz(Math.sin(dec), Math.cos(dec), ra, A.lstRad(ms, lon), Math.sin(lat * DEG), Math.cos(lat * DEG));
  return [alt / DEG, A.norm(az) / DEG];
}
/** 紙の盤: その日時に目盛りを合わせたとき、星が上の盤のどこに来るか → そこが指す高度・方位（度） */
function paper(m, ms, raDeg, decDeg) {
  const psi = H.rotationFor(m, ms);
  const [x, y] = H.skyXY(m, raDeg, decDeg, psi);
  const [ha, dec] = H.maskToHaDec(m, x, y);
  return { xy: [x, y], altAz: H.haDecToAltAz(m.lat, ha, dec) };
}

const PLACES = [...H.PRESETS, { id: 'free', name: '稚内のあたり', lat: 45.4, lon: 141.7 }, { id: 'free2', name: '石垣島', lat: 24.34, lon: 124.16 }];
// 1.5 等より明るい星と、星座の線に使う星（プラネタリウムで目印にする星）
const BRIGHT = H.allStars().filter(s => !s.flag && (s.mag <= 1.5 || CONS.some(c => c.pts.includes(s))));
// 日付: 2026〜2050 年、季節と時刻を散らす
const TIMES = [];
for (const y of [2026, 2027, 2028, 2030, 2035, 2040, 2045, 2050]) {
  for (const [mo, d] of [[1, 5], [2, 28], [3, 1], [4, 18], [6, 21], [8, 12], [9, 25], [10, 31], [12, 14], [12, 31]]) {
    for (const h of [18.5, 21, 23.75, 2, 4.5]) TIMES.push({ y, mo, d, h, ms: jst(y, mo, d, Math.floor(h), Math.round((h % 1) * 60)) });
  }
}

test('窓の中の星の位置が、プラネタリウムの空と 1° 以内で合う（2026〜2050 年、5 地点）', () => {
  let worst = 0, worst2035 = 0, n = 0;
  for (const L of PLACES) {
    const m = H.model({ lat: L.lat, lon: L.lon });
    for (const t of TIMES) {
      for (const s of BRIGHT) {
        const [alt, az] = planetarium(t.ms, L.lat, L.lon, s.ra, s.dec);
        if (alt < 0) continue;
        const p = paper(m, t.ms, s.ra, s.dec);
        const e = sep(az, alt, p.altAz[1], p.altAz[0]);
        worst = Math.max(worst, e); if (t.y <= 2035) worst2035 = Math.max(worst2035, e); n++;
      }
    }
  }
  assert.ok(n > 50000, `比べた数 ${n}`);
  assert.ok(worst2035 < 0.9, `2035 年までの最大のずれ ${worst2035.toFixed(3)}°`);
  assert.ok(worst < 1.0, `2050 年までの最大のずれ ${worst.toFixed(3)}°`);
});

test('窓（地平線）の内と外が、プラネタリウムの「地平線より上か」と一致する（高度 ±1.5° より外の星）', () => {
  let checked = 0;
  for (const L of PLACES) {
    const m = H.model({ lat: L.lat, lon: L.lon });
    const poly = H.horizon(m);
    for (const t of TIMES.filter((_, i) => i % 3 === 0)) {
      for (const s of BRIGHT) {
        const [alt] = planetarium(t.ms, L.lat, L.lon, s.ra, s.dec);
        if (Math.abs(alt) < 1.5) continue;
        const { xy } = paper(m, t.ms, s.ra, s.dec);
        if (Math.hypot(xy[0], xy[1]) < H.G.HUB) continue;   // 中心の留め具の下（北極星のそば）
        assert.strictEqual(H.inside(poly, xy[0], xy[1]), alt > 0, `${L.name} ${t.y}-${t.mo}-${t.d} ${t.h}時 ra=${s.ra.toFixed(1)} alt=${alt.toFixed(1)}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 10000, `比べた数 ${checked}`);
});

test('方位の文字の位置: 東京で真東・真南・真西・真北の地平線は、窓のふちの左・下・右・上', () => {
  const m = H.model({ lat: 35.681, lon: 139.767 });
  const [ex, ey] = H.horizonXY(m, 90), [sx, sy] = H.horizonXY(m, 180), [wx, wy] = H.horizonXY(m, 270), [nx, ny] = H.horizonXY(m, 0);
  assert.ok(ex < -40 && Math.abs(ey) < 30, `東 ${ex},${ey}`);
  assert.ok(Math.abs(sx) < 1e-6 && Math.abs(sy - H.G.R_HORIZON) < 1e-6, `南 ${sx},${sy}`);
  assert.ok(wx > 40 && Math.abs(wy - ey) < 1e-6, `西 ${wx},${wy}`);
  assert.ok(Math.abs(nx) < 1e-6 && ny < 0 && ny > -25, `北 ${nx},${ny}`);
  // 天頂（赤緯 = 緯度、時角 0）は窓の中で中心より南
  const [zx, zy] = [0, H.rOf(m, 35.681)];
  assert.ok(H.inside(H.horizon(m), zx, zy) && zy > 0);
});

test('窓の南のはしは時刻の目盛りより内側、南極は星図の円の内側（北緯 23〜50°）', () => {
  for (let lat = H.LAT_MIN; lat <= H.LAT_MAX; lat += 0.5) {
    const m = H.model({ lat, lon: 135 });
    const [, sy] = H.horizonXY(m, 180);
    assert.ok(sy <= H.G.R_MASK - 9.5, `lat ${lat}: 南のはし ${sy}`);
    assert.ok(m.decEdge >= -90, `lat ${lat}: 星図の端の赤緯 ${m.decEdge}`);
    assert.ok(Math.abs(H.rOf(m, lat - 90) - sy) < 1e-9);
  }
  assert.throws(() => H.model({ lat: 20, lon: 135 }), RangeError);
  assert.throws(() => H.model({ lat: 35, lon: 100 }), RangeError);
});

test('日付の目盛り: 1 日で約 0.986°（2/28→3/1 はうるう日の 1/4 を含む 1.232°）、1 年で 1 周。4 年の平均と各年の差は 0.5° 以内', () => {
  let total = 0, prev = H.dateAngle(1, 1);
  for (let mo = 1; mo <= 12; mo++) {
    for (let d = 1; d <= H.MONTH_DAYS[mo - 1]; d++) {
      if (mo === 1 && d === 1) continue;
      const a = H.dateAngle(mo, d), step = ((prev - a) % 360 + 360) % 360;
      assert.ok(Math.abs(step - (mo === 3 && d === 1 ? 0.9856 * 1.25 : 0.9856)) < 0.02, `${mo}/${d} の間隔 ${step}`);
      total += step; prev = a;
    }
  }
  total += ((prev - H.dateAngle(1, 1)) % 360 + 360) % 360;
  assert.ok(Math.abs(total - 360) < 1e-6, `1 周 ${total}`);
  for (const y of [2026, 2027, 2028, 2029, 2040, 2050]) {
    for (const [mo, d] of [[1, 1], [3, 1], [6, 30], [12, 31]]) {
      const ms = jst(y, mo, d + 1, 0);        // その夜の 0 時（翌日の 0 時）
      const own = ((-A.gmstHours(ms) * 15 - 135) % 360 + 360) % 360;
      const diff = Math.abs(((own - H.dateAngle(mo, d) + 540) % 360) - 180);
      assert.ok(diff < 0.5, `${y}/${mo}/${d}: ${diff}`);
    }
  }
});

test('時刻の目盛り: 日本時間 0 時が真下（東経 135° のとき）、恒星時の速さで刻み、経度が東へ 1° で 1° 回る', () => {
  const m135 = H.model({ lat: 35, lon: 135 }), m140 = H.model({ lat: 35, lon: 140 });
  assert.strictEqual(H.timeAngle(m135, 0), 0);
  assert.ok(Math.abs(H.timeAngle(m135, 6) - 90.2464) < 1e-3);
  assert.ok(Math.abs(H.timeAngle(m135, 18) + 90.2464) < 1e-3);
  assert.strictEqual(H.timeAngle(m140, 0) - H.timeAngle(m135, 0), 5);
  // 夜の日付: 9/26 の 2 時は 9/25 の夜
  const n = H.nightOf(jst(2026, 9, 26, 2));
  assert.deepStrictEqual([n.mo, n.d], [9, 25]);
  assert.deepStrictEqual([H.nightOf(jst(2026, 9, 25, 21)).d, H.nightOf(jst(2027, 1, 1, 3)).y], [25, 2026]);
});

test('プリセットの 3 地点は data.js の場所（札幌 43.06°・東京 35.68°・那覇 26.21°）', () => {
  assert.deepStrictEqual(H.PRESETS.map(l => l.id), ['sapporo', 'tokyo', 'naha']);
  assert.ok(Math.abs(H.PRESETS[0].lat - 43.062) < 1e-9 && Math.abs(H.PRESETS[2].lat - 26.212) < 1e-9);
});

test('紙: 2 枚と 1 枚の SVG が A4（210×297mm）で、星・線・目盛り・クレジットが入る', () => {
  const two = H.sheets({ lat: 35.681, lon: 139.767, place: '東京' });
  const one = H.sheets({ lat: 26.212, lon: 127.679, place: '那覇', layout: 'one', credit: false });
  assert.strictEqual(two.length, 2); assert.strictEqual(one.length, 1);
  for (const s of [...two, ...one]) {
    assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="210mm" height="297mm" viewBox="0 0 210 297"/);
    assert.ok(!/NaN|undefined|Infinity/.test(s), 'おかしな数が無い');
  }
  assert.match(two[0], /12月/); assert.match(two[0], /オリオン座/); assert.match(two[0], /北極星/);
  assert.match(two[1], /21時/); assert.match(two[1], /東京（北緯 35\.68°）用/);
  assert.ok(two[0].includes(H.CREDIT) && two[1].includes(H.CREDIT));
  assert.ok(!one[0].includes(H.CREDIT));
  // 星の数: 4.5 等まで < 5 等まで
  const count = s => (s.match(/<circle cx/g) || []).length;
  assert.ok(count(H.sheets({ lat: 35, lon: 135, magLimit: 5 })[0]) > count(two[0]));
});

test('ページ: 印刷の広告非表示・共通ページ・ビーコン・canonical・sitemap', () => {
  const root = path.join(__dirname, '..');
  const idx = fs.readFileSync(path.join(root, 'hayamiban/index.html'), 'utf8');
  const guide = fs.readFileSync(path.join(root, 'hayamiban/guide.html'), 'utf8');
  const land = fs.readFileSync(path.join(root, 'print/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'hayamiban/hayamiban.css'), 'utf8');
  for (const [name, html] of [['index', idx], ['guide', guide], ['print', land]]) {
    assert.strictEqual((html.match(/data-cf-beacon/g) || []).length, 1, name + ' ビーコン');
    assert.match(html, /ca-pub-5375267956079717/, name + ' AdSense');
    assert.match(html, /https:\/\/yorozu-craft\.com\/about\.html|\.\.\/\.\.\/about\.html/, name + ' 運営者情報');
  }
  assert.match(idx, /<link rel="canonical" href="https:\/\/yorozu-craft\.com\/hoshizora-sanpo\/hayamiban\/">/);
  assert.match(land, /<meta name="robots" content="noindex">/);
  assert.match(css, /@media print[\s\S]*adsbygoogle/);
  assert.match(fs.readFileSync(path.join(root, 'hayamiban/app.js'), 'utf8'), /'hoshizora-sanpo_hayamiban'/, '保存のキーの接頭辞');
  assert.match(guide, /hoshizora-sanpo_hayamiban/);
  const sm = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.match(sm, /hoshizora-sanpo\/hayamiban\/<\/loc>/);
  assert.match(sm, /hoshizora-sanpo\/hayamiban\/guide\.html<\/loc>/);
  assert.ok(!/hoshizora-sanpo\/print\//.test(sm), '着地ページは sitemap に載せない');
});
