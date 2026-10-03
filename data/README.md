# 天文カレンダーの購読用データ（CC0）

[天文カレンダー](https://yorozu-craft.com/hoshizora-sanpo/calendar/)の主な現象を、カレンダーアプリで購読できる形で置いています。

| ファイル | URL | 中身 |
|---------|-----|------|
| `tenmon.ics` | https://yorozu-craft.com/hoshizora-sanpo/data/tenmon.ics | 新月・上弦・満月・下弦（朔弦望。時刻つき）、流星群の極大（時刻の分かるものは時刻つき、「このころ」は終日）、日食・月食（終日）。iCalendar（RFC 5545）。各予定の説明欄に 1 文と出典の URL |
| `tenmon.json` | https://yorozu-craft.com/hoshizora-sanpo/data/tenmon.json | `tenmon.ics` と同じ予定の JSON（`events[]` に `id`（ics の UID と同じ）・`start`（UTC の ISO 8601）か `date`（終日）・`summary`・`description`・`url`・`sources`）。頭に `license`・`checked`・`generated`・`source` |

購読のしかた（Google カレンダー・iPhone・Outlook）は https://yorozu-craft.com/calendar-help.html にあります。

## ライセンス

このフォルダのデータ（`tenmon.ics`・`tenmon.json`）は **CC0 1.0**（パブリック・ドメイン提供）です。全文は `LICENSE`。日時は国立天文台（暦計算室「暦要項」「日月食等データベース」、「ほしぞら情報」）の発表を書き写したもので、クレジットは国立天文台です。

このリポジトリのコード（`tools/` など）は MIT License（リポジトリ直下の `LICENSE`）のままです。

## 中身の決まり

- 期間は `tools/official-events.js` の `COVERAGE`（いまは 2026-09-23〜2027-12-31）。日食・月食はデータベースの日付（2030 年）まで
- お月見・惑星の見ごろは入れていません（ページの天文カレンダーにはあります）
- `UID` は現象と日付から作ります（`tenmon-moon-<日付>-<new|first|full|last>`、`tenmon-meteor-<流星群>-<年>`、`tenmon-eclipse-<日付>-<sun|moon>`）。書き出し直しても変わらないので、購読している端末で予定が重なりません
- カレンダーの説明（`X-WR-CALDESC`）に CC0・確認日・生成日・出典の URL、`REFRESH-INTERVAL` と `X-PUBLISHED-TTL` は 1 週間

## 作り方（保守）

`data/` のファイルは手で直しません。日付は `tools/official-events.js` にだけ書き、次で書き出します。テスト（`tests/ics.test.js`）が、書き出した結果とファイルが同じかを確かめます。生成日（`generated`・「生成日」）は中身が変わったときだけ、その日（日本時間）になります（同じデータなら何度書き出しても同じファイル）。

```
node tools/build-ics.js
```
