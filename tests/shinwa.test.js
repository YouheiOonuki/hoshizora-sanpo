'use strict';
/* ギリシャ神話の読み物（shinwa/。K119）の突き合わせ。実行: node --test tests/*.test.js
   - 固有名の表記: 本文のカタカナが表記の一覧（tools/shinwa-data.js の NAMES ほか）に無いものは 0 件。使わない表記も 0 件
   - 星座の話 12 本と星座図鑑が両向きにリンクしていて、リンク先のファイルがある
   - 元素の名前の由来がクイズ広場（K89）の元素の一言と食い違わない（tests/fixtures/k89-genso.json は K89 からの写し）
   - 出典の鍵・系図の親子のつじつま
   ページは tools/build-pages.js で作ったもの（コミットされているもの）を読む */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const D = require('../tools/shinwa-data.js');
const { CONS } = require('../data.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const shinwaFiles = () => {
  const out = [];
  const walk = d => fs.readdirSync(path.join(ROOT, d)).forEach(n => {
    const f = path.posix.join(d, n);
    if (fs.statSync(path.join(ROOT, f)).isDirectory()) walk(f); else if (n.endsWith('.html')) out.push(f);
  });
  walk('shinwa');
  return out.sort();
};
/** <main> の見えている文字（script と、使わない表記の欄 class="variant" を除く） */
function mainText(html) {
  let m = (html.match(/<main[\s\S]*?<\/main>/) || [''])[0];
  m = m.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<(td|span) class="variant">[\s\S]*?<\/\1>/g, '');
  return m.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}
/** カタカナの語を取り出す。「〇〇座」は座まで含めて 1 語にする。中黒・＝で区切る */
function katakanaWords(text) {
  const words = [];
  for (const m of text.matchAll(/[ァ-ヶー]+(座)?/g)) {
    const w = m[0];
    if (/^ー+$/.test(w)) continue;
    words.push(w);
  }
  return words;
}

test('ページが 18 枚ある（入口・系図・神の一覧・名前の由来・表記の一覧・星座の由来の一覧＋話 12 本）', () => {
  const files = shinwaFiles();
  assert.strictEqual(files.length, 18, files.join(', '));
  for (const s of D.STORIES) assert.ok(files.includes(`shinwa/seiza/${s.slug}.html`), s.slug);
  assert.strictEqual(D.STORIES.length, 12);
});

test('表記の一覧に重複が無く、使わない表記がほかの名の表記と重ならない', () => {
  const canon = new Map();
  for (const [ja] of D.NAMES) { assert.ok(!canon.has(ja), `重複: ${ja}`); canon.set(ja, true); }
  for (const [ja, , , vs] of D.NAMES) for (const v of vs || []) {
    assert.ok(!canon.has(v), `${ja} の使わない表記「${v}」が、別の名の表記と同じ`);
    assert.notStrictEqual(v, ja);
  }
});

test('本文のカタカナはすべて表記の一覧にある（一覧に無い表記が本文に 0 件）', () => {
  const allowed = new Set([...D.NAMES.map(n => n[0]), ...D.ASTRO, ...D.GENERAL, ...CONS.map(c => c.jp)]);
  const missing = new Map();
  for (const f of shinwaFiles()) {
    for (const w of katakanaWords(mainText(read(f)))) {
      if (allowed.has(w)) continue;
      // 「アテナイから」のように語の後ろに助詞が続くのはカタカナの外なので、ここに来るのは一覧に無い語だけ
      if (!missing.has(w)) missing.set(w, f);
    }
  }
  assert.deepStrictEqual([...missing.entries()], [], '一覧に無いカタカナ（語, 最初に出たページ）');
});

test('使わない表記（エウロパ・ジュピターなど）が本文に 0 件', () => {
  const variants = D.NAMES.flatMap(([ja, , , vs]) => (vs || []).map(v => [v, ja]));
  const hits = [];
  for (const f of shinwaFiles()) {
    const words = new Set(katakanaWords(mainText(read(f))));
    for (const [v, ja] of variants) if (words.has(v)) hits.push(`${f}: ${v}（→ ${ja}）`);
  }
  assert.deepStrictEqual(hits, []);
});

