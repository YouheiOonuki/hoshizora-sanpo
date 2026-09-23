'use strict';
/* 天文カレンダーの「計算で出せる現象」を求める（開発時に tools/build-pages.js から使う）
 * - 満月・新月: Meeus 第49章の式
 * - 衝（火星・木星・土星）: 惑星と太陽の黄経の差が 180° になる日
 * - 最大離角（水星・金星）: 太陽からの角距離が極大になる日
 * PyEphem との比較（2026年9月〜2027年12月）: 満月・新月は1分以内、衝・最大離角は3時間以内。
 * 天文カレンダー機能の試作。ページ生成にはまだつないでいない。
 * 流星群・日食・月食はここでは計算しない（公的機関の発表を tools/official-events.js に手で入れる）。 */
const A = require('../astro.js');
const { DEG, TAU } = A;

const HOUR = 3600000, DAY = 86400000;
const wrapPi = a => { a = ((a % TAU) + TAU) % TAU; return a > Math.PI ? a - TAU : a; };

/** f(ms) の符号が変わる区間を二分法で詰める */
function bisect(f, a, b, tol = 20000) {
  let fa = f(a);
  while (b - a > tol) {
    const m = (a + b) / 2, fm = f(m);
    if ((fa <= 0) === (fm <= 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

/** 満月・新月の時刻（Meeus『Astronomical Algorithms』第49章。誤差は1分程度）
 *  k: 2000年1月6日の新月からの朔望の番号（整数=新月、+0.5=満月）。返り値は UNIX ミリ秒（UT） */
function phaseTime(k) {
  const T = k / 1236.85, r = DEG, full = k % 1 !== 0;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.000000150 * T ** 3 + 0.00000000073 * T ** 4;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = (2.5534 + 29.10535670 * k - 0.0000014 * T * T - 0.00000011 * T ** 3) * r;
  const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T ** 3 - 0.000000058 * T ** 4) * r;
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T ** 3 + 0.000000011 * T ** 4) * r;
  const Om = (124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T ** 3) * r;
  const s = Math.sin;
  jde += (full ? -0.40614 : -0.40720) * s(Mp) + (full ? 0.17302 : 0.17241) * E * s(M)
    + (full ? 0.01614 : 0.01608) * s(2 * Mp) + (full ? 0.01043 : 0.01039) * s(2 * F)
    + (full ? 0.00734 : 0.00739) * E * s(Mp - M) - (full ? 0.00515 : 0.00514) * E * s(Mp + M)
    + (full ? 0.00209 : 0.00208) * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F)
    + 0.00056 * E * s(2 * Mp + M) - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F)
    + 0.00038 * E * s(M - 2 * F) - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(Om)
    - 0.00007 * s(Mp + 2 * M) + 0.00004 * s(2 * Mp - 2 * F) + 0.00004 * s(3 * M)
    + 0.00003 * s(Mp + M - 2 * F) + 0.00003 * s(2 * Mp + 2 * F) - 0.00003 * s(Mp + M + 2 * F)
    + 0.00003 * s(Mp - M + 2 * F) - 0.00002 * s(Mp - M - 2 * F) - 0.00002 * s(3 * Mp + M) + 0.00002 * s(4 * Mp);
  // 惑星による補正 A1〜A14
  const A = [[299.77, 0.107408, 0.000325], [251.88, 0.016321, 0.000165], [251.83, 26.651886, 0.000164],
    [349.42, 36.412478, 0.000126], [84.66, 18.206239, 0.000110], [141.74, 53.303771, 0.000062],
    [207.14, 2.453732, 0.000060], [154.84, 7.306860, 0.000056], [34.52, 27.261239, 0.000047],
    [207.19, 0.121824, 0.000042], [291.34, 1.844379, 0.000040], [161.72, 24.198154, 0.000037],
    [239.56, 25.513099, 0.000035], [331.55, 3.592518, 0.000023]];
  A.forEach(([a0, a1, c], i) => { jde += c * s((a0 + a1 * k - (i === 0 ? 0.009173 * T * T : 0)) * r); });
  const deltaT = 69.5;                                             // 2020年代の TT−UT（秒）
  return Math.round(((jde - 2440587.5) * 86400 - deltaT) * 1000);
}
/** 満月・新月（from〜to のあいだ）。分単位に丸める */
function moonPhases(from, to) {
  const out = [];
  const k0 = Math.floor(((from / 86400000 + 2440587.5) - 2451550.09766) / 29.530588861) - 1;
  for (let k = k0; ; k += 0.5) {
    const ms = phaseTime(k);
    if (ms >= to) break;
    if (ms >= from) out.push({ type: k % 1 === 0 ? 'new-moon' : 'full-moon', ms: Math.round(ms / 60000) * 60000 });
  }
  return out;
}

