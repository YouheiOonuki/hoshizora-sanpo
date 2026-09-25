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
- **星座早見盤を印刷して作る** — `/hoshizora-sanpo/hayamiban/`。札幌・東京・那覇または北緯 23〜50°・東経を入れて、星図盤と窓の盤を A4 2 枚（または 1 枚）に印刷。切って中心を割りピンで留める。等距離方位図法（天の北極が中心）、星は J2000.0、時刻の目盛りは経度の差で回してある。見本は日時を変えて回せる
- **英語版** — `/hoshizora-sanpo/en/`（本体・天文カレンダー・使い方・印刷する星座早見盤 `en/planisphere/`）。場所は世界の都市・位置情報・緯度経度から選ぶ。星座の神話・図鑑・ひらがなモードは日本語のみ
- **オフライン対応** — Service Worker で一度開けば電波がなくても動く。ホーム画面に追加可能

## ファイル

| ファイル | 役割 |
|---------|------|
| `index.html` / `style.css` / `main.js` | プラネタリウム本体（画面と操作） |
| `text.js` | 画面の文言（日本語・ひらがな・英語）。本体の日英は同じ `main.js` で動き、`<html lang>` で切りかえる |
| `en/index.html` | 英語版の本体（手で書く）。`en/calendar/`・`en/guide.html` は `tools/calendar-pages-en.js` で生成（日本語版と同じ `official-events.js` から。値を書き写さない） |
| `astro.js` | 天文計算（恒星時・歳差・太陽・月・惑星）。ブラウザと Node の両方で読める |
| `data.js` | 星座・明るい星・天の川・場所・月と惑星の解説 |
| `catalog.js` | 実在の星のデータ（`tools/build-catalog.js` で生成。手で編集しない） |
| `zukan/`・`calendar/`・`about.html`・`privacy-policy.html`・`sitemap.xml` | 読みものページ（`tools/build-pages.js` で生成。手で編集しない） |
| `tools/official-events.js` | 天文カレンダーの日付データ（国立天文台の発表を書き写したもの。1件ごとに出典つき） |
| `tools/events.js` | 満月・新月・衝・最大離角の計算（データの照合と「見やすい時刻」に使う） |
| `tools/calendar-pages.js` | 天文カレンダーのページを作る |
| （運営者情報・プライバシーポリシー） | yorozu-craft 共通ページ（`https://yorozu-craft.com/about.html`・`/privacy-policy.html`）にある。`privacy-policy.html` はそこへ移動する案内ページ |
| `hayamiban/planisphere.js` | 星座早見盤の盤面（幾何と SVG）。astro.js の恒星時・data.js の星座・catalog.js の星から作る。ブラウザと Node の両方で読める |
| `hayamiban/index.html`・`app.js`・`hayamiban.css`・`guide.html` | 星座早見盤の画面（手で書く）と使い方。印刷は `@media print` で紙だけを A4 原寸で出す |
| `print/index.html` | 印刷した早見盤のクレジット（`yorozu-craft.com/hoshizora-sanpo/print/`）から来た人の着地ページ（noindex、sitemap に載せない） |
| `pages.css` | 読みものページのスタイル |
| `sw.js` / `manifest.webmanifest` | オフライン対応・PWA |
| `tests/astro.test.js` | 天文計算を PyEphem の値と照合するテスト |
| `tests/hayamiban.test.js` | 早見盤の目盛りを合わせたときの星の位置を、プラネタリウムと同じ計算（歳差・恒星時・高度方位）の空と比べるテスト（2026〜2050 年・5 地点で 1° 以内、窓の内外が地平線の上下と一致） |
| `tests/calendar.test.js` | カレンダーのデータを計算と突き合わせ、書き写しの誤りを見つけるテスト |

## 開発

ビルド不要。静的ファイルをそのまま配信すれば動きます（ローカルでは `index.html` を直接開いても動きますが、オフライン機能は https のときだけ有効）。

```sh
node --test tests/*.test.js     # 天文計算のテスト
node tools/build-pages.js       # data.js を直したら図鑑ページとサイトマップを作り直す
node tools/build-catalog.js path/to/bsc5-all.json > catalog.js   # 星のカタログを作り直すとき
```

- 図鑑の星座ページは `?c=<星座ID>`（例: `?c=ori`）でプラネタリウムにリンクし、その星座がよく見える夜へワープして開きます
- 英語版のカレンダーは場所を指定せず、見る人の場所の現地時刻で開きます: `?lt=<YYYY-MM-DDTHH:MM>` または `?d=<日付>&tw=evening|morning`（太陽高度 −6° のころ）
- 天文カレンダーは `?t=<日時>&loc=<場所ID>&look=<向き>` でリンクします（例: `?t=2027-08-14T03:00+09:00&loc=tokyo&look=con:per`）。`look` は `moon`・惑星ID・`con:<星座ID>`・`radiant:<赤経°>,<赤緯°>`・`az:<方位°>`

