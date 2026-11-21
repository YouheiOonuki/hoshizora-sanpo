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
