'use strict';
// 「この端末ならフル版がおすすめ」の 1 行（suggest-full.js。オーナー決定 2026-10-03）
// 出す条件・1 回だけ（閉じたら二度と出さない）・消すボタン（K123）で消えること・フル版への URL の引き継ぎ
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SF = require('../suggest-full.js');
const R = require('../reset-storage.js');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    keys() { return [...m.keys()].sort(); },
  };
}

/** mount が使う分だけの DOM */
function fakeDocument() {
  function el(tag) {
    const e = { tagName: tag, children: [], attrs: {}, listeners: {}, parentNode: null, textContent: '', innerHTML: '', id: '', className: '', type: '',
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      click() { (this.listeners.click || []).forEach((f) => f()); } };
    return e;
  }
  return { createElement: el, createTextNode: (t) => ({ textContent: t }) };
}
const find = (box, cls) => box.children.find((c) => c.className === cls);

/* ---------- 出す条件 ---------- */
test('基準はフル版の段階判定と同じ（最初の 3 秒・fps の中央値 24）', () => {
  assert.equal(SF.FPS.probeMs, 3000);
  assert.equal(SF.FPS.min, 24);
});

test('出すのは fps が 24 以上で WebGL が使え、閉じたことがなく、フル版から来ておらず、データセーバーでないときだけ', () => {
  const ok = { dismissed: false, fromFull: false, saveData: false, fps: 60, webgl: true };
  assert.equal(SF.decide(ok), 'show');
  assert.equal(SF.decide({ ...ok, fps: 24 }), 'show');
  assert.equal(SF.decide({ ...ok, fps: 23.9 }), 'slow');
  assert.equal(SF.decide({ ...ok, fps: NaN }), 'slow');
  assert.equal(SF.decide({ ...ok, webgl: false }), 'no-webgl');
  assert.equal(SF.decide({ ...ok, dismissed: true }), 'dismissed');
  assert.equal(SF.decide({ ...ok, fromFull: true }), 'from-full');
  assert.equal(SF.decide({ ...ok, saveData: true }), 'save-data');
});

test('WebGL の確かめは fps が足りたときだけ（遅い端末に文脈を作らせない）', () => {
  let called = 0;
  const gl = () => { called++; return true; };
  SF.decide({ fps: 10, webgl: gl });
  assert.equal(called, 0);
  assert.equal(SF.decide({ fps: 60, webgl: gl }), 'show');
  assert.equal(called, 1);
});

test('webglOk: 文脈が無い・点の大きさの上限が 2 未満・例外は不可。確かめた文脈は手放す', () => {
  let lost = 0;
  const ctx = (range) => ({ ALIASED_POINT_SIZE_RANGE: 1, getParameter: () => range, getExtension: () => ({ loseContext: () => { lost++; } }) });
  assert.equal(SF.webglOk({ getContext: () => ctx([1, 64]) }), true);
  assert.equal(lost, 1);
  assert.equal(SF.webglOk({ getContext: () => ctx([1, 1]) }), false);
  assert.equal(SF.webglOk({ getContext: () => null }), false);
  assert.equal(SF.webglOk({ getContext: () => { throw new Error('x'); } }), false);
  assert.equal(SF.webglOk(null), false);
});

test('probe: 3 秒たつまでは null、たったらフレーム間隔の中央値から fps', () => {
  const p = SF.probe();
  let t = 1000, out = null;
  // 60 fps のフレームに、ときどき長い止まり（中央値なので効かない）
  for (let i = 0; i < 400 && out == null; i++) { t += i % 10 === 9 ? 200 : 1000 / 60; out = p.tick(t); if (t - 1000 < 3000) assert.equal(out, null); }
  assert.ok(out > 59 && out < 61, String(out));
  assert.equal(p.tick(t + 16), null, '測り終わったら二度と返さない');
  const slow = SF.probe(); let s = 0, f = null;
  for (let i = 0; i < 200 && f == null; i++) { s += 50; f = slow.tick(s); }
  assert.equal(Math.round(f), 20);
  assert.equal(SF.decide({ fps: f, webgl: true }), 'slow');
});

