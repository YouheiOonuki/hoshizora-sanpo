'use strict';
/* 英語版の星座早見盤（en/planisphere/。planisphere.js の lang: 'en'）の答え合わせ。
   日本語版（hayamiban.test.js）と同じく、プラネタリウム（main.js）と同じ天文計算（astro.js）で出した「その日時の空」と、
   紙の盤の目盛りを合わせたときに窓に見える星の位置を比べる。北緯・南緯、UTC との差（標準時）、経度の補正を広げた分を見る。
   実行: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const A = require('../astro.js');
const H = require('../hayamiban/planisphere.js');
const { CONS, STAR_EN } = require('../data.js');

const DEG = A.DEG;
const sep = (a1, d1, a2, d2) => Math.acos(Math.min(1, Math.sin(d1 * DEG) * Math.sin(d2 * DEG) + Math.cos(d1 * DEG) * Math.cos(d2 * DEG) * Math.cos((a1 - a2) * DEG))) / DEG;
/** その土地の標準時（UTC との差 tz 時）の日時 → UNIX ミリ秒 */
const local = (tz, y, mo, d, h) => Date.UTC(y, mo - 1, d) + (h - tz) * 3600000;
function planetarium(ms, lat, lon, raDeg, decDeg) {
  const P = A.precessor(ms);
  const [ra, dec] = P(raDeg * DEG, decDeg * DEG);
  const [alt, az] = A.altAz(Math.sin(dec), Math.cos(dec), ra, A.lstRad(ms, lon), Math.sin(lat * DEG), Math.cos(lat * DEG));
  return [alt / DEG, A.norm(az) / DEG];
}
function paper(m, ms, raDeg, decDeg) {
  const psi = H.rotationFor(m, ms);
  const [x, y] = H.skyXY(m, raDeg, decDeg, psi);
  const [ha, dec] = H.maskToHaDec(m, x, y);
  return { xy: [x, y], altAz: H.haDecToAltAz(m.lat, ha, dec) };
}

// 北緯 20〜65°・南緯 20〜65°。経度と時刻帯の子午線がずれている所（マドリード・カシュガル相当）と 30 分・45 分の時差も入れる
const PLACES = [
  ...H.EN_PRESETS,
  { en: 'Honolulu', lat: 21.307, lon: -157.858, tz: -10 },
  { en: 'Anchorage', lat: 61.218, lon: -149.900, tz: -9 },
  { en: 'Reykjavik', lat: 64.146, lon: -21.942, tz: 0 },
  { en: 'Helsinki', lat: 60.170, lon: 24.938, tz: 2 },
  { en: 'Madrid', lat: 40.417, lon: -3.704, tz: 1 },
  { en: 'Delhi', lat: 28.614, lon: 77.209, tz: 5.5 },
  { en: 'Kashgar', lat: 39.470, lon: 75.990, tz: 8 },
  { en: 'Kathmandu', lat: 27.717, lon: 85.324, tz: 5.75 },
  { en: 'Cape Town', lat: -33.925, lon: 18.424, tz: 2 },
  { en: 'Buenos Aires', lat: -34.604, lon: -58.382, tz: -3 },
  { en: 'Auckland', lat: -36.848, lon: 174.763, tz: 12 },
  { en: 'Adelaide', lat: -34.929, lon: 138.601, tz: 9.5 },
  { en: 'Ushuaia', lat: -54.801, lon: -68.303, tz: -3 },
  { en: 'south 20', lat: -20, lon: 57.5, tz: 4 },
  { en: 'south 65', lat: -65, lon: -64, tz: -4 },
  { en: 'north 20', lat: 20, lon: -155, tz: -10 },
];
const BRIGHT = H.allStars().filter(s => !s.flag && (s.mag <= 1.5 || CONS.some(c => c.pts.includes(s))));
const DATES = [];
for (const y of [2026, 2028, 2030, 2040, 2050]) {
  for (const [mo, d] of [[1, 5], [2, 28], [3, 1], [4, 18], [6, 21], [9, 25], [12, 31]]) for (const h of [19, 22.5, 25.25, 28.5]) DATES.push({ y, mo, d, h });
}

