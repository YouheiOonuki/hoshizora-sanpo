// 星座の由来の読み上げ（yorozu-plans ROADMAP 7.36.1 K140）: 読み（かな）・録音がそろう・大きさ・利用時に AI を呼ばない・ページの最初の読み込みに音声が入らない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../tools/shinwa-data.js');
const { YOMI, CHECKED } = require('../tools/shinwa-yomi.js');

const ROOT = path.join(__dirname, '..');
const INDEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'shinwa', 'audio', 'index.json'), 'utf8'));

test('読み: 12 話すべて、本文（shinwa-data.js）と同じ段で、読みに漢字が残っていない。辞書の読み違いを直した語（祭暦→さいれき）', () => {
  assert.match(CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(YOMI.map((s) => s.slug), D.STORIES.map((s) => s.slug));
  for (const s of YOMI) {
    const st = D.STORIES.find((x) => x.slug === s.slug);
    assert.equal(s.parts.length, 2 + st.secs.reduce((a, [, ps]) => a + 1 + ps.length, 0), s.slug);
    for (const p of s.parts) assert.doesNotMatch(p.yomi, /[一-鿿]/, `${s.slug}: ${p.yomi.slice(0, 20)}`);
  }
  const all = YOMI.flatMap((s) => s.parts);
  assert.ok(all.some((p) => p.text.includes('祭暦') && p.yomi.includes('さいれき')));
  assert.ok(!all.some((p) => p.yomi.includes('まつりれき')));
});

test('録音: 12 話の mp3 がそろい、index.json と大きさが合う。合計は 25 MB よりずっと小さい', () => {
  assert.deepEqual(Object.keys(INDEX.files).sort(), D.STORIES.map((s) => s.slug).sort());
  let total = 0;
  for (const [slug, f] of Object.entries(INDEX.files)) {
    const p = path.join(ROOT, 'shinwa', 'audio', slug + '.mp3');
    assert.equal(fs.statSync(p).size, f.bytes, slug);
    const h = fs.readFileSync(p).subarray(0, 3);
    assert.ok(h.toString('latin1') === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0), slug + ' は mp3');
    total += f.bytes;
  }
  assert.ok(total < 25 * 1024 * 1024, `${(total / 1024 / 1024).toFixed(2)} MB`);
});

test('ページ: 各話に「🔊 読んでもらう」と listen.js。audio 要素・preload は無い（押したときに読む）', () => {
  for (const s of D.STORIES) {
    const html = fs.readFileSync(path.join(ROOT, 'shinwa', 'seiza', s.slug + '.html'), 'utf8');
    assert.ok(html.includes(`data-audio="../audio/${s.slug}.mp3"`), s.slug);
    assert.ok(html.includes('<script src="../listen.js" defer></script>'), s.slug);
    assert.doesNotMatch(html, /<audio|rel="preload"[^>]*\.mp3/, s.slug);
  }
});

test('利用時に AI を呼ばない: listen.js に外への送信が無く、録音を Audio で読むだけ', () => {
  const js = fs.readFileSync(path.join(ROOT, 'shinwa', 'listen.js'), 'utf8');
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|ai\/run|workers\.dev|api\.cloudflare|localStorage/);
  assert.match(js, /new Audio\(b\.getAttribute\('data-audio'\)\)/);
});
