'use strict';
/* 月の出・月の入り（tsuki/moonrise.js）を国立天文台 暦計算室「各地のこよみ」の表と突き合わせる。
   表は tests/fixtures/naoj-moon.json（2026-10-03 取得。札幌・東京・大阪・福岡・那覇の 10 か月分）
   実行: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../tsuki/moonrise.js');
const NAOJ = require('./fixtures/naoj-moon.json');

const toMin = (s) => { if (s === '--:--') return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };

for (const T of NAOJ.tables) {
  test(`国立天文台の表と一致 ${T.place} ${T.y}年${T.m}月`, () => {
    for (const r of T.rows) {
      const d = Number(r[0]);
      const res = R.moonDay(T.y, T.m, d, T.lat, T.lon);
      const pairs = [['出', r[1], res.rise], ['南中', r[3], res.transit], ['入り', r[5], res.set]];
      for (const [name, ref, ev] of pairs) {
        const a = toMin(ref), b = ev ? toMin(R.hm(ev.ms)) : null;
        assert.equal(b === null, a === null, `${d}日 ${name}: 表 ${ref} 計算 ${ev ? R.hm(ev.ms) : '--:--'}`);
        if (a !== null) assert.ok(Math.abs(a - b) <= 1, `${d}日 ${name}: 表 ${ref} 計算 ${R.hm(ev.ms)}（1 分以内）`);
      }
      if (res.rise) assert.ok(Math.abs(res.rise.az - Number(r[2])) <= 0.2, `${d}日 出の方位 ${r[2]} / ${res.rise.az.toFixed(2)}`);
      if (res.set) assert.ok(Math.abs(res.set.az - Number(r[6])) <= 0.2, `${d}日 入りの方位 ${r[6]} / ${res.set.az.toFixed(2)}`);
      if (res.transit) assert.ok(Math.abs(res.transit.alt - Number(r[4])) <= 0.2, `${d}日 南中高度 ${r[4]} / ${res.transit.alt.toFixed(2)}`);
      assert.ok(Math.abs(res.age - Number(r[7])) <= 0.1, `${d}日 月齢 ${r[7]} / ${res.age.toFixed(2)}`);
    }
  });
}

test('16 方位と時刻の書き方', () => {
  assert.equal(R.dir16(0), '北'); assert.equal(R.dir16(56.3), '東北東'); assert.equal(R.dir16(90), '東');
  assert.equal(R.dir16(302.5), '西北西'); assert.equal(R.dir16(354), '北'); assert.equal(R.dir16(348.7), '北北西');
  assert.equal(R.hm(Date.UTC(2026, 9, 1, 11, 9, 29)), '20:09');
  assert.equal(R.hm(Date.UTC(2026, 9, 1, 11, 9, 31)), '20:10');
  assert.equal(R.hm(null), '--:--');
});

test('1 か月の表は日数どおり（うるう年の 2 月を含む）', () => {
  assert.equal(R.moonMonth(2028, 2, 35.68, 139.77).length, 29);
  assert.equal(R.moonMonth(2026, 2, 35.68, 139.77).length, 28);
});

test('ページの決まり: 保存しない・共通ページへのリンク・ビーコン・sitemap と sw', () => {
  const root = path.join(__dirname, '..');
  const js = fs.readFileSync(path.join(root, 'tsuki', 'app.js'), 'utf8') + fs.readFileSync(path.join(root, 'tsuki', 'moonrise.js'), 'utf8');
  assert.ok(!/localStorage|indexedDB/.test(js.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), '保存しない');
  for (const f of ['index.html', 'guide.html']) {
    const h = fs.readFileSync(path.join(root, 'tsuki', f), 'utf8');
    assert.ok(h.includes('href="../../about.html"') && h.includes('href="../../privacy-policy.html"'), f);
    assert.equal((h.match(/beacon\.min\.js/g) || []).length, 1, f);
    // index.html は AdSense 審査中（2026-10-04）なので広告 script を外し meta だけ
    assert.equal((h.match(/adsbygoogle\.js\?client=/g) || []).length, f === 'index.html' ? 0 : 1, f);
    assert.equal((h.match(/name="google-adsense-account"/g) || []).length, 1, f);
    assert.ok(h.includes(`<link rel="canonical" href="https://yorozu-craft.com/hoshizora-sanpo/tsuki/${f === 'index.html' ? '' : f}">`), f);
  }
  const sm = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.ok(sm.includes('/hoshizora-sanpo/tsuki/</loc>') && sm.includes('/hoshizora-sanpo/tsuki/guide.html</loc>'));
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const f of ['./tsuki/', './tsuki/moonrise.js', './tsuki/app.js', './tsuki/tsuki.css']) assert.ok(sw.includes(`'${f}'`), f);
});
