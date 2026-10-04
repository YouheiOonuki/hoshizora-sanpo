'use strict';
/* 星座図鑑の「見つけ方」「見ごろの季節と時刻」「明るい星」（tools/zukan-sky.js）を確かめる。
   - 南中の日・高さ・「高く見える月」を、astro.js とは別に書いた恒星時の式（Meeus 12.4）で計算し直して突き合わせる
   - 生成したページ（zukan/*.html、コミットされているもの）に計算どおりの数字が入っていること
   - ページ同士の重なり（5 文字 shingle の Jaccard）が上限を超えないこと（AdSense「有用性の低いコンテンツ」対策、2026-10-04）
   実行: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Z = require('../tools/zukan-sky.js');
const { CONS } = require('../data.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DEG = Math.PI / 180;
const LAT = Z.TOKYO.lat, LON = Z.TOKYO.lon;

/* astro.js を使わない恒星時（Meeus『Astronomical Algorithms』12.4）と高度 */
function lstDeg(ms) {
  const jd = ms / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
  const g = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - T ** 3 / 38710000;
  return (((g + LON) % 360) + 360) % 360;
}
function alt(eq, ms) {
  const H = (lstDeg(ms) - eq[0] / DEG) * DEG, d = eq[1], f = LAT * DEG;
  return Math.asin(Math.sin(d) * Math.sin(f) + Math.cos(d) * Math.cos(f) * Math.cos(H)) / DEG;
}
const hourAngle = (eq, ms) => { const h = ((lstDeg(ms) - eq[0] / DEG) % 360 + 540) % 360 - 180; return h; };
const jst = (m, d, h) => Date.UTC(Z.REF_YEAR, m - 1, d, h - 9);

for (const c of CONS) {
  test(`見ごろの数字を別の式で確かめる: ${c.jp}`, () => {
    const s = Z.season(c), eq = Z.centerEq(c);
    // 20 時・21 時に南中する日: その日の時角は ±0.6° 以内（1 日で約 1° ずれる）で、前後の日より 0 に近い
    for (const [h, p] of [[20, s.at20], [21, s.at21]]) {
      const H0 = Math.abs(hourAngle(eq, jst(p.m, p.d, h)));
      assert.ok(H0 <= 0.6, `${h}時 ${p.m}/${p.d} の時角 ${H0.toFixed(2)}°`);
      assert.ok(Math.abs(hourAngle(eq, jst(p.m, p.d, h) - 86400000)) > H0 && Math.abs(hourAngle(eq, jst(p.m, p.d, h) + 86400000)) > H0);
    }
    // 南中高度: 1 日を 1 分刻みで調べた最大と 90 − |緯度 − 赤緯| が合う
    let mx = -90; for (let t = jst(1, 1, 0); t < jst(1, 2, 0); t += 60000) mx = Math.max(mx, alt(eq, t));
    assert.ok(Math.abs(mx - s.top) <= 0.6, `南中高度 ${mx.toFixed(2)} / ${s.top}`);
    // 高く見える月: 毎月 15 日の 20 時と 21 時の両方で「南中高度 − 15°」以上かつ 15° 以上
    const want = [];
    if (s.top >= Z.MIN_ALT) for (let m = 1; m <= 12; m++) {
      const a = Math.min(alt(eq, jst(m, 15, 20)), alt(eq, jst(m, 15, 21)));
      if (a >= Math.max(Z.MIN_ALT, 90 - Math.abs(LAT - eq[1] / DEG) - Z.HIGH_MARGIN)) want.push(m);
    }
    assert.deepEqual(s.high, want);
    // 出・入りの方位: cos A = sin δ / cos φ
    if (s.rs && s.rs.rise) {
      const A0 = Math.acos(Math.sin(eq[1]) / Math.cos(LAT * DEG)) / DEG;
      assert.ok(Math.abs(s.rs.rise.az - A0) < 0.5 && Math.abs(s.rs.set.az - (360 - A0)) < 0.5, `出 ${s.rs.rise.az.toFixed(1)} 入り ${s.rs.set.az.toFixed(1)} / ${A0.toFixed(1)}`);
    }
  });
}

test('ページに計算どおりの見ごろが入っている（生成し直し忘れの検出）', () => {
  for (const c of CONS) {
    const s = Z.season(c), html = read(`zukan/${c.id}.html`);
    if (s.top >= 0) assert.ok(html.includes(`20時なら${s.at20.m}月${s.at20.d}日ごろ、21時なら${s.at21.m}月${s.at21.d}日ごろ`), `${c.id} の南中の日`);
    assert.ok(html.includes('<h2>見ごろの季節と時刻</h2>') && html.includes('<h2>見つけ方</h2>'), c.id);
    const g = Z.guide(c);
    for (const a of g.anchors) assert.ok(html.includes(`${a.con}の${a.name}`) && html.includes(`約${a.sep}°`), `${c.id} の目印 ${a.name}`);
  }
});

test('よく知られた見え方と合う（向きの計算の確かめ）', () => {
  // オリオン座: 東京の夜 9 時に南中するのは 1 月下旬（data.js の子ども向けの文「ひだりうえの あかい ほし」＝ リゲルの左上にベテルギウス）
  const ori = CONS.find(c => c.id === 'ori');
  assert.equal(Z.season(ori).at21.m, 1);
  assert.equal(Z.guide(ori).inner.find(x => x.name === 'ベテルギウス').word, '左上');
  // 北極星: メラク → ドゥーベの間隔の約 5 倍
  const p = Z.pointerToPolaris();
  assert.ok(p.ratio > 4.5 && p.ratio < 6 && p.offset < 10, JSON.stringify(p));
  // みなみじゅうじ座は東京では昇らない。こぐま座は沈まない
  assert.ok(Z.season(CONS.find(c => c.id === 'cru')).top < 0);
  assert.ok(Z.season(CONS.find(c => c.id === 'umi')).allUp);
  // さそり座は東京で南中高度が低い（約 20°）
  assert.ok(Math.abs(Z.season(CONS.find(c => c.id === 'sco')).top - 20) <= 2);
});

/* ページ同士の重なり */
function mainText(f) {
  const t = read(f), m = t.match(/<main[\s\S]*?<\/main>/)[0];
  return m.replace(/<(svg|script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, '');
}
const shingles = s => { const out = new Set(); for (let i = 0; i + 5 <= s.length; i++) out.add(s.slice(i, i + 5)); return out; };
const jaccard = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
function maxJ(files) {
  const S = files.map(f => shingles(mainText(f))); let mx = 0, sum = 0, n = 0;
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) { const v = jaccard(S[i], S[j]); mx = Math.max(mx, v); sum += v; n++; }
  return { max: mx, mean: sum / n };
}
test('星座図鑑のページ同士の重なりが小さい（5 文字 shingle の Jaccard、直す前は平均 0.212・最大 0.304）', () => {
  const r = maxJ(CONS.map(c => `zukan/${c.id}.html`));
  assert.ok(r.max < 0.3 && r.mean < 0.2, JSON.stringify(r));
});
test('三大流星群のページ同士の重なりが小さい（直す前は平均 0.603・最大 0.613）', () => {
  const r = maxJ(['perseids', 'geminids', 'quadrantids'].map(id => `calendar/${id}.html`));
  assert.ok(r.max < 0.5, JSON.stringify(r));
});
test('星座図鑑の各ページに広告の script が無い（審査中、所有確認の meta だけ）', () => {
  for (const c of CONS) assert.ok(!read(`zukan/${c.id}.html`).includes('adsbygoogle.js'), c.id);
});
