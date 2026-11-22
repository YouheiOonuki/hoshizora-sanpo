'use strict';
/* 審査員の目で広告 script を外した読み物 5 枚（yorozu-plans ROADMAP 7.269・D863・Q-1093）。
   生成したページ（コミットされているもの）に広告 script が無く、所有確認の meta は 1 つ残り、空の広告枠も無いこと。
   隣の読み物（満月・神の一覧）は広告 script のまま（外すのはこの 5 枚だけ）。実行: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SCRIPT = /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/g;
const META = /<meta name="google-adsense-account" content="ca-pub-5375267956079717">/g;
const NO_AD = ['shinwa/index.html', 'shinwa/keizu.html', 'shinwa/hyoki.html', 'calendar/new-moon.html', 'en/calendar/new-moon.html'];

test('広告を外した 5 枚: script 0・meta 1・広告の枠 0', () => {
  for (const f of NO_AD) {
    const s = read(f);
    assert.equal((s.match(SCRIPT) || []).length, 0, f);
    assert.equal((s.match(META) || []).length, 1, f);
    assert.doesNotMatch(s, /<ins class="adsbygoogle"/, f);
  }
});

test('隣の読み物は広告 script のまま（満月・神の一覧・英語の満月）', () => {
  for (const f of ['calendar/full-moon.html', 'shinwa/kamigami.html', 'en/calendar/full-moon.html']) assert.equal((read(f).match(SCRIPT) || []).length, 1, f);
});
