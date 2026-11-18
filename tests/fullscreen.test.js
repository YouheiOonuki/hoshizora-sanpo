'use strict';
// 下へ送れない全画面のページは、自分の <body> の data-fullscreen で名乗る（yorozu-plans QUEUE 2026-11-19 朝の条件 28・Q-563）。
// root の build-near.mjs は、この印のあるページに「近い道具」の欄を差し込まない（Q-564）。
// FULLSCREEN は、全ページの <body> の終わりへ scrollIntoView で送って見えなかったページ（390・1,280 幅、2026-11-19 に測った。108 ページ中 2）。
// s/*.html も測りには出たが、開くとすぐ入口へ移る着地ページ（location.replace）で、見えなかったのは移った先の入口。自分の body はリンク 1 行
// 全画面のページを足す・やめるときは、測り直してここと <body> の両方を直す
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FULLSCREEN = ['en/index.html', 'index.html'];
const SKIP = new Set(['node_modules', 'tests', 'tools']);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => e.name.startsWith('.') || SKIP.has(e.name) ? []
    : e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.html') ? [path.join(dir, e.name)] : []);
const bodyTag = (html) => (html.match(/<body\b[^>]*>/) || [''])[0];

test('data-fullscreen の在るページ ＝ 終わりへ送っても見えないページ', () => {
  const marked = walk(ROOT)
    .filter((f) => /\sdata-fullscreen(?=[\s>])/.test(bodyTag(fs.readFileSync(f, 'utf8'))))
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
    .sort();
  assert.deepStrictEqual(marked, FULLSCREEN);
});

test('印は値を持たない（data-fullscreen だけ）', () => {
  for (const f of FULLSCREEN) assert.match(bodyTag(fs.readFileSync(path.join(ROOT, f), 'utf8')), /\sdata-fullscreen(>|\s)/);
  for (const f of FULLSCREEN) assert.doesNotMatch(bodyTag(fs.readFileSync(path.join(ROOT, f), 'utf8')), /data-fullscreen=/);
});
