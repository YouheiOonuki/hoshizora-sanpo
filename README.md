# ほしぞらさんぽ 🌌

こどもとおとなのための Web プラネタリウム。いつ・どこの星空でも天文計算で再現し、星座・星・月・惑星をタップすると由来や神話が読めます。

**▶ https://yorozu-craft.com/hoshizora-sanpo/**（[yorozu-craft](https://yorozu-craft.com/) のツールのひとつ）

## 特徴

- **本物の星空** — 実在の星 3,249 個（Yale Bright Star Catalogue、5.6 等まで）に歳差をかけ、地平座標 → ステレオ投影で描画。地面・朝焼け夕焼け・月明かりも再現
- **月と惑星** — 月（満ち欠け・視差つき）と水星・金星・火星・木星・土星の位置と明るさを計算
- **32 星座の由来・神話** — 黄道12星座、オリオン・北斗七星・南十字星・へびつかいなど。タップで解説シート
- **ひらがなモード** — 5 歳から読める分かち書きの解説。画面の文字もすべてかな表示
- **時間たび** — スライダー／±1日／±1ヶ月／60・600・3600 倍の早送り
- **場所** — 札幌・東京・大阪・福岡・那覇・石垣島・シドニー＋いまいる場所（位置情報）。時刻はその土地の時刻で表示
- **星座クイズ** — いま空に出ている星座から5問。ヒントで答えの方向へ視点が動く
- **赤いライト** — 夜の屋外で暗さに慣れた目を守る夜間モード
- **星座図鑑** — 星座ごとの星図・見ごろ（東京・夜9時）・神話・主な星の静的ページ（`zukan/`）
- **天文カレンダー** — 流星群の極大・満月・新月・日食・月食・惑星の見ごろ（`calendar/`）。日付は国立天文台の発表から。「この日の星空を見る」でプラネタリウムをその日時・方角で開く
- **オフライン対応** — Service Worker で一度開けば電波がなくても動く。ホーム画面に追加可能

## ファイル

| ファイル | 役割 |
|---------|------|
| `index.html` / `style.css` / `main.js` | プラネタリウム本体（画面と操作） |
| `astro.js` | 天文計算（恒星時・歳差・太陽・月・惑星）。ブラウザと Node の両方で読める |
| `data.js` | 星座・明るい星・天の川・場所・月と惑星の解説 |
| `catalog.js` | 実在の星のデータ（`tools/build-catalog.js` で生成。手で編集しない） |
| `zukan/`・`calendar/`・`about.html`・`privacy-policy.html`・`sitemap.xml` | 読みものページ（`tools/build-pages.js` で生成。手で編集しない） |
| `tools/official-events.js` | 天文カレンダーの日付データ（国立天文台の発表を書き写したもの。1件ごとに出典つき） |
| `tools/events.js` | 満月・新月・衝・最大離角の計算（データの照合と「見やすい時刻」に使う） |
| `tools/calendar-pages.js` | 天文カレンダーのページを作る |
| （運営者情報・プライバシーポリシー） | yorozu-craft 共通ページ（`https://yorozu-craft.com/about.html`・`/privacy-policy.html`）にある。`privacy-policy.html` はそこへ移動する案内ページ |
| `pages.css` | 読みものページのスタイル |
| `sw.js` / `manifest.webmanifest` | オフライン対応・PWA |
| `tests/astro.test.js` | 天文計算を PyEphem の値と照合するテスト |
| `tests/calendar.test.js` | カレンダーのデータを計算と突き合わせ、書き写しの誤りを見つけるテスト |

## 開発

ビルド不要。静的ファイルをそのまま配信すれば動きます（ローカルでは `index.html` を直接開いても動きますが、オフライン機能は https のときだけ有効）。

```sh
node --test tests/*.test.js     # 天文計算のテスト
node tools/build-pages.js       # data.js を直したら図鑑ページとサイトマップを作り直す
node tools/build-catalog.js path/to/bsc5-all.json > catalog.js   # 星のカタログを作り直すとき
```

- 図鑑の星座ページは `?c=<星座ID>`（例: `?c=ori`）でプラネタリウムにリンクし、その星座がよく見える夜へワープして開きます
- 天文カレンダーは `?t=<日時>&loc=<場所ID>&look=<向き>` でリンクします（例: `?t=2027-08-14T03:00+09:00&loc=tokyo&look=con:per`）。`look` は `moon`・惑星ID・`con:<星座ID>`・`radiant:<赤経°>,<赤緯°>`・`az:<方位°>`

## 天文カレンダーのデータ更新（年に数回）

日付は推測で入れない。国立天文台の発表を見て `tools/official-events.js` に書き写し、1件ごとに出典（`SRC`）を付ける。

1. 毎年2月: 国立天文台 暦計算室の「暦要項」で翌年の **朔弦望**（新月・満月）と **日食・月食** が発表される（`https://eco.mtk.nao.ac.jp/koyomi/yoko/`）
2. 随時: 国立天文台「ほしぞら情報」（`https://www.nao.ac.jp/astro/sky/<年>/<月>.html`）のカレンダーから、**流星群の極大**・**惑星の衝・最大離角・最大光度**・**中秋の名月**
3. `COVERAGE.to` と `CHECKED`（確認日）を更新し、`node --test tests/*.test.js`（満月・新月は計算と2分以内、衝・最大離角は同じ日付かを照合）→ `node tools/build-pages.js`
4. データの期間を広げたら、ページの見出しの年（例: 2026–2027）も自動で変わる。過ぎた日付はページ内のスクリプトで隠れる
- yorozu-craft の決まりに合わせ、キャッシュ名は `hoshizora-sanpo-` で始め、manifest の `id` は `/hoshizora-sanpo/`
- 広告: プラネタリウム本体は全画面で操作するため AdSense は所有確認の meta タグのみ。図鑑などの読みものページにだけ広告タグを入れています

## 出典・注意

- 恒星: Yale Bright Star Catalogue 5th ed. (Hoffleit & Warren 1991)。JSON 版 [brettonw/YaleBrightStarCatalog](https://github.com/brettonw/YaleBrightStarCatalog)（MIT）
- 惑星: JPL "Approximate Positions of the Planets"（1800–2050 年向け）／月: P. Schlyter の簡略理論／惑星の等級: Mallama & Hilton (2018)
- 位置は肉眼の星空として十分な近似です（月・惑星のずれは数分角程度）。大気差は計算していません
- 星座の神話はギリシャ神話などの一般的な伝承に基づく要約です
- 天文カレンダーの日付: 国立天文台（暦計算室「暦要項」「日月食等データベース」、「ほしぞら情報」）。流星群の極大日時は国立天文台が IMO の予報をもとに掲載しているもの。クレジット：国立天文台

## ライセンス

このリポジトリのプログラム・文章は MIT License（`LICENSE`、著作権者 Youhei Oonuki）。上の「出典・注意」に書いた第三者のデータは、それぞれの出典の条件に従う。

テストは `.github/workflows/test.yml` で push・PR のたびに自動実行する（`node --test tests/*.test.js`）。
