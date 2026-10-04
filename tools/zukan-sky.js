'use strict';
/* 星座図鑑（zukan/）の「見つけ方」「見ごろの季節と時刻」「明るい星」を、星のデータ（data.js）と天体計算（astro.js）から求める。
 * tools/build-pages.js から呼ばれ、tests/zukan-sky.test.js が値を確かめる。ここで出した数字だけを本文に書く（推測で書かない）。
 * - 場所は東京（35.681°N, 139.767°E）。時刻は日本時間。大気による浮き上がりは入れない（めやす）
 * - 年は REF_YEAR（星の南中する日付は年によってほとんど変わらない。歳差はその年の 7 月 1 日の値をかける）
 * - 「高く見える月」: 毎月 15 日の 20 時と 21 時の両方で、星座の中心の高さが「その星座が最も高くなるときの高さ − HIGH_MARGIN°」以上で、
 *   かつ MIN_ALT° 以上の月
 * - 目印の星（たどり方の起点）: ほかの星座の名前つきの明るい星（ANCHOR_MAG 等より明るい星）と北極星・LONE の星のうち、
 *   その星座でいちばん明るい星から SEP_MIN〜SEP_MAX° 離れたもの。向きは「その星座が南中したとき（真南、北の星座は真北の上）に見上げた向き」 */
const A = require('../astro.js');
const { CONS, LONE, ASTER, LOCS } = require('../data.js');

const DEG = A.DEG, HOUR = 3600000, DAY = 86400000, JST = 9 * HOUR;
const TOKYO = { lat: 35.681, lon: 139.767 };
const SYDNEY = LOCS.find(l => l.id === 'sydney'), ISHIGAKI = LOCS.find(l => l.id === 'ishigaki');
const REF_YEAR = 2027;
const HIGH_MARGIN = 15, MIN_ALT = 15;
const MID_MAX = 82;
const ANCHOR_MAG = 1.6, ANCHOR_MAG2 = 2.5, SEP_MIN = 6, SEP_MAX = 40;   // 1.6 等までで見つからなければ 2.5 等まで広げる
const PREC = A.precessor(Date.UTC(REF_YEAR, 6, 1));

const isStar = s => !s[6];
const nameOf = s => s[4] ? s[4].split('（')[0] : null;
const toEq = (raH, decD) => PREC(raH * 15 * DEG, decD * DEG);      // J2000 → REF_YEAR の赤経・赤緯（ラジアン）
const sep = (a, b) => Math.acos(Math.min(1, Math.sin(a[1]) * Math.sin(b[1]) + Math.cos(a[1]) * Math.cos(b[1]) * Math.cos(a[0] - b[0]))) / DEG;

/** 星座の中心（J2000、ラジアン）。線でつないだ星の方向の平均 */
function center(c) {
  let x = 0, y = 0, z = 0;
  for (const s of c.ss) { const a = s[0] * 15 * DEG, d = s[1] * DEG; x += Math.cos(d) * Math.cos(a); y += Math.cos(d) * Math.sin(a); z += Math.sin(d); }
  const n = Math.hypot(x, y, z);
  return { ra: Math.atan2(y, x), dec: Math.asin(z / n) };
}
const centerEq = c => { const c0 = center(c); return PREC(c0.ra, c0.dec); };

/** 高度・方位（度）。方位は北=0・東=90 */
function altAzAt([ra, dec], lst, lat) {
  const [alt, az] = A.altAz(Math.sin(dec), Math.cos(dec), ra, lst, Math.sin(lat * DEG), Math.cos(lat * DEG));
  return { alt: alt / DEG, az: ((az / DEG) % 360 + 360) % 360 };
}
const jstMs = (m, d, h, min = 0) => Date.UTC(REF_YEAR, m - 1, d, h - 9, min);
const jstParts = ms => { const t = new Date(ms + JST); return { m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes() }; };
const culmAlt = (decRad, lat) => 90 - Math.abs(lat - decRad / DEG);

const DIRS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
const dir16 = az => DIRS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