test('窓の中の星の位置が、プラネタリウムの空と 1° 以内で合う（北緯・南緯 20〜65°、UTC−10〜+12、2026〜2050 年）', () => {
  let worst = 0, n = 0, where = '';
  for (const L of PLACES) {
    const m = H.model({ lat: L.lat, lon: L.lon, tz: L.tz, lang: 'en' });
    for (const t of DATES) {
      const ms = local(L.tz, t.y, t.mo, t.d, t.h);
      for (const s of BRIGHT) {
        const [alt, az] = planetarium(ms, L.lat, L.lon, s.ra, s.dec);
        if (alt < 0) continue;
        const p = paper(m, ms, s.ra, s.dec);
        const e = sep(az, alt, p.altAz[1], p.altAz[0]);
        if (e > worst) { worst = e; where = `${L.en} ${t.y}-${t.mo}-${t.d} ${t.h}h`; }
        n++;
      }
    }
  }
  assert.ok(n > 50000, `比べた数 ${n}`);
  assert.ok(worst < 1.0, `最大のずれ ${worst.toFixed(3)}°（${where}）`);
});

test('窓（地平線）の内と外が、プラネタリウムの「地平線より上か」と一致する（南半球を含む）', () => {
  let checked = 0;
  for (const L of PLACES) {
    const m = H.model({ lat: L.lat, lon: L.lon, tz: L.tz, lang: 'en' });
    const poly = H.horizon(m);
    for (const t of DATES.filter((_, i) => i % 2 === 0)) {
      const ms = local(L.tz, t.y, t.mo, t.d, t.h);
      for (const s of BRIGHT) {
        const [alt] = planetarium(ms, L.lat, L.lon, s.ra, s.dec);
        if (Math.abs(alt) < 1.5) continue;
        const { xy } = paper(m, ms, s.ra, s.dec);
        if (Math.hypot(xy[0], xy[1]) < H.G.HUB) continue;
        assert.strictEqual(H.inside(poly, xy[0], xy[1]), alt > 0, `${L.en} ${t.y}-${t.mo}-${t.d} ${t.h}h ra=${s.ra.toFixed(1)} alt=${alt.toFixed(1)}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 20000, `比べた数 ${checked}`);
});

test('方位: 北半球は南が下・東が左、南半球は北が下・東が右（向いた方角を下にしてかざしたときの並び）', () => {
  const n = H.model({ lat: 51.507, lon: -0.128, tz: 0, lang: 'en' });
  const s = H.model({ lat: -33.868, lon: 151.209, tz: 10, lang: 'en' });
  const xy = (m, az) => H.horizonXY(m, az);
  assert.ok(xy(n, 180)[1] > 40 && xy(n, 0)[1] < 0, '北半球: 南が下、北が上');
  assert.ok(xy(n, 90)[0] < -40 && xy(n, 270)[0] > 40, '北半球: 東が左、西が右');
  assert.ok(xy(s, 0)[1] > 40 && xy(s, 180)[1] < 0, '南半球: 北が下、南が上');
  assert.ok(xy(s, 90)[0] > 40 && xy(s, 270)[0] < -40, '南半球: 東が右、西が左');
  // 天頂は窓の中で、下（赤道の側）に寄る
  for (const m of [n, s]) assert.ok(H.inside(H.horizon(m), 0, H.rOf(m, m.lat)) && H.rOf(m, m.lat) > 0);
  // 南十字（みなみじゅうじ座）はシドニーの盤の星図の中、北極星はロンドンの盤の中心のそば
  const cru = H.conCenter(CONS.find(c => c.id === 'cru'));
  assert.ok(Math.hypot(...H.diskXY(s, cru.ra, cru.dec)) < 30);
  const polaris = H.allStars().find(x => /北極星/.test(x.name));
  assert.ok(Math.hypot(...H.diskXY(n, polaris.ra, polaris.dec)) < 1);
});

test('寸法: 緯度 20〜65°（北・南）で、窓のはしは時刻の目盛りより内側、反対の極は星図の円の内側', () => {
  for (const sign of [1, -1]) {
    for (let a = H.EN_LAT_MIN; a <= H.EN_LAT_MAX; a += 0.5) {
      const m = H.model({ lat: sign * a, lon: 0, tz: 0, lang: 'en' });
      const far = Math.max(...H.horizon(m).map(([x, y]) => Math.hypot(x, y)));
      assert.ok(far <= H.G.R_MASK - 9.5, `lat ${sign * a}: 窓のはし ${far}`);
      assert.ok(m.decEdge >= -90, `lat ${sign * a}: ${m.decEdge}`);
    }
  }
  assert.throws(() => H.model({ lat: 19.9, lon: 0, tz: 0, lang: 'en' }), RangeError);
  assert.throws(() => H.model({ lat: -65.1, lon: 0, tz: 0, lang: 'en' }), RangeError);
  assert.throws(() => H.model({ lat: 40, lon: 0, tz: 5.3, lang: 'en' }), RangeError);
  assert.throws(() => H.model({ lat: 40, lon: 181, tz: 0, lang: 'en' }), RangeError);
});

test('時刻の目盛り: 標準時の子午線で 0 時が真下、経度が東へ 1° で 1° 回る。夜の日付はその土地の標準時で決まる', () => {
  const ny = H.model({ lat: 40.7, lon: -75, tz: -5, lang: 'en' });
  assert.strictEqual(H.timeAngle(ny, 0), 0);
  assert.ok(Math.abs(H.timeAngle(ny, 6) - 90.2464) < 1e-3);
  const nyc = H.model({ lat: 40.7, lon: -74, tz: -5, lang: 'en' });
  assert.ok(Math.abs(H.timeAngle(nyc, 0) - 1) < 1e-9);
  const syd = H.model({ lat: -33.868, lon: 150, tz: 10, lang: 'en' });
  assert.ok(Math.abs(H.timeAngle(syd, 6) + 90.2464) < 1e-3, '南半球は向きが逆');
  // 9/26 2 時（ニューヨークの標準時）は 9/25 の夜
  const n = H.nightOf(local(-5, 2026, 9, 26, 2), -5);
  assert.deepStrictEqual([n.mo, n.d], [9, 25]);
  // 日付の目盛りは時刻帯でわずかに変わる（1 時間で 0.041°）: UTC−8 と UTC+0 の差は 0.33°
  const d = ((H.dateAngle(1, 1, 0) - H.dateAngle(1, 1, -8)) % 360 + 360) % 360;
  assert.ok(Math.abs(d - 8 * 0.0411) < 0.005, `${d}`);
  assert.strictEqual(H.dateAngle(3, 1, 9), H.dateAngle(3, 1));
});

test('場所の既定: data.js の緯度・経度で、UTC との差は Intl（IANA の時刻帯）の標準時（1 月と 7 月の小さい方）', () => {
  assert.deepStrictEqual(H.EN_PRESETS.map(p => p.id), ['london', 'new-york', 'los-angeles', 'sydney']);
  const offset = (zone, ms) => {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms) / 3600000;
  };
  for (const p of H.EN_PRESETS) {
    const std = Math.min(offset(p.zone, Date.UTC(2026, 0, 15)), offset(p.zone, Date.UTC(2026, 6, 15)));
    assert.strictEqual(p.tz, std, p.id);
  }
});

test('紙: A4 と US Letter、2 枚と 1 枚。英語の文字だけで、星座・星の名前は data.js の英語名', () => {
  const sets = [];
  for (const paper of ['a4', 'letter']) {
    for (const layout of ['two', 'one']) {
      const sh = H.sheets({ lang: 'en', lat: 51.507, lon: -0.128, tz: 0, place: 'London', paper, layout, clock: 12 });
      assert.strictEqual(sh.length, layout === 'two' ? 2 : 1);
      const [w, h] = paper === 'a4' ? [210, 297] : [215.9, 279.4];
      for (const s of sh) {
        assert.ok(s.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"`), paper);
        assert.ok(!/NaN|undefined|Infinity/.test(s));
        assert.ok(!/[ぁ-んァ-ン一-龯]/.test(s), '日本語が残っていない');
        assert.ok(s.includes(H.CREDIT_EN));
      }
      sets.push(sh.join(''));
    }
  }
  const s = sets[0];
  for (const t of ['Orion', 'Ursa Major', 'Polaris', 'Pleiades', 'Betelgeuse', 'Dec', '9 PM', 'Midnight', 'London (51.51° N)', '51.51° N, 0.13° W · UTC+0 standard time', 'Ecliptic']) assert.ok(s.includes(t), t);
  // 盤に書く名前は data.js（CONS の en・STAR_EN）にあるものだけ
  const names = [...s.matchAll(/font-weight="700" stroke="#fff"[^>]*>([^<]+)</g)].map(x => x[1]);
  for (const nm of names) assert.ok(CONS.some(c => c.en === nm), nm);
  const stars = [...s.matchAll(/x="1\.5" y="0\.2"[^>]*>([^<]+)</g)].map(x => x[1]);
  assert.ok(stars.length > 10);
  for (const nm of stars) assert.ok(Object.values(STAR_EN).some(v => v.split(' (')[0] === nm), nm);
  // 24 時間制と南半球
  const syd = H.sheets({ lang: 'en', lat: -33.868, lon: 151.209, tz: 10, place: 'Sydney', clock: 24 }).join('');
  for (const t of ['21:00', '00:00', 'Crux', 'Sydney (33.87° S)', '33.87° S, 151.21° E · UTC+10', 'Canopus']) assert.ok(syd.includes(t), t);
  assert.ok(!syd.includes('Polaris'), '南半球の盤に北極星は出ない');
  assert.ok(H.sheets({ lang: 'en', lat: 28.6, lon: 77.2, tz: 5.5 }).join('').includes('UTC+5:30'));
  assert.ok(!H.sheets({ lang: 'en', lat: 40, lon: -74, tz: -5, credit: false }).join('').includes(H.CREDIT_EN));
});

