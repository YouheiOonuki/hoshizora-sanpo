'use strict';
// 押す所の大きさ 44 px・間 8 px（yorozu-plans QUEUE Q-760）。tap-measure.mjs で測った直しを、CSS の規則として残す。
// 下の案内（footer.site nav a）は 23.8 px、早見盤の折りたたみ（details.opt summary）は 32 px だった
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rule = (file, sel) => {
  const css = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('(?:^|\\n)' + esc + '\\{([^}]*)\\}'));
  assert.ok(m, `${file} に ${sel} の規則が無い`);
  return m[1];
};
const px = (body, prop) => { const m = body.match(new RegExp('(?:^|;)\\s*' + prop + ':\\s*(\\d+)px')); return m ? Number(m[1]) : null; };

test('下の案内のリンクは高さ・幅 44 px 以上、縦の間 8 px 以上', () => {
  const a = rule('pages.css', 'footer.site nav a');
  assert.ok(px(a, 'min-height') >= 44);
  assert.ok(px(a, 'min-width') >= 44);
  const nav = rule('pages.css', 'footer.site nav');
  const gap = nav.match(/gap:\s*(\d+)px/);
  assert.ok(gap && Number(gap[1]) >= 8, '縦の間');
});

test('早見盤の折りたたみの見出しは高さ 44 px 以上', () => {
  assert.ok(px(rule('hayamiban/hayamiban.css', 'details.opt summary'), 'min-height') >= 44);
});

// Q-809: Q-760 の後に画面に残った押す所（リンクだけの行 19〜24 px、en の A4 の丸 38 px 幅、消すボタン 40 px、間 0〜6 px）
test('早見盤（日本語・英語）の画面の押す所は 44 px、間 8 px 以上', () => {
  const f = 'hayamiban/hayamiban.css';
  assert.ok(px(rule(f, '.hint>a[href="../../print-help.html"],#pv-link,main.wrap>p>a[href="./guide.html"]'), 'min-height') >= 44);
  assert.ok(px(rule(f, '.btn-reset'), 'min-height') >= 44);
  assert.ok(px(rule(f, '.seg label'), 'min-width') >= 44);
  assert.ok(px(rule(f, '.seg+.check'), 'margin-top') >= 8);
  assert.ok(px(rule(f, '.custom+.hint,#about-tool+p'), 'margin-top') >= 8);
  const gap = rule(f, '.seg').match(/gap:\s*(\d+)px/);
  assert.ok(gap && Number(gap[1]) >= 8, '丸どうしの縦の間');
});

test('月の出入りの画面の押す所は 44 px、間 8 px 以上', () => {
  const f = 'tsuki/tsuki.css';
  assert.ok(px(rule(f, '.hint>a[href="./guide.html"],#sky-link,main.wrap>p>a[href="./guide.html"]'), 'min-height') >= 44);
  assert.ok(px(rule(f, '#sky-link-p,#about-tool+p'), 'margin-top') >= 8);
  const m = rule(f, 'details.month').match(/margin:\s*\d+px\s+0\s+(\d+)px/);
  assert.ok(m && Number(m[1]) >= 8, '1 か月の表と道具の説明の間');
});
