'use strict';
// フル版（hoshizora-night）への 1 行（yorozu-plans ROADMAP 7.15 の要件 5・K132）。フル版の側には「軽い版」の 1 行がある
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('プラネタリウムの画面（日英）から、フル版へ 1 本ずつ', () => {
  assert.strictEqual(read('index.html').split('<a href="/hoshizora-night/">フル版を見る</a>').length, 2);
  assert.strictEqual(read('en/index.html').split('<a href="/hoshizora-night/en/">Full version</a>').length, 2);
});

test('Service Worker はフル版のファイルを扱わない（キャッシュ規則を混ぜない）', () => {
  const sw = read('sw.js');
  assert.ok(!sw.includes('hoshizora-night'));
  assert.ok(sw.includes("if (!url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;"));
});