/** 惑星・太陽の地心黄経（その日の春分点基準） */
function eclLon(raDec, eps) {
  const [ra, dec] = raDec;
  return Math.atan2(Math.sin(ra) * Math.cos(eps) + Math.tan(dec) * Math.sin(eps), Math.cos(ra));
}
function planetState(id, ms) {
  const P = A.precessor(ms), p = A.planet(id, ms, P), s = A.sun(ms), eps = A.obliquity(ms);
  const lonP = eclLon([p.ra, p.dec], eps);
  const elong = Math.acos(Math.sin(p.dec) * Math.sin(s.dec) + Math.cos(p.dec) * Math.cos(s.dec) * Math.cos(p.ra - s.ra));
  return { p, dLon: wrapPi(lonP - s.lon), elong };
}

/** 衝: 黄経差が +180° をまたぐ日 */
function oppositions(from, to) {
  const out = [];
  for (const id of ['mars', 'jupiter', 'saturn']) {
    const f = ms => wrapPi(planetState(id, ms).dLon - Math.PI);
    for (let t = from; t < to; t += DAY) {
      const a = f(t), b = f(t + DAY);
      if ((a < 0) !== (b < 0) && Math.abs(b - a) < Math.PI) {   // 衝の前後で黄経差は減っていく（逆行）ので向きを問わない
        const ms = bisect(f, t, t + DAY, 60000);
        out.push({ type: 'opposition', planet: id, ms, mag: A.planet(id, ms, A.precessor(ms)).mag });
      }
    }
  }
  return out;
}

/** 最大離角: 太陽からの角距離の極大。東方（夕方の西の空）か西方（明け方の東の空）か */
function elongations(from, to) {
  const out = [];
  for (const id of ['mercury', 'venus']) {
    const e = ms => planetState(id, ms).elong;
    for (let t = from + DAY; t < to - DAY; t += DAY) {
      const a = e(t - DAY), b = e(t), c = e(t + DAY);
      if (b > a && b >= c) {
        // 1日刻みの極大の前後を細かく見る
        let best = t, bv = b;
        for (let u = t - DAY; u <= t + DAY; u += HOUR) { const v = e(u); if (v > bv) { bv = v; best = u; } }
        const st = planetState(id, best);
        out.push({ type: 'elongation', planet: id, ms: best, elongDeg: bv / DEG, side: st.dLon > 0 ? 'east' : 'west',
          mag: st.p.mag });
      }
    }
  }
  return out;
}

/** 東京で、その日の「空が暗くなる時刻」（太陽高度 −6°）。evening=true なら夕方、false なら明け方 */
const TOKYO = { lat: 35.681, lon: 139.767 };
function sunAlt(ms, loc = TOKYO) {
  const s = A.sun(ms);
  return A.altAz(Math.sin(s.dec), Math.cos(s.dec), s.ra, A.lstRad(ms, loc.lon), Math.sin(loc.lat * DEG), Math.cos(loc.lat * DEG))[0] / DEG;
}
function twilight(dayMsJstMidnight, evening, loc = TOKYO) {
  // 夕方は 15〜21 時、明け方は 3〜8 時（日本時間）でさがす
  const [h0, h1] = evening ? [15, 21] : [3, 8];
  const a = dayMsJstMidnight + h0 * HOUR, b = dayMsJstMidnight + h1 * HOUR;
  const f = ms => (sunAlt(ms, loc) + 6) * (evening ? -1 : 1);
  return bisect(f, a, b, 60000);
}

module.exports = { phaseTime, moonPhases, oppositions, elongations, twilight, sunAlt, TOKYO, HOUR, DAY };