## 星座早見盤（hayamiban/）の決まり

- 図法は天の北極を中心にした等距離方位図法。南の地平線（赤緯 = 緯度 − 90°）を中心から 68mm に置き、星図は 80mm（下の盤は外径 192mm）。北緯 23〜50° だけ受け付ける（南極が星図の外に出ないため）
- 日付は「その夜の日付」（0 時を過ぎても前の夜のまま）。時刻の目盛りは恒星時の速さ（1 時間 15.041°）で刻み、余る約 1° は昼の 12 時で重ねる。こうすると夕方から明け方まで恒星時のずれが出ない
- 日付の目盛りは 2026〜2029 年（うるう年の 4 年）の恒星時の平均。星は J2000.0 のまま。2050 年までプラネタリウムと 1° 以内（テスト）。制度の値や年ごとの更新は無い
- 保存のキーは `hoshizora-sanpo_hayamiban`（場所・紙・星の数・クレジット）
- 英語版 `en/planisphere/`（index・app.js・guide）は同じ `planisphere.js` を `lang: 'en'` で使う（盤の幾何は共通。日本語版の出力は変えていない）。緯度は北緯・南緯 20〜65°（南緯は天の南極が中心で、角度を左右反転）、時刻は標準時（UTC との差 `tz` と子午線 15°×tz で経度を補正）、紙は A4 と US Letter、時刻の目盛りは 12/24 時間制。場所の既定はロンドン・ニューヨーク・ロサンゼルス・シドニー（緯度経度は `LOCS_WORLD`、標準時の差はテストで Intl と照合）。保存のキーは `hoshizora-sanpo_planisphere-en`。テストは `tests/planisphere-en.test.js`（20 地点・2026〜2050 年で 1° 以内）

## 天文カレンダーのデータ更新（年に数回）

日付は推測で入れない。国立天文台の発表を見て `tools/official-events.js` に書き写し、1件ごとに出典（`SRC`）を付ける。

1. 毎年2月: 国立天文台 暦計算室の「暦要項」で翌年の **朔弦望**（新月・満月）と **日食・月食** が発表される（`https://eco.mtk.nao.ac.jp/koyomi/yoko/`）
2. 随時: 国立天文台「ほしぞら情報」（`https://www.nao.ac.jp/astro/sky/<年>/<月>.html`）のカレンダーから、**流星群の極大**・**惑星の衝・最大離角・最大光度**・**中秋の名月**
3. `COVERAGE.to` と `CHECKED`（確認日）を更新し、`node --test tests/*.test.js`（満月・新月は計算と2分以内、衝・最大離角は同じ日付かを照合）→ `node tools/build-pages.js`
4. データの期間を広げたら、ページの見出しの年（例: 2026–2027）も自動で変わる。過ぎた日付はページ内のスクリプトで隠れる
- yorozu-craft の決まりに合わせ、キャッシュ名は `hoshizora-sanpo-` で始め、manifest の `id` は `/hoshizora-sanpo/`
- 広告: プラネタリウム本体は全画面で操作するため AdSense は所有確認の meta タグのみ。図鑑などの読みものページにだけ広告タグを入れています

## 出典・注意

- 英語の星の名前: IAU WGSN「IAU Catalog of Star Names」（https://exopla.net/star-names/modern-iau-star-names/ ）
- 恒星: Yale Bright Star Catalogue 5th ed. (Hoffleit & Warren 1991)。JSON 版 [brettonw/YaleBrightStarCatalog](https://github.com/brettonw/YaleBrightStarCatalog)（MIT）
- 惑星: JPL "Approximate Positions of the Planets"（1800–2050 年向け）／月: P. Schlyter の簡略理論／惑星の等級: Mallama & Hilton (2018)
- 位置は肉眼の星空として十分な近似です（月・惑星のずれは数分角程度）。大気差は計算していません
- 星座の神話はギリシャ神話などの一般的な伝承に基づく要約です
- 天文カレンダーの日付: 国立天文台（暦計算室「暦要項」「日月食等データベース」、「ほしぞら情報」）。流星群の極大日時は国立天文台が IMO の予報をもとに掲載しているもの。クレジット：国立天文台

## ライセンス

このリポジトリのプログラム・文章は MIT License（`LICENSE`、著作権者 Youhei Oonuki）。上の「出典・注意」に書いた第三者のデータは、それぞれの出典の条件に従う。

テストは `.github/workflows/test.yml` で push・PR のたびに自動実行する（`node --test tests/*.test.js`）。
