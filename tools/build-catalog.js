'use strict';
/* 実在の星のカタログ catalog.js を作る（開発時に一度だけ実行する。アプリの動作には不要）
 *
 * 元データ: Yale Bright Star Catalogue 第5版 (Hoffleit & Warren 1991) を
 *   JSON 化した https://github.com/brettonw/YaleBrightStarCatalog の bsc5-all.json
 * 使い方: node tools/build-catalog.js path/to/bsc5-all.json > catalog.js
 *
 * 出力は [赤経(時×1000), 赤緯(度×100), 等級×100, B-V×100] を平らに並べた数値の配列。
 * 座標は J2000。歳差はアプリ側で読み込み時にかける。 */
const fs = require('fs');
const LIMIT_MAG = 5.6;
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rows = [];
for (const s of src) {
  if (s.RAh === undefined || s.Vmag === undefined) continue;   // 座標のない新星などを除く
  const mag = parseFloat(s.Vmag);
  if (!(mag <= LIMIT_MAG)) continue;
  const ra = +s.RAh + s.RAm / 60 + s.RAs / 3600;
  const dec = (s['DE-'] === '-' ? -1 : 1) * (+s.DEd + s.DEm / 60 + s.DEs / 3600);
  const bv = s['B-V'] !== undefined ? parseFloat(s['B-V']) : 0.3;
  rows.push([Math.round(ra * 1000), Math.round(dec * 100), Math.round(mag * 100), Math.round(bv * 100)]);
}
rows.sort((a, b) => a[2] - b[2]);                                 // 明るい順
const body = rows.map(r => r.join(',')).join(',\n');
process.stdout.write(
`'use strict';
/* 実在の星 ${rows.length} 個（${LIMIT_MAG}等まで）。tools/build-catalog.js で生成。手で編集しない。
   出典: Yale Bright Star Catalogue, 5th Revised Ed. (Hoffleit & Warren 1991)
   並び: 赤経(時×1000), 赤緯(度×100), 等級×100, B-V×100 の繰り返し（J2000） */
const CATALOG=[
${body}
];
if(typeof module!=='undefined') module.exports={CATALOG};
`);
