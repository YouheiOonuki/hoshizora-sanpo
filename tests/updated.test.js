'use strict';
/* カレンダーの基準日（Q-224）: 生成したページの「次の〜」と dateModified が、確認日（official-events.js の CHECKED）から出ていること。
   日付を build-pages.js に固定で持つと、確認日を進めても「次の満月」に済んだ現象が残る。
   実行: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const O = require('../tools/official-events.js');

const ROOT = path.join(__dirname, '..');
const pages = dir => fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.html')).map(f => path.join(dir, f));
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

test('build-pages.js は基準日を固定の日付で持たない', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'build-pages.js'), 'utf8');
  assert.match(src, /const UPDATED = require\('\.\/official-events\.js'\)\.CHECKED;/);
});

test('「次の〜」に確認日より前の日付が無い（日本語版・英語版）', () => {
  let seen = 0;
  for (const f of [...pages('calendar'), ...pages(path.join('en', 'calendar'))]) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of html.matchAll(/data-next="[a-z]+">([^<]*)</g)) {
      const ja = m[1].match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      const en = m[1].match(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/);
      // 英語版の UTC 表記は日本時間より前の日付になることがあるので、1 日の余裕を見る
      const date = ja ? iso(ja[1], ja[2], ja[3]) : en ? iso(en[3], MONTHS[en[1]], en[2]) : null;
      assert.ok(date, `${f}: 日付が読めない「${m[1]}」`);
      const floor = ja ? O.CHECKED : new Date(Date.parse(O.CHECKED) - 864e5).toISOString().slice(0, 10);
      assert.ok(date >= floor, `${f}: ${m[1]} が確認日 ${O.CHECKED} より前`);
      seen++;
    }
  }
  assert.ok(seen > 0, '「次の〜」が 1 つも見つからない');
});

test('英語版カレンダーの dateModified が確認日と同じ', () => {
  let seen = 0;
  for (const f of pages(path.join('en', 'calendar'))) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of html.matchAll(/"dateModified": "([0-9-]+)"/g)) { assert.strictEqual(m[1], O.CHECKED, f); seen++; }
  }
  assert.ok(seen > 0);
});