/* ---------- 1 回だけ ---------- */
test('閉じたら localStorage に記録し、次からは出さない', () => {
  const st = fakeStorage();
  assert.equal(SF.isDismissed(st), false);
  const doc = fakeDocument(), app = doc.createElement('div');
  let closed = 0;
  const box = SF.mount(app, { document: doc, storage: st, location: { search: '', hash: '' }, en: false, onClose: () => closed++ });
  assert.equal(app.children.length, 1);
  assert.equal(box.id, 'suggestFull');
  find(box, 'sf-close').click();
  assert.equal(app.children.length, 0, '閉じたら消える');
  assert.equal(closed, 1);
  assert.equal(st.getItem(SF.KEY), '1');
  assert.equal(SF.isDismissed(st), true);
  assert.equal(SF.decide({ dismissed: SF.isDismissed(st), fps: 60, webgl: true }), 'dismissed');
});

test('フル版を開いたときも記録する（開いた人に二度目は出さない）', () => {
  const st = fakeStorage(), doc = fakeDocument(), app = doc.createElement('div');
  const box = SF.mount(app, { document: doc, storage: st, location: { search: '', hash: '' }, en: false });
  find(box, 'sf-link').click();
  assert.equal(SF.isDismissed(st), true);
});

test('localStorage が使えなくても落ちない（そのページの間だけ閉じる）', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(SF.isDismissed(bad), false);
  assert.equal(SF.isDismissed(null), false);
  SF.dismiss(bad); SF.dismiss(null);
  const doc = fakeDocument(), app = doc.createElement('div');
  const box = SF.mount(app, { document: doc, storage: bad, location: { search: '', hash: '' }, en: true });
  find(box, 'sf-close').click();
  assert.equal(app.children.length, 0);
});

/* ---------- 消すボタン（K123） ---------- */
test('キーは hoshizora-sanpo_ で始まり、日英の画面の消すボタンで消える（ほかのキーは残す）', () => {
  assert.ok(SF.KEY.startsWith('hoshizora-sanpo_'));
  for (const page of ['index.html', 'en/index.html']) {
    const html = read(page);
    const btn = /<button\b[^>]*\bdata-reset-storage="([^"]*)"/.exec(html);
    assert.ok(btn, page);
    const st = fakeStorage({ [SF.KEY]: '1', 'zz-other-tool_x': '1' });
    R.clear(st, R.splitList(btn[1]), []);
    assert.equal(st.getItem(SF.KEY), null, page + ' の消すボタンでおすすめの記録が消えない');
    assert.equal(st.getItem('zz-other-tool_x'), '1');
    assert.equal(SF.isDismissed(st), false, '消したら、条件を満たせばまた出る');
  }
});

/* ---------- 共有した URL の時刻・場所をフル版へ ---------- */
test('フル版の URL: 共有の # と ?t=&loc=&look= などはそのまま、ほかは渡さない', () => {
  assert.equal(SF.fullUrl(false, '', ''), '/hoshizora-night/');
  assert.equal(SF.fullUrl(true, '', ''), '/hoshizora-night/en/');
  assert.equal(SF.fullUrl(false, '', '#35.69,139.692,1790000000'), '/hoshizora-night/#35.69,139.692,1790000000');
  assert.equal(SF.fullUrl(false, '', '#-34,151,1790000000'), '/hoshizora-night/#-34,151,1790000000');
  assert.equal(SF.fullUrl(false, '?t=2026-12-14T02:00:00%2B09:00&loc=tokyo&look=radiant:112,33&utm_source=x', ''),
    '/hoshizora-night/?t=2026-12-14T02:00:00%2B09:00&loc=tokyo&look=radiant:112,33');
  assert.equal(SF.fullUrl(true, '?lt=2026-08-12T22:00', ''), '/hoshizora-night/en/?lt=2026-08-12T22:00');
  assert.equal(SF.fullUrl(true, '?d=2026-08-12&tw=evening', ''), '/hoshizora-night/en/?d=2026-08-12&tw=evening');
  assert.equal(SF.fullUrl(false, '?c=ori', ''), '/hoshizora-night/?c=ori');
  assert.equal(SF.fullUrl(false, '', '#help'), '/hoshizora-night/', '共有の形でない # は渡さない');
  assert.equal(SF.fullUrl(false, '', '#35.69,139.69,1790000000"><x'), '/hoshizora-night/');
});

