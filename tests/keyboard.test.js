'use strict';
// キーボードで星を選ぶ・クイズに答える（Q-466。フル版 hoshizora-night の Q-438 と同じ形）
// 空の絵にフォーカスがある間だけまん中に的を出し、Enter・Space はまん中の点を handleTap に渡す（星を決める計算を 2 つ持たない）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('日英の画面: まん中の的（読み上げない・既定で隠す）と、説明の箱は読み上げに届く', () => {
  for (const p of ['index.html', 'en/index.html']) {
    const html = read(p);
    assert.ok(html.includes('<div id="aim" class="aim" aria-hidden="true" hidden></div>'), p);
    assert.ok(html.includes('<div id="sheetBody" aria-live="polite"></div>'), p);
  }
  assert.match(read('style.css'), /\.aim\[hidden\]\{display:none;\}/);
});

test('Enter・Space は空の絵にフォーカスがある間だけ、まん中の点を handleTap に渡す。handleTap は 1 つだけ', () => {
  const app = read('main.js');
  assert.ok(app.includes("if(e.target===cv && (e.key==='Enter'||e.key===' '))"));
  assert.ok(app.includes('handleTap(b.left+b.width/2,b.top+b.height/2)'));
  assert.equal((app.match(/function handleTap\(/g) || []).length, 1);
  assert.equal((app.match(/function quizTap\(/g) || []).length, 1);
});

test('使い方（日・英）にキーボードの 1 行', () => {
  assert.ok(read('about.html').includes('<dt>キーボード</dt><dd>見たい星を画面のまん中に合わせて Enter を押します。</dd>'));
  assert.ok(read('en/guide.html').includes('<li>Keyboard: Use the arrow keys to move a star to the center of the screen, then press Enter.</li>'));
});
