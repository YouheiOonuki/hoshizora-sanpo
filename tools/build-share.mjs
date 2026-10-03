// 共有される結果（yorozu-plans K124・企画書 60）の着地ページを作る（プラネタリウムの「この空」と星座早見盤。種類 = 月 12 ずつ）
//   node tools/build-share.mjs          作る（s/<月>.html・hayamiban/s/<月>.html）
//   node tools/build-share.mjs --check  今のファイルと同じかだけを確かめる（tests から呼ぶ）
// OG 画像は tools/make-share-og.mjs（Playwright）で作る:
//   s/<月>.jpg … プラネタリウムをその月の 15 日 21 時（東京）で開いて撮る（星の位置は astro.js・catalog.js の計算そのまま）。
//               フル版（K132、hoshizora-night）からも og:image にこの URL をそのまま使える（共用。月ごとの 12 枚）
//   hayamiban/s/<月>.jpg … 早見盤の見本（東京・その月の 15 日 21 時）を撮る
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { stubHtml, writeAll, esc } from './share-stub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SkyShare = createRequire(import.meta.url)(path.join(ROOT, 'sky-share.js'));
const SITE = 'https://yorozu-craft.com/hoshizora-sanpo/';
const OG_YEAR = 2027;
/** その月の 15 日 21 時（日本時間）の UNIX 秒 */
export const ogTime = (mo) => Date.UTC(OG_YEAR, mo - 1, 15, 21 - 9) / 1000;
const TOKYO = '35.681,139.767';

const overlay = (title, sub) => `
  const d=document.createElement('div');
  d.innerHTML=${JSON.stringify(`<div style="font-size:30px;opacity:.85">${esc(sub)}</div><div style="font-size:84px;font-weight:700;line-height:1.1">${esc(title)}</div><div style="font-size:28px;opacity:.75;margin-top:14px">yorozu-craft.com/hoshizora-sanpo/</div>`)};
  d.style.cssText='position:fixed;left:64px;bottom:52px;z-index:99;color:#f3ead2;font-family:"Hiragino Sans","Noto Sans JP","IPAexGothic",sans-serif;text-shadow:0 2px 12px #000';
  document.body.appendChild(d);`;

export function pages() {
  const out = [];
  for (const k of SkyShare.KINDS) {
    const mo = Number(k);
    out.push({
      file: `s/${k}.html`, image: `s/${k}.jpg`,
      stub: stubHtml({
        title: `${mo}月の夜空｜ほしぞらさんぽ`, desc: `共有された${mo}月の星空。開くと、送った人と同じ場所・同じ時刻の空がプラネタリウムで見られます。`,
        url: `${SITE}s/${k}.html`, image: `${SITE}s/${k}.jpg`, imageType: 'image/jpeg', back: '../', canonical: SITE, open: 'ほしぞらさんぽを開く',
      }),
      ogShot: async (page, base) => {
        await page.goto(`${base}#${TOKYO},${ogTime(mo)}`);
        await page.waitForTimeout(1500);
        await page.addStyleTag({ content: '#plate,#dock,#toast,#sheet,#help,#helpBtn,#langLink,#quizBar,.panel{display:none!important}' });
        await page.evaluate(overlay(`${mo}月の夜空`, 'ほしぞらさんぽ・東京 15 日 21 時'));
        await page.waitForTimeout(300);
      },
    });
    out.push({
      file: `hayamiban/s/${k}.html`, image: `hayamiban/s/${k}.jpg`,
      stub: stubHtml({
        title: `${mo}月に合わせた星座早見盤｜ほしぞらさんぽ`, desc: `共有された星座早見盤（${mo}月）。開くと同じ場所・日時の盤が出て、A4 に印刷して作れます。`,
        url: `${SITE}hayamiban/s/${k}.html`, image: `${SITE}hayamiban/s/${k}.jpg`, imageType: 'image/jpeg', back: '../', canonical: `${SITE}hayamiban/`, open: '星座早見盤メーカーを開く',
      }),
      ogShot: async (page, base) => {
        await page.goto(`${base}hayamiban/#${TOKYO},${ogTime(mo)}`);
        await page.waitForSelector('#pv-sky svg', { state: 'attached' });
        const svg = await page.$eval('#pv-sky', (e) => e.innerHTML);
        await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#070b18;color:#f3ead2;font-family:"Hiragino Sans","Noto Sans JP","IPAexGothic",sans-serif}
.l{position:absolute;left:64px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;gap:16px}.k{font-size:32px;opacity:.85}.b{font-size:76px;font-weight:700;line-height:1.15;color:#f0c86e}.u{font-size:21px;opacity:.75;white-space:nowrap}
.r{position:absolute;right:48px;top:35px;width:560px;height:560px}.r svg{width:560px;height:560px}</style></head><body>
<div class="l"><div class="k">ほしぞらさんぽ｜星座早見盤</div><div class="b">${mo}月の空に<br>合わせた盤</div><div class="u">印刷して、切って、留めるだけ<br>yorozu-craft.com/hoshizora-sanpo/hayamiban/</div></div>
<div class="r">${svg}</div></body></html>`, { waitUntil: 'load' });
      },
    });
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  const diff = writeAll(ROOT, Object.fromEntries(pages().map((p) => [p.file, p.stub])), check);
  if (check && diff.length) { console.error('作り直しが要る: ' + diff.join(', ')); process.exit(1); }
  console.log(check ? 'OK' : `書いた ${diff.length} 件`);
}