/* ---------------- 見ごろの季節と時刻 ---------------- */
/** その時刻（日本時間 h 時）に星座の中心が南中する日（REF_YEAR）。1 日刻みで、その時刻の時角が最も 0 に近い日 */
function transitDay(eq, h, loc = TOKYO) {
  let best = null, bestH = Infinity;
  for (let d = 0; d < 365; d++) {
    const ms = Date.UTC(REF_YEAR, 0, 1, h - 9) + d * DAY, x = A.lstRad(ms, loc.lon) - eq[0];
    const H = Math.abs(Math.atan2(Math.sin(x), Math.cos(x)));
    if (H < bestH) { bestH = H; best = ms; }
  }
  return jstParts(best);
}
/** 毎月 15 日の 20 時・21 時の中心の高さ（度） */
function monthlyAlt(eq, loc = TOKYO) {
  return Array.from({ length: 12 }, (_, i) => [20, 21].map(h => altAzAt(eq, A.lstRad(jstMs(i + 1, 15, h), loc.lon), loc.lat).alt));
}
/** 東京で、ある日の中心の出・南中・入り（日本時間）。出・入りの無い星座は null */
function riseSet(eq, m, d) {
  const lat = TOKYO.lat, start = jstMs(m, d, 12), f = ms => altAzAt(eq, A.lstRad(ms, TOKYO.lon), lat).alt;
  const find = (from, to, rising) => {
    const step = 10 * 60000;
    for (let t = from; t < to; t += step) {
      const a = f(t), b = f(t + step);
      if (rising ? (a < 0 && b >= 0) : (a >= 0 && b < 0)) {
        let lo = t, hi = t + step;
        while (hi - lo > 30000) { const mid = (lo + hi) / 2; if ((f(mid) >= 0) === (b >= 0)) hi = mid; else lo = mid; }
        return (lo + hi) / 2;
      }
    }
    return null;
  };
  // 南中: 時角が 0 になる時刻（当日 12 時から 24 時間のうち）
  let transit = null;
  for (let t = start; t < start + DAY; t += 10 * 60000) {
    const H = ms => Math.sin(A.lstRad(ms, TOKYO.lon) - eq[0]);
    if (H(t) < 0 && H(t + 600000) >= 0 && Math.cos(A.lstRad(t, TOKYO.lon) - eq[0]) > 0) {
      let lo = t, hi = t + 600000;
      while (hi - lo > 30000) { const mid = (lo + hi) / 2; if (H(mid) >= 0) hi = mid; else lo = mid; }
      transit = (lo + hi) / 2; break;
    }
  }
  if (transit === null) return null;
  const rise = find(transit - 14 * HOUR, transit, true), set = find(transit, transit + 14 * HOUR, false);
  return {
    transit: { ms: transit, ...jstParts(transit) }, transitAlt: f(transit),
    rise: rise && { ms: rise, ...jstParts(rise), az: altAzAt(eq, A.lstRad(rise, TOKYO.lon), lat).az },
    set: set && { ms: set, ...jstParts(set), az: altAzAt(eq, A.lstRad(set, TOKYO.lon), lat).az },
  };
}
function season(c) {
  const eq = centerEq(c), top = culmAlt(eq[1], TOKYO.lat);
  const alts = monthlyAlt(eq);
  const high = top >= MIN_ALT ? alts.map((a, i) => (Math.min(...a) >= Math.max(MIN_ALT, top - HIGH_MARGIN) ? i + 1 : 0)).filter(Boolean) : [];
  const best = alts.map((a, i) => [a[0] + a[1], i + 1]).sort((x, y) => y[0] - x[0])[0][1];
  const circumpolar = eq[1] / DEG > 90 - TOKYO.lat;                // 星座のまんなかが沈まない
  const setting = c.ss.filter(s => s[1] <= 90 - TOKYO.lat);          // 東京で沈む星（J2000 の赤緯で判定）
  return {
    top: Math.round(top), circumpolar, allUp: circumpolar && !setting.length, settingNamed: setting.filter(s => s[4]).map(nameOf), north: eq[1] / DEG > TOKYO.lat,
    at20: transitDay(eq, 20), at21: transitDay(eq, 21),
    high, best, alts: alts.map(a => a.map(v => Math.round(v))),
    rs: top > 0 ? riseSet(eq, best, 15) : null,
    low: circumpolar ? Math.round(TOKYO.lat - 90 + eq[1] / DEG) : null,   // 沈まない星座の、いちばん低いときの高さ
    sydneyTop: Math.round(culmAlt(eq[1], SYDNEY.lat)), ishigakiTop: Math.round(culmAlt(eq[1], ISHIGAKI.lat)),
  };
}