test('星座の話 12 本と星座図鑑が両向きにリンクしていて、リンク先がある', () => {
  for (const s of D.STORIES) {
    const story = read(`shinwa/seiza/${s.slug}.html`);
    for (const id of s.cons) {
      assert.ok(CONS.some(c => c.id === id), `${id} は図鑑に無い`);
      assert.ok(fs.existsSync(path.join(ROOT, `zukan/${id}.html`)), `zukan/${id}.html が無い`);
      assert.ok(story.includes(`href="../../zukan/${id}.html"`), `${s.slug} → zukan/${id} のリンクが無い`);
      assert.ok(read(`zukan/${id}.html`).includes(`href="../shinwa/seiza/${s.slug}.html"`), `zukan/${id} → ${s.slug} のリンクが無い`);
    }
  }
  // 1 つの星座は 1 つの話にだけ（図鑑から張るリンクが 1 本に決まる）
  const ids = D.STORIES.flatMap(s => s.cons);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('shinwa/ の中の相対リンクはすべて実在のファイルを指す', () => {
  for (const f of shinwaFiles()) {
    const html = read(f);
    for (const m of html.matchAll(/href="([^"#:]+?)(#[^"]*)?"/g)) {
      const href = m[1];
      if (/^(https?:|mailto:)/.test(href) || href.startsWith('?')) continue;
      let target = path.posix.normalize(path.posix.join(path.posix.dirname(f), href.split('?')[0]));
      if (target.endsWith('/') || !path.posix.extname(target)) target = path.posix.join(target, 'index.html');
      if (target === 'index.html' || target.startsWith('../')) continue;          // プラネタリウム本体（手書き）とサイトの外
      assert.ok(fs.existsSync(path.join(ROOT, target)), `${f} → ${href}（${target}）が無い`);
    }
  }
});

test('元素の名前の由来がクイズ広場（K89）の一言と食い違わない（同じ元素 14 件）', () => {
  const k89 = JSON.parse(read('tests/fixtures/k89-genso.json'));
  assert.ok(k89.rows.length >= 10);
  const byN = Object.fromEntries(k89.rows.map(r => [r[0], r]));
  const nameOf = w => D.NAMES.find(([ja, , , vs]) => ja === w || (vs || []).includes(w));
  for (const [n, sym, ja, en, , txt, , word] of D.ELEMENTS) {
    const r = byN[n];
    assert.ok(r, `${n} 番が K89 の写しに無い`);
    assert.deepStrictEqual([r[1], r[2], r[3]], [sym, ja, en], `${n} 番の記号・日本語名・英語名`);
    assert.ok(r[4].includes(word), `${n} 番: K89 の一言「${r[4]}」に「${word}」が無い`);
    // 同じ人物・天体を指している: 語がそのまま入っているか、同じ名の正式な表記が入っている
    const nm = nameOf(word);
    assert.ok(txt.includes(word) || (nm && txt.includes(nm[0])), `${n} 番: こちらの由来「${txt}」が K89 の「${word}」と別のものを指している`);
  }
});

test('元素の行が本番のページに出ていて、K89 へのリンクがある', () => {
  const html = read('shinwa/namae.html');
  for (const [n, sym] of D.ELEMENTS) assert.ok(html.includes(`id="el-${sym}"`), `${n} ${sym}`);
  assert.ok(html.includes('href="https://yorozu-craft.com/quiz-hiroba/genso/"'));
});

test('出典: すべての段落に原典の箇所があるか、無い理由の文で、鍵は SOURCES にある', () => {
  for (const s of D.STORIES) for (const [, ps] of s.secs) for (const [t, c] of ps) {
    assert.ok(t.length > 0, `${s.slug} に空の段落`);
    if (c === null) { assert.match(t, /名指ししていません|確かめられませんでした|呼ばれます/, `${s.slug}: 出典の無い段落「${t}」`); continue; }
    const list = Array.isArray(c[0]) ? c : [c];
    for (const [k] of list) assert.ok(D.SOURCES[k], `${s.slug}: 出典の鍵 ${k}`);
  }
  for (const r of D.PARENTS) assert.ok(D.SOURCES[r[3][0]], `親子 ${r[0]} の出典`);
  for (const g of D.GODS) { assert.ok(D.SOURCES[g.roleSrc[0]], g.id); if (g.roman) assert.ok(g.romanSrc && D.SOURCES[g.romanSrc[0]], `${g.id} のローマ名の出典`); }
  // 原典の英訳は 1929 年より前に出た版（米国でも著作権が切れている）
  for (const k of ['hes', 'hh', 'apo', 'ovm', 'ovf', 'ara']) {
    const y = +(D.SOURCES[k].ed.match(/(1[89]\d\d)/) || [])[1];
    assert.ok(y && y < 1929, `${k} の版の年 ${y}`);
  }
  assert.match(D.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
});

test('系図: 人はすべて表記の一覧にあり、親子の id が実在し、親子が輪になっていない', () => {
  const ids = new Set(D.PEOPLE.map(p => p[0]));
  const names = new Set(D.NAMES.map(n => n[0]));
  for (const [id, ja] of D.PEOPLE) assert.ok(names.has(ja), `${id} の表記「${ja}」が一覧に無い`);
  const parentsOf = {};
  for (const [c, f, m] of D.PARENTS) {
    for (const x of [c, f, m]) if (x) assert.ok(ids.has(x), `系図に無い id: ${x}`);
    assert.ok(!parentsOf[c], `${c} の親が 2 行ある`);
    parentsOf[c] = [f, m].filter(Boolean);
  }
  const seen = new Set();
  const up = (id, path) => { assert.ok(!path.includes(id), `輪: ${[...path, id].join(' → ')}`); for (const p of parentsOf[id] || []) up(p, [...path, id]); };
  for (const id of ids) if (!seen.has(id)) up(id, []);
  for (const s of D.STORIES) for (const w of s.who) assert.ok(ids.has(w), `${s.slug} の出てくる人 ${w} が系図に無い`);
  for (const g of D.GODS) assert.ok(ids.has(g.id), g.id);
  for (const p of D.PLANETS) assert.ok(ids.has(p.god), p.en);
});

test('惑星の英語名は IAU 2006 の 8 つと冥王星', () => {
  assert.deepStrictEqual(D.PLANETS.map(p => p.en), ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']);
});
