'use strict';
/* 新月カレンダー（日英）は、全部の行が同じ文になるメモの列を持たず、表の前に 1 文を置く。
   満月カレンダーのメモの列は、行ごとに違う注記が入るので残す（yorozu-plans ROADMAP 7.269 Q-1094）。
   実行: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const table = html => html.match(/<table class="evtable">[\s\S]*?<\/table>/)[0];
const before = html => html.slice(0, html.indexOf('<div class="scroll"'));

test('新月カレンダー（日本語）: メモの列が無く、表の前に 1 文', () => {
  const html = read('calendar/new-moon.html'), t = table(html);
  assert.ok(!t.includes('<th>メモ</th>'), 'メモの見出しが残っている');
  assert.ok(!t.includes('月明かりがなく、星空の観察に向いた時期'), 'メモの文が表に残っている');
  assert.ok(before(html).includes('<p>新月の前後は月明かりが無く、暗い星まで見えます。</p>'), '表の前の 1 文が無い');
  const cells = [...t.matchAll(/<tr data-date[^>]*>([\s\S]*?)<\/tr>/g)].map(m => (m[1].match(/<td/g) || []).length);
  assert.ok(cells.length > 0 && cells.every(n => n === 3), '行のセルが 3 つでない: ' + cells.join(','));
});

test('新月カレンダー（英語）: Note の列が無く、表の前に 1 文', () => {
  const html = read('en/calendar/new-moon.html'), t = table(html);
  assert.ok(!t.includes('<th>Note</th>'), 'Note の見出しが残っている');
  assert.ok(!t.includes('No moonlight: a good time for stargazing'), 'Note の文が表に残っている');
  assert.ok(before(html).includes('<p>Around a new moon the sky is free of moonlight, so faint stars are easier to see.</p>'), '表の前の 1 文が無い');
});

test('満月カレンダー（日英）のメモの列は残す', () => {
  assert.ok(table(read('calendar/full-moon.html')).includes('<th>メモ</th>'));
  assert.ok(table(read('en/calendar/full-moon.html')).includes('<th>Note</th>'));
});