/* ---------------- 目印の星とたどり方 ---------------- */
/** 星座の明るい星（星団を除く、明るい順） */
const brightStars = c => c.ss.filter(isStar).slice().sort((a, b) => a[2] - b[2]);
/** たどり方の起点にする星: ほかの星座の名前つきの明るい星・北極星・LONE */
function anchorPool() {
  const pool = [];
  for (const o of CONS) for (const s of o.ss) {
    if (!isStar(s) || !s[4]) continue;
    if (s[2] <= ANCHOR_MAG2 && !/共有/.test(s[4])) pool.push({ name: nameOf(s), mag: s[2], con: o.jp, id: o.id, ra: s[0], dec: s[1] });
  }
  for (const s of LONE) if (s[2] <= ANCHOR_MAG2) pool.push({ name: s[4], mag: s[2], con: s[6], id: null, ra: s[0], dec: s[1] });
  return pool;
}
const POOL = anchorPool();
/** 星座が南中したとき（loc で）の、星 a から見た星 b の向き（2 つの星の中ほどを見上げたときの画面の上下左右。上＝天頂の側） */
function lookDir(c, a, b, loc) {
  const eq = centerEq(c), lst = eq[0];                              // 時角 0 = 南中
  const north = eq[1] / DEG > loc.lat;
  const A1 = altAzAt(toEq(a.ra, a.dec), lst, loc.lat), B1 = altAzAt(toEq(b.ra, b.dec), lst, loc.lat);
  const vec = h => [Math.cos(h.alt * DEG) * Math.sin(h.az * DEG), Math.cos(h.alt * DEG) * Math.cos(h.az * DEG), Math.sin(h.alt * DEG)]; // 東・北・上
  const va = vec(A1), vb = vec(B1), dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const nrm = p => { const n = Math.hypot(...p); return p.map(x => x / n); };
  const v = nrm(va.map((x, i) => x + vb[i]));                          // 見る向き
  const up = nrm([0, 0, 1].map((x, i) => x - v[2] * v[i]));             // 天頂の側
  const right = [v[1] * up[2] - v[2] * up[1], v[2] * up[0] - v[0] * up[2], v[0] * up[1] - v[1] * up[0]];
  const d = vb.map((x, i) => x - va[i]);
  const ang = Math.atan2(dot(d, up), dot(d, right)) / DEG;            // 右=0・上=90
  const W = ['右', '右上', '上', '左上', '左', '左下', '下', '右下'];
  const mid = Math.asin(v[2]) / DEG;                                  // 見る向きの高さ。天頂に近いと上下左右が決まらないので向きを出さない
  return { word: mid > MID_MAX ? null : W[Math.round(((ang % 360) + 360) % 360 / 45) % 8], angle: ang, mid, altA: A1.alt, altB: B1.alt, facing: north ? '北' : '南' };
}
/** たどり着く先: いちばん明るい名前つきの星（ほかの星座と共有の星を除く）。無ければ名前つきの星団、それも無ければ星座の中心 */
function targetOf(c) {
  const named = brightStars(c).filter(s => s[4] && !/共有/.test(s[4]));
  if (named.length) return { kind: 'star', name: nameOf(named[0]), mag: named[0][2], ra: named[0][0], dec: named[0][1] };
  const cl = c.ss.find(s => s[6] && s[4]);
  if (cl) return { kind: 'cluster', name: nameOf(cl), mag: null, ra: cl[0], dec: cl[1] };
  const c0 = center(c);
  return { kind: 'center', name: null, mag: null, ra: (c0.ra / DEG / 15 + 24) % 24, dec: c0.dec / DEG };
}
function guide(c) {
  const target = targetOf(c);
  const top = culmAlt(centerEq(c)[1], TOKYO.lat);
  const loc = top >= 10 ? TOKYO : SYDNEY;
  const tEq = toEq(target.ra, target.dec);
  const own = new Set(c.ss.filter(s => s[4]).map(nameOf));
  const all = POOL.filter(p => !own.has(p.name) && p.id !== c.id)
    .map(p => ({ ...p, sep: sep(toEq(p.ra, p.dec), tEq) }))
    .filter(p => p.sep >= SEP_MIN && p.sep <= SEP_MAX)
    .map(p => ({ ...p, dir: lookDir(c, p, target, loc) }))
    .filter(p => p.dir.altA >= 10 && p.dir.altB >= 5)
    .sort((a, b) => a.mag - b.mag || a.sep - b.sep);
  const bright1 = all.filter(p => p.mag <= ANCHOR_MAG), cands = bright1.length ? bright1 : all;
  // 起点は 2 つまで（2 つ目は 1 つ目と別の星座）
  const picked = [];
  for (const p of cands) if (picked.length < 2 && !picked.some(q => q.con === p.con)) picked.push(p);
  // アステリズム（data.js の ASTER）の頂点になっているか
  const aster = [];
  for (const as of ASTER) as.pts.forEach((pt, i) => {
    const s = c.ss.find(s => isStar(s) && Math.abs(s[0] - pt[0]) < 0.01 && Math.abs(s[1] - pt[1]) < 0.05);
    if (!s) return;
    const names = as.pts.map(q => {
      for (const o of CONS) { const m = o.ss.find(s2 => Math.abs(s2[0] - q[0]) < 0.01 && Math.abs(s2[1] - q[1]) < 0.05); if (m && m[4]) return { name: nameOf(m), con: o.jp }; }
      return null;
    });
    aster.push({ name: as.name, star: nameOf(s), index: i, close: as.close, names, others: names.filter((n, j) => n && j !== i).map(n => `${n.name}（${n.con}）`) });
  });
  // 目印から星座の中の名前つきの星・星団へ（明るい順に 2 つまで）
  const inner = target.kind === 'center' ? [] : c.ss.filter(s => s[4] && nameOf(s) !== target.name && !/共有/.test(s[4]))
    .sort((a, b) => a[2] - b[2]).slice(0, 2).map(s => {
      const o = { ra: s[0], dec: s[1] }, d = lookDir(c, target, o, loc);
      return { name: nameOf(s), sep: Math.round(sep(tEq, toEq(s[0], s[1]))), word: d.word };
    }).filter(x => x.sep >= 2);
  return { target, inner, loc: loc === TOKYO ? '東京' : 'シドニー', anchors: picked.map(p => ({ name: p.name, con: p.con, id: p.id, mag: p.mag, sep: Math.round(p.sep), word: p.dir.word, mid: Math.round(p.dir.mid), facing: p.dir.facing })), aster };
}

