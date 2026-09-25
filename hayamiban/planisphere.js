'use strict';
/* =================================================================
   ほしぞらさんぽ — 星座早見盤（hayamiban/）の盤面を作る。ブラウザでも Node でも読める
   読み込み順（ブラウザ）: ../astro.js → ../data.js → ../catalog.js → この planisphere.js
   ・図法: 天の北極を中心にした等距離方位図法（中心からの距離が「北極からの角度」に比例）
   ・星の座標: J2000.0（catalog.js・data.js のまま。歳差はかけない。年によらず使う）
   ・日付の目盛り: astro.js の恒星時（gmstHours）から、2026〜2029 年（うるう年の 4 年）の平均で置く。
     日付は「その夜の日付」（0 時を過ぎても前の日のまま）。時刻の目盛りは恒星時の速さで刻む（timeAngle）
   ・時刻の目盛り: 日本時間。経度の差（東経 135° との差）の分だけ目盛りを回して、経度の補正を盤に入れる
   ・英語版（en/planisphere/。lang: 'en'）: 同じ盤を、UTC との差（tz。標準時）とその子午線（15° × tz）で作る。
     南緯では天の南極を中心にし（hs = −1）、角度を左右反転する（南を向いたときの東西の並びにするため）。
     A4 と US Letter、時刻は 12 時間制か 24 時間制。文字は英語（星座名は data.js の en、星の名前は STAR_EN）
   ・長さの単位は mm（SVG の viewBox も mm。A4 = 210 × 297）
   角度の決まり: 「画面の角度」は中心から真下（南）を 0°、反時計回り（右＝西へ）を正とし、
   点は (x, y) = (r sin a, r cos a)（y は下向き）。星図盤の上の星の角度は −赤経、
   組み立てたときの角度は −赤経 + ψ（ψ は盤の回転 ＝ 地方恒星時）で、これが時角 H に等しい。
   ================================================================= */