test('ページ: hreflang の対・canonical・ビーコン・広告・保存キー・sitemap・英語ページからのリンク', () => {
  const root = path.join(__dirname, '..');
  const read = f => fs.readFileSync(path.join(root, f), 'utf8');
  const idx = read('en/planisphere/index.html'), guide = read('en/planisphere/guide.html');
  const jaIdx = read('hayamiban/index.html'), jaGuide = read('hayamiban/guide.html');
  const B = 'https://yorozu-craft.com/hoshizora-sanpo/';
  const pair = (html, ja, en) => {
    assert.ok(html.includes(`<link rel="alternate" hreflang="ja" href="${B}${ja}">`), ja);
    assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="${B}${en}">`), en);
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${B}${ja}">`), 'x-default');
  };
  for (const h of [idx, jaIdx]) pair(h, 'hayamiban/', 'en/planisphere/');
  for (const h of [guide, jaGuide]) pair(h, 'hayamiban/guide.html', 'en/planisphere/guide.html');
  assert.match(idx, /<link rel="canonical" href="https:\/\/yorozu-craft\.com\/hoshizora-sanpo\/en\/planisphere\/">/);
  assert.match(guide, /<link rel="canonical" href="https:\/\/yorozu-craft\.com\/hoshizora-sanpo\/en\/planisphere\/guide\.html">/);
  for (const [name, html] of [['index', idx], ['guide', guide]]) {
    assert.match(html, /<html lang="en">/, name);
    assert.strictEqual((html.match(/data-cf-beacon/g) || []).length, 1, name);
    assert.match(html, /ca-pub-5375267956079717/, name);
    assert.match(html, /href="https:\/\/yorozu-craft\.com\/en\/"/, name + ' 英語のトップ');
    assert.match(html, /\/en\/about\.html/, name);
    assert.match(html, /\/en\/privacy-policy\.html/, name);
    assert.ok(!/[ぁ-んァ-ン一-龯]/.test(html.replace(/<a [^>]*lang="ja"[^>]*>日本語<\/a>/g, '')), name + ' に日本語が残っている');
  }
  assert.match(read('en/planisphere/app.js'), /'hoshizora-sanpo_planisphere-en'/);
  const sm = read('sitemap.xml');
  assert.match(sm, /hoshizora-sanpo\/en\/planisphere\/<\/loc>/);
  assert.match(sm, /hoshizora-sanpo\/en\/planisphere\/guide\.html<\/loc>/);
  assert.match(read('en/index.html'), /href="\.\/planisphere\/"/);
  assert.match(read('en/guide.html'), /href="planisphere\/"/);
  assert.match(jaIdx, /href="\.\.\/en\/planisphere\/" hreflang="en" lang="en">English</);
});