/** 近くの星座が、この星座の南中のころにどちらに見えるか（星座のまんなか同士。相手が地平線の下なら word は null） */
function neighborDir(c, o) {
  const loc = culmAlt(centerEq(c)[1], TOKYO.lat) >= 10 ? TOKYO : SYDNEY;
  const pt = x => { const c0 = center(x); return { ra: (c0.ra / DEG / 15 + 24) % 24, dec: c0.dec / DEG }; };
  const d = lookDir(c, pt(c), pt(o), loc);
  return { word: d.altB < 0 ? null : d.word, below: d.altB < 0 };
}

/** 北極星のさがし方の数字: おおぐま座のメラク → ドゥーベの間隔を、ドゥーベの先へ何倍のばすとポラリスか、向きのずれ（度） */
function pointerToPolaris() {
  const star = name => { for (const o of CONS) { const s = o.ss.find(s => nameOf(s) === name); if (s) return toEq(s[0], s[1]); } return null; };
  const m = star('メラク'), d = star('ドゥーベ'), p = star('ポラリス');
  const bearing = (a, b) => Math.atan2(Math.sin(b[0] - a[0]) * Math.cos(b[1]), Math.cos(a[1]) * Math.sin(b[1]) - Math.sin(a[1]) * Math.cos(b[1]) * Math.cos(b[0] - a[0])) / DEG;
  const off = Math.abs(((bearing(d, p) - bearing(m, d)) + 540) % 360 - 180);
  return { gap: sep(m, d), ratio: sep(d, p) / sep(m, d), offset: off };
}

/* ---------------- 明るい星 ---------------- */
function bright(c) {
  const stars = brightStars(c);
  return {
    count: stars.length,
    first: stars.filter(s => s[2] < 1.5).length,                    // 1 等星（1.5 等より明るい星）
    second: stars.filter(s => s[2] >= 1.5 && s[2] < 2.5).length,     // 2 等星
    named: stars.filter(s => s[4]).map(s => ({ name: nameOf(s), mag: s[2], bv: s[3], ly: s[5] || null })),
    faintest: stars.at(-1)[2],
    clusters: c.ss.filter(s => s[6]).map(s => ({ name: nameOf(s), ly: s[5] || null })),
  };
}

module.exports = { ISHIGAKI, neighborDir, season, guide, bright, pointerToPolaris, targetOf, center, centerEq, dir16, transitDay, monthlyAlt, riseSet, TOKYO, SYDNEY, REF_YEAR, HIGH_MARGIN, MIN_ALT, ANCHOR_MAG, ANCHOR_MAG2, SEP_MIN, SEP_MAX };