(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  /* eslint-disable no-undef */
  const A = isNode ? require('../astro.js') : { DEG, gmstHours, eclToEq };
  const Dt = isNode ? require('../data.js') : { CONS, LONE, MW, LOCS, LOCS_WORLD, STAR_EN };
  const Ct = isNode ? require('../catalog.js') : { CATALOG };
  /* eslint-enable no-undef */
  const DG = A.DEG;   // 度 → ラジアン（ブラウザでは astro.js の DEG と同じ名前にしない）

  /** 値（変えるときはテストも見直す） */
  const JST_MERIDIAN = 135;          // 日本標準時の子午線（東経 135°）
  const JST_OFFSET_H = 9;            // UTC+9
  const REF_YEARS = [2026, 2027, 2028, 2029];   // 日付の目盛りを平均する 4 年（うるう年の周期）
  const EPOCH = 'J2000.0';
  const OBLIQUITY_J2000 = 23.439291; // 黄道傾斜角（J2000）。astro.js の obliquity() の T=0 と同じ
  const LAT_MIN = 23, LAT_MAX = 50;  // 入れられる北緯（日本とその近く）
  const LON_MIN = 122, LON_MAX = 154;
  /** 英語版で入れられる範囲: 緯度の絶対値 20〜65°（北緯・南緯）、経度はどこでも、UTC との差は −12〜+14 時間（15 分きざみ）。
   *  20° より赤道側では窓の南（北）のはしが時刻の目盛りにかかる（寸法のテスト） */
  const EN_LAT_MIN = 20, EN_LAT_MAX = 65, TZ_MIN = -12, TZ_MAX = 14;
  /** 紙の大きさ（mm） */
  const PAPER = { a4: { w: 210, h: 297, name: 'A4' }, letter: { w: 215.9, h: 279.4, name: 'US Letter' } };
  /** 盤の寸法（mm。2 枚の大きい版） */
  const G = { R_MAP: 80, R_MASK: 81, R_DISK: 96, R_HORIZON: 68, HUB: 3.5, BRIDGE: 3.5 };
  /** 場所のプリセット（data.js の LOCS から） */
  const PRESETS = ['sapporo', 'tokyo', 'naha'].map(id => Dt.LOCS.find(l => l.id === id));
  /** 英語版の場所（緯度・経度は data.js の LOCS_WORLD）。tz は標準時の UTC との差（夏時間は入れない。テストで Intl の値と照合） */
  const EN_PRESETS = [['london', 0], ['new-york', -5], ['los-angeles', -8], ['sydney', 10]].map(([id, tz]) => {
    const l = Dt.LOCS_WORLD.find(x => x.id === id);
    return { id, en: l.en, lat: l.lat, lon: l.lon, tz, zone: l.tz };
  });
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const norm360 = a => ((a % 360) + 360) % 360;
  const f1 = v => Math.round(v * 100) / 100;               // SVG の数値は 0.01mm で丸める
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const polar = (r, a) => [r * Math.sin(a * DG), r * Math.cos(a * DG)];

  /** 盤の型: 緯度で決まる縮尺。南の地平線（赤緯 = 緯度 − 90°）が中心から R_HORIZON mm に来る。
   *  低い緯度では南極（赤緯 −90°）が R_MAP を超えないよう、地平線を外へずらす */
  function model({ lat, lon, magLimit = 4.5, lang = 'ja', tz = JST_OFFSET_H, clock = 24 }) {
    if (lang === 'en') {
      if (!(Math.abs(lat) >= EN_LAT_MIN && Math.abs(lat) <= EN_LAT_MAX)) throw new RangeError(`Latitude must be ${EN_LAT_MIN}–${EN_LAT_MAX}° north or south`);
      if (!(lon >= -180 && lon <= 180)) throw new RangeError('Longitude must be −180 to 180°');
      if (!(tz >= TZ_MIN && tz <= TZ_MAX && Number.isInteger(tz * 4))) throw new RangeError('UTC offset must be −12 to +14 hours');
    } else {
      if (!(lat >= LAT_MIN && lat <= LAT_MAX)) throw new RangeError(`北緯 ${LAT_MIN}〜${LAT_MAX}° で入れてください`);
      if (!(lon >= LON_MIN && lon <= LON_MAX)) throw new RangeError(`東経 ${LON_MIN}〜${LON_MAX}° で入れてください`);
      tz = JST_OFFSET_H;
    }
    const hs = lat < 0 ? -1 : 1, alat = Math.abs(lat);    // hs: 北半球 1（天の北極が中心）、南半球 −1（天の南極が中心）
    const rh = Math.max(G.R_HORIZON, G.R_MAP * (180 - alat) / 180 + 0.3);
    const span = (180 - alat) * G.R_MAP / rh;               // 中心の極から R_MAP までの角度（度）
    return { lat, lon, magLimit, rh, span, decEdge: 90 - span, k: G.R_MAP / span, lang, tz, hs, alat, clock: clock === 12 ? 12 : 24 };
  }
  /** 赤緯（度）→ 中心からの距離（mm）。等距離方位図法（南半球は天の南極からの角度） */
  const rOf = (m, dec) => (90 - m.hs * dec) * m.k;
  /** 中心からの距離（mm）→ 赤緯（度） */
  const decOf = (m, r) => m.hs * (90 - r / m.k);

  /** 時刻の目盛りは「夜の真ん中（0 時）」を基準に、恒星時の速さ（1 時間で 15.041°）で刻む。
   *  24 時間では 360.986° になるので、余る約 1° は誰も使わない昼の 12 時のところで重ねる。
   *  こうすると、その夜の日付に合わせれば夕方から明け方まで恒星時のずれが出ない */
  const SIDEREAL_DEG_PER_H = 15 * 1.00273790935;
  /** 日付の目盛りの角度（星図盤の上。度）: その日の夜（翌日の標準時 0 時）に、時刻の目盛り 0 時と合う位置。
   *  a = τ(0時) − 地方恒星時 = −(グリニッジ恒星時×15) − 標準時の子午線（経度によらない）。4 年の平均。
   *  tz は UTC との差（時。日本は 9 で子午線 135°）。南半球の盤では、この角度に hs（−1）をかけて描く */
  const dateCache = new Map();
  function dateAngle(month, day, tz = JST_OFFSET_H) {
    const key = `${month}/${day}/${tz}`;
    if (dateCache.has(key)) return dateCache.get(key);
    let sx = 0, sy = 0;
    for (const Y of REF_YEARS) {
      const ms = Date.UTC(Y, month - 1, day + 1) - tz * 3600000;
      const a = (-A.gmstHours(ms) * 15 - tz * 15) * DG;
      sx += Math.cos(a); sy += Math.sin(a);
    }
    const v = norm360(Math.atan2(sy, sx) / DG);
    dateCache.set(key, v);
    return v;
  }
  /** 夜の 0 時からの時間（時。昼の 12 時で切る: 12〜24 時は −12〜0、0〜12 時は 0〜12） */
  const fromMidnight = hours => (((hours + 12) % 24) + 24) % 24 - 12;
  /** 時刻の目盛りの角度（上の盤の上。度）: 標準時 hours 時（日本版は日本時間）。経度の差（標準時の子午線との差）の分だけ回す */
  const timeAngle = (m, hours) => m.hs * (fromMidnight(hours) * SIDEREAL_DEG_PER_H + (m.lon - m.tz * 15));

  /** 標準時（UTC との差 tz 時。既定は日本時間）の年月日・時（小数） */
  function jstParts(ms, tz = JST_OFFSET_H) {
    const d = new Date(ms + tz * 3600000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
      h: d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 };
  }
  /** その時刻が属する夜の日付（標準時の 12 時より前は前の日の夜） */
  function nightOf(ms, tz = JST_OFFSET_H) {
    const p = jstParts(ms, tz), n = p.h < 12 ? jstParts(ms - 12 * 3600000, tz) : p;
    return { y: n.y, mo: n.mo, d: n.d, h: p.h };
  }
  /** 盤の回転 ψ（度。画面の角度）: その夜の日付の目盛りを、その時刻の目盛りに合わせたとき。
   *  2 月 29 日の夜は目盛りが無いので 2 月 28 日に合わせる */
  function rotationFor(m, ms) {
    const n = nightOf(ms, m.tz);
    const day = n.mo === 2 && n.d === 29 ? 28 : n.d;
    return norm360(timeAngle(m, n.h) - m.hs * dateAngle(n.mo, day, m.tz));
  }

  /** 赤道座標（J2000、度）→ 星図盤の上の点（mm、中心が原点） */
  const diskXY = (m, raDeg, dec) => polar(rOf(m, dec), -m.hs * raDeg);
  /** 組み立てた盤（上の盤の座標）の上の点 */
  const skyXY = (m, raDeg, dec, psi) => polar(rOf(m, dec), -m.hs * raDeg + psi);
  /** 上の盤の上の点 → [時角 H（度、西が正）, 赤緯（度）] */
  function maskToHaDec(m, x, y) {
    return [m.hs * Math.atan2(x, y) / DG, decOf(m, Math.hypot(x, y))];
  }
  /** 時角・赤緯 → 高度・方位（度。方位は北 0°・東 90°） */
  function haDecToAltAz(lat, H, dec) {
    const f = lat * DG, h = H * DG, d = dec * DG;
    const alt = Math.asin(Math.sin(d) * Math.sin(f) + Math.cos(d) * Math.cos(f) * Math.cos(h));
    const az = Math.atan2(-Math.cos(d) * Math.sin(h), Math.sin(d) * Math.cos(f) - Math.cos(d) * Math.cos(h) * Math.sin(f));
    return [alt / DG, norm360(az / DG)];
  }
  /** 高度・方位 → 時角・赤緯（度） */
  function altAzToHaDec(lat, alt, az) {
    const f = lat * DG, h = alt * DG, A2 = az * DG;
    const sd = Math.sin(f) * Math.sin(h) + Math.cos(f) * Math.cos(h) * Math.cos(A2);
    const dec = Math.asin(Math.max(-1, Math.min(1, sd)));
    const H = Math.atan2(-Math.sin(A2) * Math.cos(h), Math.sin(h) * Math.cos(f) - Math.cos(h) * Math.cos(A2) * Math.sin(f));
    return [H / DG, dec / DG];
  }
  /** 地平線（高度 alt、既定 0°）の点（上の盤の座標、mm） */
  function horizonXY(m, az, alt = 0) {
    const [H, dec] = altAzToHaDec(m.lat, alt, az);
    return polar(rOf(m, dec), m.hs * H);
  }
  /** 地平線の多角形（窓の形）。方位 1° ごと */
  const horizon = m => Array.from({ length: 360 }, (_, i) => horizonXY(m, i));
  /** 点が多角形の中か（窓の中＝地平線より上） */
  function inside(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  /* ---------------- 星・星座のデータ（data.js・catalog.js をそのまま使う） ---------------- */
  let starCache = null;
  /** [{ra(度), dec, mag, name, flag}]。星座の星（data.js）＋名前つきの星（LONE）＋カタログ（重なりは除く。main.js と同じ） */
  function allStars() {
    if (starCache) return starCache;
    const out = [];
    const add = (raH, dec, mag, name, flag) => out.push({ ra: raH * 15, dec, mag, name: name || '', flag: flag || '' });
    Dt.CONS.forEach(c => { c.pts = c.ss.map(s => { add(s[0], s[1], s[2], s[4], s[6]); return out[out.length - 1]; }); });
    Dt.LONE.forEach(s => add(s[0], s[1], s[2], s[4]));
    const vec = (ra, dec) => [Math.cos(dec * DG) * Math.cos(ra * DG), Math.cos(dec * DG) * Math.sin(ra * DG), Math.sin(dec * DG)];
    const near = Math.cos(0.2 * DG), known = out.filter(s => !s.flag).map(s => vec(s.ra, s.dec));
    const C = Ct.CATALOG;
    for (let i = 0; i < C.length; i += 4) {
      const raH = C[i] / 1000, dec = C[i + 1] / 100, mag = C[i + 2] / 100;
      const v = vec(raH * 15, dec);
      if (mag < 4.2 && known.some(k => k[0] * v[0] + k[1] * v[1] + k[2] * v[2] > near)) continue;
      add(raH, dec, mag);
    }
    return (starCache = out);
  }
  /** 盤に名前を書く星: 1.6 等より明るい名前つきの星・北極星・星団（すばる）。表示は括弧の前まで */
  function starLabel(s, lang = 'ja') {
    if (!s.name) return '';
    const en = () => (Dt.STAR_EN[s.name.split('（')[0]] || '').split(' (')[0];   // 英語名（括弧の前まで。Polaris・Pleiades）
    if (/北極星/.test(s.name)) return lang === 'en' ? en() : '北極星';
    if (s.flag === 'cl') return lang === 'en' ? en() : s.name.split('（')[0];
    return s.mag <= 1.6 ? (lang === 'en' ? en() : s.name.split('（')[0]) : '';
  }
  /** 星座の中心（星の方向の平均。main.js と同じ） */
  function conCenter(c) {
    let x = 0, y = 0, z = 0;
    for (const s of c.pts) { x += Math.cos(s.dec * DG) * Math.cos(s.ra * DG); y += Math.cos(s.dec * DG) * Math.sin(s.ra * DG); z += Math.sin(s.dec * DG); }
    const n = Math.hypot(x, y, z);
    return { ra: norm360(Math.atan2(y, x) / DG), dec: Math.asin(z / n) / DG };
  }
  /** 大円に沿って 2 点の間を分ける（線が図法でゆがむ分を曲げて描く） */
  function greatArc(a, b, n) {
    const v = s => [Math.cos(s.dec * DG) * Math.cos(s.ra * DG), Math.cos(s.dec * DG) * Math.sin(s.ra * DG), Math.sin(s.dec * DG)];
    const p = v(a), q = v(b), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = p[0] * (1 - t) + q[0] * t, y = p[1] * (1 - t) + q[1] * t, z = p[2] * (1 - t) + q[2] * t;
      const r = Math.hypot(x, y, z);
      pts.push({ ra: Math.atan2(y, x) / DG, dec: Math.asin(z / r) / DG });
    }
    return pts;
  }
  /** 黄道（J2000）の点 */
  const ecliptic = () => Array.from({ length: 181 }, (_, i) => {
    const [ra, dec] = A.eclToEq(i * 2 * DG, 0, OBLIQUITY_J2000 * DG);
    return { ra: ra / DG, dec: dec / DG };
  });

  /* ---------------- SVG ---------------- */
  const FONT = '"Noto Sans JP","Noto Sans CJK JP","Hiragino Sans","Hiragino Kaku Gothic ProN",Meiryo,sans-serif';
  const FONT_EN = '"Helvetica Neue",Helvetica,Arial,"Noto Sans","Liberation Sans",sans-serif';
  const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** 時刻の文字（英語）: 12 時間制は 6 PM・Midnight・Noon、24 時間制は 18:00 */
  const hourEn = (h, clock) => clock === 12 ? (h === 0 ? 'Midnight' : h === 12 ? 'Noon' : `${h % 12} ${h < 12 ? 'AM' : 'PM'}`) : `${pad2(h)}:00`;
  const pad2 = n => String(n).padStart(2, '0');
  /** 盤の上の文字（言語ごと） */
  const WORDS = {
    ja: { ecl: '黄道', equator: '天の赤道', cut: '切りぬく', title: '星座早見盤', con: c => c.jp, month: mo => mo + '月', hour: h => h + '時',
      dirs: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'], mag: v => `${v < 0 ? '−' + -v : v}等` },
    en: { ecl: 'Ecliptic', equator: 'Celestial equator', cut: 'Cut out', title: 'Planisphere', con: c => c.en, month: mo => MONTH_EN[mo - 1],
      dirs: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], mag: v => `${v < 0 ? '−' + -v : v}` },
  };
  const COL = { ink: '#1b2233', grid: '#c3cbd9', line: '#3569b5', name: '#1d4d96', mw: '#e2eaf6', ecl: '#c9772b', gray: '#d5dae3', dim: '#5b6478' };
  /** 中心向きを「上」にした文字（その位置を下にして持つと読める） */
  function radialText(x, y, a, size, text, extra = '') {
    return `<text transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(-a)})" font-size="${size}" text-anchor="middle" dominant-baseline="central"${extra}>${esc(text)}</text>`;
  }
  const pathOf = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`).join('');

  /** 星図盤（下の盤）。中心が原点。rot（度）を与えると組み立てた向きで描く（画面の見本用） */
  let clipSeq = 0;
  function diskSvg(m, { rot = 0 } = {}) {
    const o = [], clip = 'hb-clip' + (++clipSeq), W = WORDS[m.lang] || WORDS.ja, hs = m.hs;
    const P = (ra, dec) => polar(rOf(m, dec), -hs * ra + rot);
    o.push(`<circle r="${G.R_DISK}" fill="#fff" stroke="${COL.ink}" stroke-width="0.35"/>`);
    o.push(`<clipPath id="${clip}"><circle r="${G.R_MAP}"/></clipPath><g clip-path="url(#${clip})">`);
    // 天の川（data.js の中心線と幅）
    const mw = Dt.MW;
    for (let i = 0; i < mw.length; i++) {
      const a = mw[i], b = mw[(i + 1) % mw.length];
      const seg = greatArc({ ra: a[0] * 15, dec: a[1] }, { ra: b[0] * 15, dec: b[1] }, 6).map(p => P(p.ra, p.dec));
      o.push(`<path d="${pathOf(seg)}" fill="none" stroke="${COL.mw}" stroke-width="${f1((a[2] + b[2]) / 2 * m.k * 1.6)}" stroke-linecap="round"/>`);
    }
    // 赤緯の円（30° ごと）と赤経の線（2 時間ごと）
    for (let dec = 60; dec > m.decEdge; dec -= 30) {
      o.push(`<circle r="${f1(rOf(m, hs * dec))}" fill="none" stroke="${COL.grid}" stroke-width="${dec === 0 ? 0.3 : 0.15}"${dec === 0 ? '' : ' stroke-dasharray="1 1"'}/>`);
    }
    for (let h = 0; h < 24; h += 2) {
      const [x0, y0] = P(h * 15, hs * 80), [x1, y1] = P(h * 15, hs * m.decEdge);
      o.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${COL.grid}" stroke-width="0.15" stroke-dasharray="1 1"/>`);
    }
    // 黄道
    o.push(`<path d="${pathOf(ecliptic().map(p => P(p.ra, p.dec)))}" fill="none" stroke="${COL.ecl}" stroke-width="0.25" stroke-dasharray="1.6 0.8"/>`);
    { const ra = hs > 0 ? 40 : 220, [x, y] = P(ra, hs * 18); o.push(radialText(x, y, -hs * ra + rot, 2.1, W.ecl, ` fill="${COL.ecl}"`)); }
    { const [x, y] = P(210, -hs * 2.2); o.push(radialText(x, y, -hs * 210 + rot, 2.1, W.equator, ` fill="${COL.dim}"`)); }
    // 星座の線
    const stars = allStars();
    const lines = [];
    // 英語版: その緯度で一度も昇らない所（星図のふちの、図法で大きく引き伸ばされる所）は線と名前を描かない（日本語版は従来どおり）
    const never = dec => m.lang === 'en' && hs * dec < m.alat - 90 - 2;
    Dt.CONS.forEach(c => c.ln.forEach(([i, j]) => never(c.pts[i].dec) && never(c.pts[j].dec) ? 0 : lines.push(pathOf(greatArc(c.pts[i], c.pts[j], 6).map(p => P(p.ra, p.dec))))));
    o.push(`<path d="${lines.join('')}" fill="none" stroke="${COL.line}" stroke-width="0.3" stroke-linejoin="round"/>`);
    // 星
    const dots = [];
    for (const s of stars) {
      if (hs * s.dec < m.decEdge - 1) continue;
      const [x, y] = P(s.ra, s.dec);
      if (s.flag) { dots.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="1.1" fill="none" stroke="${COL.ink}" stroke-width="0.2" stroke-dasharray="0.4 0.35"/>`); continue; }
      if (s.mag > m.magLimit) continue;
      dots.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(starRadius(s.mag))}"/>`);
    }
    o.push(`<g fill="${COL.ink}" stroke="#fff" stroke-width="0.22">${dots.join('')}</g>`);
    // 名前（星座と明るい星）。中心向きが上
    Dt.CONS.forEach(c => {
      const cc = conCenter(c); if (hs * cc.dec < m.decEdge + 2 || never(cc.dec)) return;
      const [x, y] = P(cc.ra, cc.dec); const a = -hs * cc.ra + rot;
      o.push(radialText(x, y, a, 2.7, W.con(c), ` fill="${COL.name}" font-weight="700" stroke="#fff" stroke-width="0.5" paint-order="stroke"`));
    });
    for (const s of stars) {
      const t = starLabel(s, m.lang); if (!t || hs * s.dec < m.decEdge + 2 || never(s.dec)) continue;
      const [x, y] = P(s.ra, s.dec), a = -hs * s.ra + rot;
      o.push(`<text transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(-a)})" x="1.5" y="0.2" font-size="2.1" dominant-baseline="central" fill="${COL.ink}" stroke="#fff" stroke-width="0.45" paint-order="stroke">${esc(t)}</text>`);
    }
    o.push('</g>');
    o.push(`<circle r="${G.R_MAP}" fill="none" stroke="${COL.ink}" stroke-width="0.2"/>`);
    // 日付の目盛り（R_MASK の外。上の盤の縁から見える）
    const r0 = G.R_MASK + 0.2, ticks = [];
    for (let mo = 1; mo <= 12; mo++) {
      for (let d = 1; d <= MONTH_DAYS[mo - 1]; d++) {
        const a = hs * dateAngle(mo, d, m.tz) + rot;
        const len = d === 1 ? 7.5 : d % 10 === 0 ? 3.8 : d % 5 === 0 ? 2.8 : 1.8;
        const [x0, y0] = polar(r0, a), [x1, y1] = polar(r0 + len, a);
        ticks.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}"${d === 1 ? ' stroke-width="0.35"' : ''}/>`);
        if (d % 10 === 0) { const [x, y] = polar(r0 + 5.6, a); o.push(radialText(x, y, a, 2.3, d, ` fill="${COL.dim}"`)); }
      }
      const a = hs * dateAngle(mo, 16, m.tz) + rot, [x, y] = polar(r0 + 10, a);
      o.push(radialText(x, y, a, 3.8, W.month(mo), ` fill="${COL.ink}" font-weight="700"`));
    }
    o.push(`<g stroke="${COL.ink}" stroke-width="0.2">${ticks.join('')}</g>`);
    // 中心（穴をあける所）
    o.push(`<g stroke="${COL.ink}" stroke-width="0.2"><circle r="0.9" fill="none"/><line x1="-2.2" x2="2.2"/><line y1="-2.2" y2="2.2"/></g>`);
    return o.join('\n');
  }
  /** 星の点の半径（mm）: 明るいほど大きい */
  const starRadius = mag => Math.max(0.28, 1.45 - 0.26 * mag);

  /** 上の盤（窓）。mode 'print' は窓を灰色（切りぬく所）、'view' は窓を穴にして見本に重ねる */
  function maskSvg(m, { mode = 'print', place = '' } = {}) {
    const o = [], W = WORDS[m.lang] || WORDS.ja;
    const hz = horizon(m);
    const rN = rOf(m, m.hs * (90 - m.alat));               // 極の側の地平線（中心の真上。北半球は北、南半球は南）
    if (mode === 'view') {
      o.push(`<path d="M${G.R_MASK} 0A${G.R_MASK} ${G.R_MASK} 0 1 0 ${-G.R_MASK} 0A${G.R_MASK} ${G.R_MASK} 0 1 0 ${G.R_MASK} 0Z${pathOf(hz)}Z" fill="#1a2440" fill-rule="evenodd" stroke="#0b1020" stroke-width="0.3"/>`);
    } else {
      o.push(`<circle r="${G.R_MASK}" fill="#fff" stroke="${COL.ink}" stroke-width="0.35"/>`);
      o.push(`<path d="${pathOf(hz)}Z" fill="${COL.gray}" stroke="${COL.ink}" stroke-width="0.3"/>`);
      o.push(`<text y="${f1(rOf(m, m.lat) + 6)}" font-size="3.4" text-anchor="middle" fill="${COL.dim}">${W.cut}</text>`);
    }
    const ink = mode === 'view' ? '#e8ecf7' : COL.ink, dim = mode === 'view' ? '#a3adc9' : COL.dim;
    const bridgeFill = mode === 'view' ? '#1a2440' : '#fff';
    // 中心と北への細い帯（切らずに残す。中心を留めるため）
    const hw = G.BRIDGE / 2, yJoin = -Math.sqrt(G.HUB * G.HUB - hw * hw);
    o.push(`<circle r="${G.HUB}" fill="${bridgeFill}" stroke="${ink}" stroke-width="0.3"/>`);
    o.push(`<rect x="${-hw}" y="${f1(-rN - 0.6)}" width="${G.BRIDGE}" height="${f1(rN + 0.6 + yJoin + 0.2)}" fill="${bridgeFill}"/>`);
    o.push(`<g stroke="${ink}" stroke-width="0.3"><line x1="${-hw}" y1="${f1(yJoin)}" x2="${-hw}" y2="${f1(-rN - 0.3)}"/><line x1="${hw}" y1="${f1(yJoin)}" x2="${hw}" y2="${f1(-rN - 0.3)}"/></g>`);
    o.push(`<g stroke="${ink}" stroke-width="0.2"><circle r="0.9" fill="none"/><line x1="-2.2" x2="2.2"/><line y1="-2.2" y2="2.2"/></g>`);
    // 方位（窓のふちの外側。その方角を下にして持つと読める）
    const DIRS = W.dirs.map((t, i) => [i * 45, t]);
    for (const [az, t] of DIRS) {
      const [x0, y0] = horizonXY(m, az), [x1, y1] = horizonXY(m, az, -1);
      const n = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / n, uy = (y1 - y0) / n;
      const big = az % 90 === 0, off = big ? 2.9 : 2.5;
      const th = Math.atan2(-ux, uy) / DG;               // 窓の方が「上」
      o.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x0 + ux * 1.2)}" y2="${f1(y0 + uy * 1.2)}" stroke="${ink}" stroke-width="0.3"/>`);
      o.push(`<text transform="translate(${f1(x0 + ux * (off + 1))} ${f1(y0 + uy * (off + 1))}) rotate(${f1(th)})" font-size="${big ? 3.4 : 2.4}" text-anchor="middle" dominant-baseline="central" font-weight="${big ? 700 : 400}" fill="${ink}">${t}</text>`);
    }
    // 時刻の目盛り（縁。10 分ごと）
    const ticks = [];
    for (let i = 0; i < 144; i++) {
      const a = timeAngle(m, i / 6), len = i % 6 === 0 ? 3.2 : i % 3 === 0 ? 2.2 : 1.3;
      const [x0, y0] = polar(G.R_MASK, a), [x1, y1] = polar(G.R_MASK - len, a);
      ticks.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}"${i % 6 === 0 ? ' stroke-width="0.35"' : ''}/>`);
    }
    o.push(`<g stroke="${ink}" stroke-width="0.2">${ticks.join('')}</g>`);
    for (let h = 0; h < 24; h++) {
      const a = timeAngle(m, h), [x, y] = polar(G.R_MASK - 5.4, a);
      const night = h >= 17 || h <= 6;
      o.push(radialText(x, y, a, night ? 2.9 : 2.4, m.lang === 'en' ? hourEn(h, m.clock) : W.hour(h), ` fill="${night ? ink : dim}"${night ? ' font-weight="700"' : ''}`));
    }
    // 題と凡例（北の地平線より上）
    if (mode === 'print') {
      const top = -rN - 7;
      o.push(`<text y="${f1(top - 20)}" font-size="6.2" text-anchor="middle" font-weight="700" fill="${ink}" letter-spacing="0.8">${W.title}</text>`);
      if (place) o.push(`<text y="${f1(top - 13.5)}" font-size="3.1" text-anchor="middle" fill="${ink}">${esc(place)}</text>`);
      o.push(`<text y="${f1(top - 9)}" font-size="2.5" text-anchor="middle" fill="${dim}">${m.lang === 'en'
        ? `${latLonEn(m.lat, m.lon)} · ${tzEn(m.tz)} standard time, corrected for longitude`
        : `北緯 ${f1(m.lat)}°・東経 ${f1(m.lon)}°／時刻は日本時間（経度の差を補正ずみ）`}</text>`);
      const leg = [-1, 0, 1, 2, 3, 4].filter(v => v <= m.magLimit);
      const w = 11.5, x0 = -((leg.length - 1) * w) / 2 - 2;
      leg.forEach((v, i) => {
        const x = x0 + i * w, r = starRadius(v);
        o.push(`<circle cx="${f1(x)}" cy="${f1(top - 3.2)}" r="${f1(r)}" fill="${ink}"/><text x="${f1(x + r + 0.7)}" y="${f1(top - 3.2)}" font-size="2.3" dominant-baseline="central" fill="${dim}">${W.mag(v)}</text>`);
      });
      if (m.lang === 'en') o.push(`<text x="${f1(x0 - 3)}" y="${f1(top - 3.2)}" font-size="2.3" text-anchor="end" dominant-baseline="central" fill="${dim}">Magnitude</text>`);
    }
    return o.join('\n');
  }

  /* ---------------- A4 の紙 ---------------- */
  const CREDIT = 'yorozu-craft.com/hoshizora-sanpo/print/ で作成';
  function scaleBar(x, y) {
    return `<g stroke="${COL.ink}" stroke-width="0.3"><line x1="${x}" y1="${y}" x2="${x + 50}" y2="${y}"/><line x1="${x}" y1="${y - 1.5}" x2="${x}" y2="${y + 1.5}"/><line x1="${x + 50}" y1="${y - 1.5}" x2="${x + 50}" y2="${y + 1.5}"/></g>` +
      `<text x="${x + 53}" y="${y}" font-size="2.6" dominant-baseline="central" fill="${COL.dim}">この線が 5 cm なら原寸（印刷の倍率は 100%・実際のサイズ）</text>`;
  }
  const svgOpen = () => `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297" font-family='${FONT}'>\n<rect width="210" height="297" fill="#fff"/>`;
  const STEPS_MAKE = [
    '2 枚とも厚紙に印刷する（ふつうの紙なら、工作用紙などに貼ってから切る）。',
    '下の盤は外の円を、上の盤は外の円と灰色の窓を切りぬく。中心の丸と北への細い帯は残す。',
    '2 枚の中心の＋にキリなどで穴をあけ、上の盤を上にして割りピン（ブラッド）で留める。',
  ];
  const STEPS_USE = [
    '見る夜の日付（下の盤のふち）を、時刻（上の盤のふち）に合わせる。0 時を過ぎても前の夜の日付のまま。',
    '見る方角の文字を下にして、盤を頭の上にかざす。窓の中がそのときの星空。',
    '窓のふちが地平線、窓の中で「南」に寄ったところが頭の真上（天頂）。',
  ];
  function textLines(x, y, lines, size, gap, numbered) {
    return lines.map((t, i) => `<text x="${x}" y="${f1(y + i * gap)}" font-size="${size}" fill="${COL.ink}">${numbered ? `${i + 1}. ` : ''}${esc(t)}</text>`).join('');
  }
  /** 組み立ての図（横から見た重なり） */
  function assemblyFig(x, y) {
    return `<g transform="translate(${x} ${y})" font-size="2.5" fill="${COL.ink}">
<rect x="0" y="0" width="54" height="1.6" fill="${COL.gray}" stroke="${COL.ink}" stroke-width="0.25"/><text x="57" y="1.4">上の盤（窓）</text>
<rect x="-6" y="4.4" width="66" height="1.6" fill="#fff" stroke="${COL.ink}" stroke-width="0.25"/><text x="63" y="6">下の盤（星図）</text>
<path d="M27 -3.5 v11 M24.6 -3.5 h4.8" stroke="${COL.ink}" stroke-width="0.6" fill="none"/><path d="M27 7.5 l-4 2.5 M27 7.5 l4 2.5" stroke="${COL.ink}" stroke-width="0.5" fill="none"/>
<text x="-6" y="-2">割りピン</text><path d="M4 -2.8 L23.8 -3.3" stroke="${COL.dim}" stroke-width="0.2"/>
</g>`;
  }
  /** 印刷する紙（SVG の文字列の配列）。layout: 'two'（A4 2 枚・大きい）/ 'one'（A4 1 枚・小さい） */
  function sheets({ lat, lon, magLimit = 4.5, layout = 'two', place = '', credit = true, lang = 'ja', ...en }) {
    if (lang === 'en') return sheetsEn({ lat, lon, magLimit, layout, place, credit, ...en });
    const m = model({ lat, lon, magLimit });
    const who = place ? `${place}（北緯 ${f1(lat)}°）用` : `北緯 ${f1(lat)}°・東経 ${f1(lon)}° 用`;
    const foot = `<text x="12" y="287" font-size="2.3" fill="${COL.dim}">星は ${magLimit} 等まで。線と名前はほしぞらさんぽの 32 星座。星の位置は ${EPOCH}（年によらず使える。ずれは 1° 以内）。</text>` +
      (credit ? `<text x="198" y="292" font-size="2.3" text-anchor="end" fill="${COL.dim}">${CREDIT}</text>` : '');
    if (layout === 'one') {
      const s = 0.66;
      return [svgOpen() + `
<text x="12" y="12" font-size="4.6" font-weight="700" fill="${COL.ink}">星座早見盤　${esc(who)}</text>
<text x="12" y="17.5" font-size="2.6" fill="${COL.dim}">上の盤（右下）の外の円と灰色の窓、下の盤（左上）の外の円を切りぬき、中心の＋を割りピンで留める。</text>
<g transform="translate(80 87) scale(${s})">${diskSvg(m)}</g>
<text x="80" y="155" font-size="3" text-anchor="middle" fill="${COL.ink}">下の盤（星図）</text>
<g transform="translate(150 207) scale(${s})">${maskSvg(m, { place: who })}</g>
<text x="150" y="265" font-size="3" text-anchor="middle" fill="${COL.ink}">上の盤（窓）</text>
<text x="12" y="168" font-size="3.2" font-weight="700" fill="${COL.ink}">作り方</text>
${textLines(12, 174, ['厚紙に印刷するか、紙を厚紙に貼る。', '2 枚の外の円と、上の盤の灰色の窓を', '切りぬく（中心の丸と北への帯は残す）。', '中心の＋に穴をあけ、上の盤を上にして', '割りピンで留める。'], 2.6, 4.2)}
<text x="12" y="203" font-size="3.2" font-weight="700" fill="${COL.ink}">使い方</text>
${textLines(12, 209, ['夜の日付（下の盤）を時刻（上の盤）に', '合わせる（0 時を過ぎても前の夜の日付）。', '見る方角の文字を下にして頭の上にかざす。', '窓の中が、そのときの星空。'], 2.6, 4.2)}
${assemblyFig(20, 240)}
${scaleBar(12, 276)}
${foot}
</svg>`];
    }
    const p1 = svgOpen() + `
<text x="12" y="15" font-size="5.2" font-weight="700" fill="${COL.ink}">星座早見盤　下の盤（星図）</text>
<text x="12" y="21.5" font-size="3" fill="${COL.dim}">${esc(who)}。いちばん外の円にそって切りぬく。</text>
<g transform="translate(105 150)">${diskSvg(m)}</g>
${scaleBar(12, 262)}
<text x="12" y="272" font-size="2.6" fill="${COL.ink}">ほかの緯度では窓の形と星の並びが合わないので、その場所の盤を印刷し直す。</text>
${foot}
</svg>`;
    const p2 = svgOpen() + `
<text x="12" y="15" font-size="5.2" font-weight="700" fill="${COL.ink}">星座早見盤　上の盤（窓）</text>
<text x="12" y="21.5" font-size="3" fill="${COL.dim}">外の円と灰色の窓を切りぬく。中心の丸と北への細い帯は残す。</text>
<g transform="translate(105 108)">${maskSvg(m, { place: who })}</g>
<text x="12" y="200" font-size="3.6" font-weight="700" fill="${COL.ink}">作り方</text>
${textLines(12, 207, STEPS_MAKE, 3, 5.4, true)}
<text x="12" y="229" font-size="3.6" font-weight="700" fill="${COL.ink}">使い方</text>
${textLines(12, 236, STEPS_USE, 3, 5.4, true)}
${assemblyFig(128, 253)}
${scaleBar(12, 276)}
${foot}
</svg>`;
    return [p1, p2];
  }

  /* ---------------- 英語版の紙（A4・US Letter。en/planisphere/） ---------------- */
  const CREDIT_EN = 'Made at yorozu-craft.com/hoshizora-sanpo/en/planisphere/';
  /** 51.5° N, 0.1° W */
  const latLonEn = (lat, lon) => `${f1(Math.abs(lat))}° ${lat < 0 ? 'S' : 'N'}, ${f1(Math.abs(lon))}° ${lon < 0 ? 'W' : 'E'}`;
  /** UTC−5・UTC+5:30・UTC+0 */
  const tzEn = tz => `UTC${tz < 0 ? '−' : '+'}${Math.floor(Math.abs(tz))}${Math.abs(tz) % 1 ? ':' + pad2(Math.round((Math.abs(tz) % 1) * 60)) : ''}`;
  const EN_MAKE = [
    'Print both sheets on card stock, or glue plain paper onto thin card.',
    'Cut out both outer circles and the gray window. Keep the center circle and the thin strip.',
    'Pierce the + marks. Put the window on top and join the two disks with a paper fastener (brad).',
  ];
  const EN_USE = [
    'Turn the star wheel until the date of the evening lines up with the time. After midnight, keep that evening’s date.',
    'Times are standard time. During daylight saving time, set the wheel 1 hour earlier than your clock.',
    'Face a direction and hold the planisphere overhead, that direction’s letter at the bottom. The window shows the sky.',
  ];
  /** 英語の組み立ての図（横から見た重なり） */
  function assemblyFigEn(x, y) {
    return `<g transform="translate(${x} ${y})" font-size="2.5" fill="${COL.ink}">
<rect x="0" y="0" width="54" height="1.6" fill="${COL.gray}" stroke="${COL.ink}" stroke-width="0.25"/><text x="57" y="1.4">Window (top disk)</text>
<rect x="-6" y="4.4" width="66" height="1.6" fill="#fff" stroke="${COL.ink}" stroke-width="0.25"/><text x="63" y="6">Star wheel (bottom disk)</text>
<path d="M27 -3.5 v11 M24.6 -3.5 h4.8" stroke="${COL.ink}" stroke-width="0.6" fill="none"/><path d="M27 7.5 l-4 2.5 M27 7.5 l4 2.5" stroke="${COL.ink}" stroke-width="0.5" fill="none"/>
<text x="-6" y="-2">Paper fastener</text><path d="M11.5 -2.8 L23.8 -3.3" stroke="${COL.dim}" stroke-width="0.2"/>
</g>`;
  }
  function scaleBarEn(x, y) {
    return `<g stroke="${COL.ink}" stroke-width="0.3"><line x1="${x}" y1="${y}" x2="${x + 50}" y2="${y}"/><line x1="${x}" y1="${y - 1.5}" x2="${x}" y2="${y + 1.5}"/><line x1="${x + 50}" y1="${y - 1.5}" x2="${x + 50}" y2="${y + 1.5}"/></g>` +
      `<text x="${x + 53}" y="${y}" font-size="2.6" dominant-baseline="central" fill="${COL.dim}">If this line is 5 cm (1.97 in), the print is actual size (scale 100%).</text>`;
  }
  const svgOpenEn = pp => `<svg xmlns="http://www.w3.org/2000/svg" width="${pp.w}mm" height="${pp.h}mm" viewBox="0 0 ${pp.w} ${pp.h}" font-family='${FONT_EN}'>\n<rect width="${pp.w}" height="${pp.h}" fill="#fff"/>`;
  /** 英語の紙。paper: 'a4' | 'letter'、layout: 'two' | 'one'、clock: 12 | 24 */
  function sheetsEn({ lat, lon, tz, magLimit = 4.5, layout = 'two', paper = 'a4', place = '', credit = true, clock = 12 }) {
    const m = model({ lat, lon, tz, magLimit, lang: 'en', clock });
    const pp = PAPER[paper] || PAPER.a4, L = pp === PAPER.letter, W2 = pp.w, H2 = pp.h, cx = W2 / 2;
    const ns = lat < 0 ? 'S' : 'N';
    const who = place ? `${place} (${f1(Math.abs(lat))}° ${ns})` : latLonEn(lat, lon);
    const foot = `<text x="12" y="${f1(H2 - 10)}" font-size="2.3" fill="${COL.dim}">Stars to magnitude ${magLimit}. Lines and names: 32 constellations. Star positions for J2000.0 (usable any year; error under 1° through 2050).</text>` +
      (credit ? `<text x="${f1(W2 - 12)}" y="${f1(H2 - 5)}" font-size="2.3" text-anchor="end" fill="${COL.dim}">${CREDIT_EN}</text>` : '');
    const lines = (x, y, arr, size, gap, numbered) => arr.map((t, i) => `<text x="${x}" y="${f1(y + i * gap)}" font-size="${size}" fill="${COL.ink}">${numbered ? `${i + 1}. ` : ''}${esc(t)}</text>`).join('');
    if (layout === 'one') {
      const s = 0.66, dy = L ? -2 : 0, my = L ? 198 : 207;
      return [svgOpenEn(pp) + `
<text x="12" y="12" font-size="4.6" font-weight="700" fill="${COL.ink}">Planisphere for ${esc(who)}</text>
<text x="12" y="17.5" font-size="2.6" fill="${COL.dim}">Cut out both outer circles and the gray window of the top disk (right). Join the + marks with a paper fastener.</text>
<g transform="translate(80 ${87 + dy}) scale(${s})">${diskSvg(m)}</g>
<text x="80" y="${155 + dy}" font-size="3" text-anchor="middle" fill="${COL.ink}">Star wheel (bottom disk)</text>
<g transform="translate(${f1(W2 - 60)} ${my}) scale(${s})">${maskSvg(m, { place: who })}</g>
<text x="${f1(W2 - 60)}" y="${my + 58}" font-size="3" text-anchor="middle" fill="${COL.ink}">Window (top disk)</text>
<text x="12" y="${168 + dy}" font-size="3.2" font-weight="700" fill="${COL.ink}">How to make</text>
${lines(12, 174 + dy, ['Print on card stock, or glue the paper', 'onto thin card. Cut out both outer', 'circles and the gray window (keep the', 'center circle and the thin strip).', 'Pierce the + marks and join the disks,', 'window on top, with a paper fastener.'], 2.6, 4.2)}
<text x="12" y="${203 + dy + 8}" font-size="3.2" font-weight="700" fill="${COL.ink}">How to use</text>
${lines(12, 209 + dy + 8, ['Line up the evening’s date with the time', '(standard time; after midnight, keep', 'the evening’s date). Hold it overhead,', 'the direction you face at the bottom.'], 2.6, 4.2)}
${assemblyFigEn(22, L ? 246 : 250)}
${scaleBarEn(12, L ? 261 : 276)}
${foot}
</svg>`];
    }
    const p1 = svgOpenEn(pp) + `
<text x="12" y="15" font-size="5.2" font-weight="700" fill="${COL.ink}">Planisphere: star wheel (bottom disk)</text>
<text x="12" y="21.5" font-size="3" fill="${COL.dim}">For ${esc(who)}. Cut along the outermost circle.</text>
<g transform="translate(${f1(cx)} ${L ? 128 : 150})">${diskSvg(m)}</g>
${scaleBarEn(12, L ? 240 : 262)}
<text x="12" y="${L ? 250 : 272}" font-size="2.6" fill="${COL.ink}">For a different latitude, print a new set. The window shape and the star wheel change with latitude.</text>
${foot}
</svg>`;
    const y0 = L ? 193 : 201;
    const p2 = svgOpenEn(pp) + `
<text x="12" y="15" font-size="5.2" font-weight="700" fill="${COL.ink}">Planisphere: window (top disk)</text>
<text x="12" y="21.5" font-size="3" fill="${COL.dim}">Cut along the outer circle and cut out the gray window. Keep the center circle and the thin strip.</text>
<g transform="translate(${f1(cx)} ${L ? 104 : 108})">${maskSvg(m, { place: who })}</g>
<text x="12" y="${y0}" font-size="3.4" font-weight="700" fill="${COL.ink}">How to make</text>
${lines(12, y0 + 6, EN_MAKE, 2.8, 4.8, true)}
<text x="12" y="${y0 + 25}" font-size="3.4" font-weight="700" fill="${COL.ink}">How to use</text>
${lines(12, y0 + 31, EN_USE, 2.8, 4.8, true)}
${assemblyFigEn(f1(W2 - 110), L ? 249.5 : 257)}
${scaleBarEn(12, L ? 261 : 276)}
${foot}
</svg>`;
    return [p1, p2];
  }

  const api = { JST_MERIDIAN, JST_OFFSET_H, REF_YEARS, EPOCH, LAT_MIN, LAT_MAX, LON_MIN, LON_MAX, G, PRESETS, MONTH_DAYS, CREDIT,
    EN_LAT_MIN, EN_LAT_MAX, TZ_MIN, TZ_MAX, PAPER, EN_PRESETS, CREDIT_EN, MONTH_EN, hourEn, latLonEn, tzEn, sheetsEn,
    model, rOf, decOf, dateAngle, timeAngle, fromMidnight, jstParts, nightOf, rotationFor, diskXY, skyXY, maskToHaDec, haDecToAltAz, altAzToHaDec,
    horizonXY, horizon, inside, allStars, starLabel, conCenter, diskSvg, maskSvg, sheets, starRadius };
  if (isNode) module.exports = api; else root.Hayamiban = api;
})(typeof window !== 'undefined' ? window : globalThis);