test('共有の # は、軽量版の sky-share.js が作る形をフル版の parseHash の形で読める', () => {
  const S = require('../sky-share.js');
  const D = require('../data.js');
  const ms = Date.UTC(2026, 11, 13, 17, 0);
  for (const place of [D.LOCS.find((l) => l.id === 'tokyo'), { lat: 43.06, lon: 141.35 }, { lat: -33.87, lon: 151.21 }]) {
    const h = S.encode(place, ms, D.LOCS);
    assert.equal(SF.fullUrl(false, '', h), '/hoshizora-night/' + h);
    // フル版 render/look.js の parseHash と同じ式
    const m = h.replace(/^#/, '').match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d{1,12})$/);
    assert.ok(m, h);
    assert.equal(+m[3] * 1000, Math.floor(ms / 1000) * 1000);
  }
});

test('mount のリンクは開いた URL を引き継ぎ、押した瞬間の URL で作り直す', () => {
  const loc = { search: '?t=2026-12-14T02:00:00%2B09:00&loc=tokyo', hash: '' };
  const doc = fakeDocument(), app = doc.createElement('div');
  const box = SF.mount(app, { document: doc, storage: fakeStorage(), location: loc, en: false });
  const a = find(box, 'sf-link');
  assert.equal(a.getAttribute('href'), '/hoshizora-night/?t=2026-12-14T02:00:00%2B09:00&loc=tokyo');
  loc.search = ''; loc.hash = '#35.69,139.692,1790000000';
  a.click();
  assert.equal(a.getAttribute('href'), '/hoshizora-night/#35.69,139.692,1790000000');
});

/* ---------- 文と画面のつなぎ ---------- */
test('日本語版はおとな用とひらがなの両方、英語版は英語の文とフル版の英語のページ', () => {
  const doc = fakeDocument(), app = doc.createElement('div');
  const ja = SF.mount(app, { document: doc, storage: fakeStorage(), location: { search: '', hash: '' }, en: false });
  assert.ok(find(ja, 'sf-msg').innerHTML.includes('class="ad"') && find(ja, 'sf-msg').innerHTML.includes('class="kd"'));
  assert.equal(find(ja, 'sf-close').getAttribute('aria-label'), 'とじる');
  const en = SF.mount(app, { document: doc, storage: fakeStorage(), location: { search: '', hash: '' }, en: true });
  assert.equal(find(en, 'sf-msg').textContent, SF.TEXT.en.msg);
  assert.equal(find(en, 'sf-link').getAttribute('href'), '/hoshizora-night/en/');
  assert.equal(find(en, 'sf-close').getAttribute('aria-label'), 'Close');
});

test('日英のページが suggest-full.js を main.js より前に読み、Service Worker もキャッシュする', () => {
  for (const [page, src] of [['index.html', './'], ['en/index.html', '../']]) {
    const html = read(page);
    const i = html.indexOf(`<script src="${src}suggest-full.js"></script>`), j = html.indexOf(`<script src="${src}main.js"></script>`);
    assert.ok(i > 0 && i < j, page);
  }
  assert.ok(read('sw.js').includes("'./suggest-full.js',"));
  const main = read('main.js');
  assert.ok(main.includes('suggestTick(now);'), '描画のたびに測る');
  assert.ok(/\$\('help'\)\.classList\.contains\('open'\)/.test(main), '使い方カードが開いている間は出さない');
  assert.ok(/prefers-reduced-motion:reduce\)\{#suggestFull\{animation:none;\}\}/.test(read('style.css')), 'reduced motion では現れ方を動かさない');
});
