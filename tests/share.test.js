'use strict';
// 共有される結果（yorozu-plans K124・企画書 60、ACCEPTANCE 3 章「束 B」）: プラネタリウムの「この空」と星座早見盤
// #<緯度>,<経度>,<UNIX 秒>（ROADMAP 7.15.1 の 8。フル版 K132 も同じ形）、月ごとの着地ページと OG 画像（12 ずつ）、結果カードの部品
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const S = require('../sky-share.js');
const ShareCard = require('../share-card.js');
const { LOCS, LOCS_WORLD } = require('../data.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const PLACES = [...LOCS, ...LOCS_WORLD.filter((l) => !LOCS.includes(l))];
const AT = Date.parse('2026-10-02T12:04:00Z');
const tokyo = LOCS.find((l) => l.id === 'tokyo');

test('一覧の都市は緯度・経度をそのまま入れ、開くと同じ都市に戻る', () => {
  const h = S.encode(tokyo, AT, PLACES);
  assert.equal(h, '#35.681,139.767,1790942640');
  const d = S.decode(h, PLACES);
  assert.equal(d.place, tokyo);
  assert.equal(d.ms, AT);
  for (const l of PLACES) assert.equal(S.decode(S.encode(l, AT, PLACES), PLACES).place, l, l.id);
});

test('一覧に無い場所（いまいる場所・入れた緯度経度）は 1 度単位に丸める（住んでいる所を URL に出さない）', () => {
  assert.equal(S.encode({ lat: 35.4, lon: 139.6 }, AT, PLACES), '#35,140,1790942640');
  assert.equal(S.encode({ lat: -33.6, lon: -70.7 }, AT, PLACES), '#-34,-71,1790942640');
  const d = S.decode('#35,140,1790942640', PLACES);
  assert.equal(d.place, null);
  assert.deepEqual([d.lat, d.lon], [35, 140]);
  assert.equal(S.tzFor(35, 140, 'Europe/London'), 'Asia/Tokyo');
  assert.equal(S.tzFor(51, 0, 'Europe/London'), 'Europe/London');
});

test('読めない・範囲の外の # は null', () => {
  for (const h of ['', '#', '#35,140', '#95,140,1790942640', '#35,190,1790942640', '#35,140,99', '#35,140,9999999999', '#a,b,c', '#35.1234,140,1790942640']) assert.equal(S.decode(h, PLACES), null, h);
});

test('種類 = その土地の暦の月。日本時間の 1 日 0 時台は日本の月', () => {
  assert.equal(S.kind(Date.parse('2026-09-30T15:30:00Z'), 'Asia/Tokyo'), '10');
  assert.equal(S.kind(Date.parse('2026-09-30T15:30:00Z'), 'Europe/London'), '09');
  assert.equal(S.KINDS.length, 12);
});

test('着地ページと OG 画像: 月ごとに 12（プラネタリウム s/、早見盤 hayamiban/s/）、1200×630、noindex・広告スクリプトなし・すぐ道具へ', () => {
  const jpegSize = (b) => { // SOF0/SOF2 の高さ・幅
    for (let i = 2; i < b.length;) { const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m === 0xc0 || m === 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + len; }
    return null;
  };
  for (const [dir, url] of [['s', 'https://yorozu-craft.com/hoshizora-sanpo/s/'], ['hayamiban/s', 'https://yorozu-craft.com/hoshizora-sanpo/hayamiban/s/']]) {
    assert.deepEqual(fs.readdirSync(path.join(ROOT, dir)).sort(), S.KINDS.flatMap((k) => [k + '.html', k + '.jpg']).sort(), dir);
    for (const k of S.KINDS) {
      const b = fs.readFileSync(path.join(ROOT, dir, k + '.jpg'));
      assert.deepEqual(jpegSize(b), [1200, 630], dir + '/' + k);
      assert.ok(b.length < 300 * 1024, dir + '/' + k + ' が大きい');
      const s = read(dir + '/' + k + '.html');
      assert.match(s, /<meta name="robots" content="noindex">/);
      assert.ok(s.includes(`<meta property="og:image" content="${url}${k}.jpg">`), dir + '/' + k);
      assert.ok(s.includes('<meta property="og:image:type" content="image/jpeg">'));
      assert.ok(s.includes('<script>location.replace("../" + location.hash);</script>'));
      assert.doesNotMatch(s, /adsbygoogle|pagead2/);
    }
  }
  assert.ok(!read('sitemap.xml').includes('/s/'));
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-share.mjs'), '--check']);
});

test('画面: 共有のボタンと部品。プラネタリウムに外のリンクを足していない（遊ぶ画面 R7・広告なしのまま）', () => {
  const h = read('index.html');
  assert.ok(h.includes('id="bShare"') && h.includes('<script src="./sky-share.js"></script>') && h.includes('<script src="./share-card.js"></script>'));
  assert.doesNotMatch(h, /github\.com|x\.com|twitter\.com|note\.com|adsbygoogle/);
  assert.ok(read('en/index.html').includes('<script src="../sky-share.js"></script>'), '英語版も # で開ける');
  const hy = read('hayamiban/index.html');
  assert.ok(hy.includes('id="share-btn"') && hy.includes('<script src="../share-card.js"></script>'));
  // カードは印刷ボタンより後ろ（印刷ボタンまでの距離を変えない）
  assert.ok(hy.indexOf('id="print"') < hy.indexOf('id="share-btn"'));
  const s = read('share-card.js');
  assert.doesNotMatch(s, /https?:\/\//);
  assert.doesNotMatch(s, /\bfetch\(|XMLHttpRequest|sendBeacon|<script|\.src\s*=/);
  assert.equal((s.match(/@keyframes/g) || []).length, 1);
  assert.match(s, /@media \(prefers-reduced-motion:reduce\)\{\.share-card\{animation:none\}\}/);
  // プラネタリウムでは、演出は説明シートが上がる 1 つだけ（シートは reduced-motion で止まる）
  assert.match(read('style.css'), /#sheet \.share-card\{animation:none;/);
  assert.match(read('style.css'), /@media \(prefers-reduced-motion:reduce\)\{#sheet,#sheet\.open\{transition:none;\}\}/);
  assert.equal(ShareCard.fmtWhen(AT, 'Asia/Tokyo'), '2026年10月2日 21:04');
  const sw = read('sw.js');
  assert.ok(sw.includes("'./sky-share.js'") && sw.includes("'./share-card.js'"));
});
