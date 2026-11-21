'use strict';
/* 生成元とコミットされたページの一致。実行: node --test tests/*.test.js
   tools/build-pages.js を一時フォルダに書き出し（--out）、出てきた全ファイルがリポジトリのものと同じかを見る。
   生成済みのページを手で直して生成元に戻さないと、次に再生成したときに直したところが消える（2026-10-18 に manifest の行 12 ページと about の 1 文で起きた）。
   落ちたら生成元（tools/*.js）を直して node tools/build-pages.js を流し直す。改行コードの違い（CRLF で取り出した作業ツリー）は見ない */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

test('node tools/build-pages.js の出力がリポジトリのページと同じ', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hoshizora-build-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/build-pages.js'), '--out', tmp], { stdio: 'pipe' });
    const files = walk(tmp).map(f => path.relative(tmp, f).split(path.sep).join('/'));
    assert.ok(files.length > 70, `生成したファイルが ${files.length} 個しかない`);
    const differ = files.filter(f => {
      const repo = path.join(ROOT, f);
      if (!fs.existsSync(repo)) return true;
      const lf = s => s.replace(/\r\n/g, '\n');
      return lf(fs.readFileSync(path.join(tmp, f), 'utf8')) !== lf(fs.readFileSync(repo, 'utf8'));
    });
    assert.deepStrictEqual(differ, [], `生成元と食い違うページ: ${differ.join(', ')}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

/* 生成物の印（yorozu-plans D670）。作る道具が html の 2 行目（doctype の次）に出す。
   ページの一覧は道具そのものから取る（フォルダの名前で当て推量しない） */
const MARK = src => `<!-- 生成物。正本は hoshizora-sanpo の ${src}（node tools/build-pages.js で作る。ここは手で直さない） -->`;
const subToolPages = () => {
  const stub = () => '';
  return {
    'tools/calendar-pages.js': require('../tools/calendar-pages.js')({ page: stub, esc: String, BASE: '', UPDATED: require('../tools/official-events.js').CHECKED }).files,
    'tools/calendar-pages-en.js': require('../tools/calendar-pages-en.js')({ esc: String, BASE: '', UPDATED: require('../tools/official-events.js').CHECKED, ADSENSE: '', BEACON: '', mark: stub }).files,
    'tools/shinwa-pages.js': require('../tools/shinwa-pages.js')({ page: stub, esc: String, CONS: require('../data.js').CONS }).files,
  };
};

test('天文カレンダー・英語版・ギリシャ神話の道具が作るページの全部に、2 行目の生成物の印が在る', () => {
  for (const [src, files] of Object.entries(subToolPages())) {
    assert.ok(files.length > 0, `${src} が作るページが 0`);
    for (const { file } of files) {
      const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
      assert.strictEqual(lines[0], '<!DOCTYPE html>', `${file} の 1 行目`);
      assert.strictEqual(lines[1], MARK(src), `${file} の 2 行目`);
    }
  }
});

/* build-pages.js 自身が作るファイル（星座図鑑・このアプリについて・プライバシーポリシー・sitemap.xml）にも同じ印（D670、yorozu-plans Q-894）。
   一覧は、道具が実際に書き出したファイルから、上の 3 つの道具の分を引いて取る（名前で当て推量しない）。
   sitemap.xml は XML の宣言が 1 行目なので、印はその次の 2 行目 */
test('build-pages.js が作るファイルの全部に、2 行目の生成物の印が在る', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hoshizora-mark-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/build-pages.js'), '--out', tmp], { stdio: 'pipe' });
    const sub = new Set(Object.values(subToolPages()).flat().map(f => f.file));
    const own = walk(tmp).map(f => path.relative(tmp, f).split(path.sep).join('/')).filter(f => !sub.has(f));
    assert.ok(own.length >= 36, `build-pages.js 自身が作るファイルが ${own.length} 個しかない`);
    for (const file of own) {
      const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
      assert.strictEqual(lines[0], file.endsWith('.xml') ? '<?xml version="1.0" encoding="UTF-8"?>' : '<!DOCTYPE html>', `${file} の 1 行目`);
      assert.strictEqual(lines[1], MARK('tools/build-pages.js'), `${file} の 2 行目`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
