// 星座の由来 12 話の読み（かな）を作る（yorozu-plans ROADMAP 7.36.1 K140、企画書 84）。出力は tools/shinwa-yomi.js（値ファイル。読み上げの元）。
//   npm i --no-save kuromoji@0.1.2 && node tools/build-shinwa-yomi.mjs
// 本文（tools/shinwa-data.js の title・lead・各節の見出しと段落）を形態素解析（kuromoji、IPA 辞書）でかなにする。カタカナの語（人と神の名前）はそのまま。
// 数字は助数詞と合わせてかなに（「15 年」→「じゅうごねん」）。辞書の読みが違う語は OVERRIDES に書き、whisper で戻して確かめる（企画書 84 の 2 章）。
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const D = require('./shinwa-data.js');
const kuromoji = require('kuromoji');

// 辞書の読みが違う・名前として読ませたい語（左を右の読みで）。確かめ方と日付は企画書 84 の 2 章
export const OVERRIDES = [
  ['祭暦', 'さいれき'], // オウィディウス『祭暦』（Fasti）。辞書は「まつりれき」と読んだ（whisper で戻して「祭り歴」。2026-10-11）
];
const CHECKED = '2026-10-11';

const K = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
function under10000(n) {
  const th = Math.floor(n / 1000), h = Math.floor((n % 1000) / 100), t = Math.floor((n % 100) / 10), o = n % 10;
  let s = '';
  if (th) s += th === 1 ? 'せん' : th === 3 ? 'さんぜん' : th === 8 ? 'はっせん' : K[th] + 'せん';
  if (h) s += h === 1 ? 'ひゃく' : h === 3 ? 'さんびゃく' : h === 6 ? 'ろっぴゃく' : h === 8 ? 'はっぴゃく' : K[h] + 'ひゃく';
  if (t) s += (t === 1 ? '' : K[t]) + 'じゅう';
  if (o) s += K[o];
  return s;
}
const readNumber = (n) => (n === 0 ? 'ぜろ' : n >= 10000 ? under10000(Math.floor(n / 10000)) + 'まん' + under10000(n % 10000) : under10000(n));
const COUNTER = { 年: 'ねん', 人: 'にん', 日: 'にち', 回: 'かい', 歳: 'さい', 頭: 'とう', 本: 'ほん', 晩: 'ばん', 番: 'ばん', 匹: 'ひき', 夜: 'や', 個: 'こ', 等: 'とう' };
const SPECIAL = { '1人': 'ひとり', '2人': 'ふたり', '1日': 'いちにち', '1つ': 'ひとつ', '2つ': 'ふたつ', '3つ': 'みっつ', '4つ': 'よっつ', '5つ': 'いつつ', '6つ': 'むっつ', '7つ': 'ななつ', '8つ': 'やっつ', '9つ': 'ここのつ', '4年': 'よねん', '9年': 'くねん', '10回': 'じゅっかい', '1回': 'いっかい', '6回': 'ろっかい', '8回': 'はっかい', '1頭': 'いっとう', '1本': 'いっぽん', '3本': 'さんぼん', '1匹': 'いっぴき', '3匹': 'さんびき' };
const numbers = (s) => s.normalize('NFKC').replace(/(\d+)\s*([年人日回歳頭本晩番匹夜個等つ])?/g, (m, d, c) => SPECIAL[d + (c || '')] || readNumber(+d) + (c ? COUNTER[c] || c : ''));
const hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

const tk = await new Promise((res, rej) => kuromoji.builder({ dicPath: path.join(path.dirname(require.resolve('kuromoji')), '..', 'dict') }).build((e, t) => (e ? rej(e) : res(t))));
function yomi(text) {
  let s = numbers(text.replace(/[「」『』]/g, ''));
  for (const [w, r] of OVERRIDES) s = s.split(w).join(r);
  return tk.tokenize(s).map((t) => {
    if (/^[゠-ヿー・]+$/.test(t.surface_form)) return t.surface_form; // カタカナの語（名前）はそのまま
    if (/^[ぁ-んー]+$/.test(t.surface_form)) return t.surface_form;
    return t.reading && t.reading !== '*' ? hira(t.reading) : t.surface_form;
  }).join('');
}

const out = D.STORIES.map((s) => {
  const parts = [`${s.title}。${s.sub}。`, s.lead, ...s.secs.flatMap(([h, ps]) => [h + '。', ...ps.map(([t]) => t)])];
  return { slug: s.slug, title: s.title, parts: parts.map((text) => ({ text, yomi: yomi(text) })) };
});
const unread = out.flatMap((s) => s.parts.flatMap((p) => [...p.yomi.matchAll(/[一-鿿]+/g)].map((m) => s.slug + ':' + m[0])));
writeFileSync(new URL('./shinwa-yomi.js', import.meta.url), `'use strict';
/* 生成物（tools/build-shinwa-yomi.mjs。手で直さない。読みを直すときは OVERRIDES）。星座の由来 12 話の読み上げの元（K140）。
   text: 本文（shinwa-data.js）、yomi: 読み（kuromoji の IPA 辞書の読み。カタカナの名前はそのまま、数字は助数詞とかなに）。確認日 ${CHECKED} */
const CHECKED = '${CHECKED}';
const YOMI = ${JSON.stringify(out, null, 1)};
if (typeof module !== 'undefined') module.exports = { CHECKED, YOMI };
`);
console.log(`${out.length} 話・${out.reduce((a, s) => a + s.parts.length, 0)} 段。読みが残った漢字: ${unread.length ? unread.join(' ') : 'なし'}`);
