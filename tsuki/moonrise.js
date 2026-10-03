'use strict';
/* =================================================================
   ほしぞらさんぽ — 月の出・月の入り・南中・月齢（ブラウザでも Node でも読める）
   ・月の位置は astro.js の moon()（Schlyter の簡略理論。地心）を使う
   ・定義は国立天文台 暦計算室「各地のこよみ」にそろえる:
     出入りは「月の中心が地平線に一致する時刻」、地平大気差 35′8″、標高 0 m、方位は北 0° から東回り、月齢は正午の値
   ・地心の高度に月の視差（地平視差 × cos 高度）を引いて、地表から見た高度にする
   ・時刻は日本標準時（UT+9）。国立天文台の表と 1 分以内（tests/moonrise.test.js）
   ================================================================= */
/* ブラウザでは astro.js の const（DEG・TAU）は window に載らないので、関数で受け取る */
function moonriseAstro() { return { DEG, TAU, moon, sun, lstRad, altAz }; }
(function (root) {
  const A = typeof module !== 'undefined' ? require('../astro.js') : moonriseAstro();
  const { DEG, TAU, moon, sun, lstRad, altAz } = A;
  const MIN = 60000, HOUR = 3600000, DAY = 86400000, JST = 9 * HOUR;
  /** 地平大気差 35′8″（国立天文台「日の出入りの定義」） */
  const REFRACTION = (35 + 8 / 60) / 60 * DEG;
  const SYNODIC = 29.530589;

  /** 地表から見た月の中心の高度（ラジアン、大気差なし）と方位・時角 */
  function moonTopo(ms, lat, lon) {
    const M = moon(ms);
    const lst = lstRad(ms, lon);
    const sl = Math.sin(lat * DEG), cl = Math.cos(lat * DEG);
    const [alt, az] = altAz(Math.sin(M.dec), Math.cos(M.dec), M.ra, lst, sl, cl);
    const topo = alt - Math.asin(Math.sin(M.parallax) * Math.cos(alt));
    let H = lst - M.ra; H = Math.atan2(Math.sin(H), Math.cos(H));        // −π〜π
    return { alt: topo, az: ((az % TAU) + TAU) % TAU, H, M };
  }

  function bisect(f, a, b, tol = 1000) {
    let fa = f(a);
    while (b - a > tol) {
      const m = (a + b) / 2, fm = f(m);
      if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
    }
    return (a + b) / 2;
  }

  /**
   * その日（日本時間の 0 時〜24 時）の月の出・南中・月の入り
   * @param {number} y 年 @param {number} m 月（1〜12） @param {number} d 日
   * @param {number} lat 緯度（北が正） @param {number} lon 経度（東が正）
   * @returns {{rise, transit, set, age, illum}} rise/set は {ms, az}（無い日は null）、transit は {ms, alt}
   */
  function moonDay(y, m, d, lat, lon) {
    const start = Date.UTC(y, m - 1, d) - JST, end = start + DAY;
    const f = (t) => moonTopo(t, lat, lon).alt + REFRACTION;
    const g = (t) => Math.sin(moonTopo(t, lat, lon).H);
    let rise = null, set = null, transit = null;
    const STEP = 10 * MIN;
    let t0 = start, f0 = f(t0), g0 = g(t0);
    for (let t1 = start + STEP; t1 <= end; t1 += STEP) {
      const f1 = f(t1), g1 = g(t1);
      if ((f0 < 0) !== (f1 < 0)) {
        const t = bisect(f, t0, t1);
        const az = moonTopo(t, lat, lon).az / DEG;
        if (f0 < 0) { if (!rise) rise = { ms: t, az }; } else if (!set) set = { ms: t, az };
      }
      if (g0 < 0 && g1 >= 0 && Math.cos(moonTopo(t1, lat, lon).H) > 0 && !transit) {
        const t = bisect(g, t0, t1);
        transit = { ms: t, alt: (moonTopo(t, lat, lon).alt + refractionAt(moonTopo(t, lat, lon).alt)) / DEG };
      }
      t0 = t1; f0 = f1; g0 = g1;
    }
    const noon = start + 12 * HOUR;
    return { rise, transit, set, age: moonAge(noon), illum: moon(noon).illum };
  }

  /** 見かけの高度にするための大気差（Bennett の式。南中高度の表示だけに使う） */
  function refractionAt(h) {
    const hd = h / DEG;
    if (hd < -1) return 0;
    return (1 / Math.tan((hd + 7.31 / (hd + 4.4)) * DEG)) / 60 * DEG;
  }

  /** 月齢（直前の新月からの日数）。新月は月と太陽の黄経が等しくなる時刻を二分法で求める */
  function moonAge(ms) {
    const elong = (t) => { const e = moon(t).lon - sun(t).lon; return Math.atan2(Math.sin(e), Math.cos(e)); };
    const e = ((moon(ms).lon - sun(ms).lon) % TAU + TAU) % TAU;
    let guess = ms - e / TAU * SYNODIC * DAY;
    // guess の前後 2 日で符号が変わる所（−から＋）を探す
    let a = guess - 2 * DAY, b = guess + 2 * DAY;
    if (b > ms) b = ms;
    const newMoon = bisect(elong, a, b, 1000);
    return (ms - newMoon) / DAY;
  }

  /** 方位（度）→ 16 方位 */
  const DIRS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
  function dir16(az) { return DIRS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16]; }

  /** ミリ秒 → 日本時間の「H:MM」（国立天文台の表と同じく分は切り捨てではなく四捨五入） */
  function hm(ms) {
    if (ms == null) return '--:--';
    const t = Math.round((ms + JST) / MIN) * MIN;
    const dt = new Date(t);
    return dt.getUTCHours() + ':' + String(dt.getUTCMinutes()).padStart(2, '0');
  }

  /** 月の 1 か月分の表 */
  function moonMonth(y, m, lat, lon) {
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out = [];
    for (let d = 1; d <= days; d++) out.push({ d, ...moonDay(y, m, d, lat, lon) });
    return out;
  }

  /** 月の形の呼び名（月齢から。国立天文台の暦要項の朔弦望の時刻とは別の目安） */
  function phaseName(age) {
    if (age < 1.5 || age > SYNODIC - 1) return '新月のころ';
    if (age >= 6 && age < 9) return '上弦のころ';
    if (age >= 13.5 && age < 16) return '満月のころ';
    if (age >= 21 && age < 24) return '下弦のころ';
    return age < 15 ? '満ちていく月' : '欠けていく月';
  }

  const api = { moonDay, moonMonth, moonTopo, moonAge, dir16, hm, phaseName, REFRACTION };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MoonRise = api;
})(typeof window !== 'undefined' ? window : globalThis);
