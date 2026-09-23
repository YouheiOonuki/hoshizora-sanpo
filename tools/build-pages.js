'use strict';
/* 読みものページを生成する: 星座図鑑（zukan/）、このアプリについて、プライバシーポリシー、sitemap.xml
 * 使い方: node tools/build-pages.js
 * 星座の文章や星のデータは data.js / catalog.js から読むので、データを直したら再実行する。 */
const fs = require('fs');
const path = require('path');
const A = require('../astro.js');
const { CONS, SEASON_KANA } = require('../data.js');
const { CATALOG } = require('../catalog.js');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://yorozu-craft.com/hoshizora-sanpo/';
const UPDATED = '2026-09-23';
const TOKYO = { lat: 35.681, lon: 139.767 };
const DEG = A.DEG;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- 共通の枠 ---------------- */
const ADSENSE = `<meta name="google-adsense-account" content="ca-pub-5375267956079717">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5375267956079717"
     crossorigin="anonymous"></script>`;
const BEACON = `<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "b79bf821e1fd4b6683866d493b1de426"}'></script><!-- End Cloudflare Web Analytics -->`;

function page({ rel, file, title, description, current, body, jsonld }) {
  const url = BASE + file.replace(/index\.html$/, '');
  const nav = [['', 'プラネタリウム'], ['zukan/', '星座図鑑'], ['about.html', 'このアプリについて']]
    .map(([href, label]) => `<a href="${rel}${href || './'}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${file.startsWith('zukan/') && file !== 'zukan/index.html' ? 'article' : 'website'}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="ja_JP">
<meta property="og:image" content="${BASE}og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="yorozu-craft">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#070b18">
<link rel="icon" href="${rel}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${rel}apple-touch-icon.png">
<link rel="manifest" href="${rel}manifest.webmanifest">
${jsonld ? `<script type="application/ld+json">\n${JSON.stringify(jsonld, null, 1)}\n</script>\n` : ''}${ADSENSE}
<link rel="stylesheet" href="${rel}pages.css">
</head>
<body>
<header class="site"><div class="wrap">
  <a class="logo" href="${rel}"><img src="${rel}favicon.svg" alt="" width="28" height="28">ほしぞらさんぽ</a>
  <nav aria-label="サイト内">${nav}</nav>
</div></header>
<main class="wrap">
${body}
</main>
<footer class="site"><div class="wrap">
  <nav><a href="https://yorozu-craft.com/">yorozu-craft トップ</a><a href="${rel}">プラネタリウム</a><a href="${rel}zukan/">星座図鑑</a><a href="https://yorozu-craft.com/about.html#hoshizora-sanpo">運営者情報</a><a href="https://yorozu-craft.com/privacy-policy.html#hoshizora-sanpo">プライバシーポリシー</a></nav>
  &copy; 2026 yorozu-craft. All rights reserved.
</div></footer>
${BEACON}
</body>
</html>
`;
}

/* ---------------- 星図（SVG） ---------------- */
function bvColor(bv) {
  if (bv < -0.05) return '#a8c0ff'; if (bv < 0.2) return '#d8e2ff'; if (bv < 0.5) return '#f6f4ff';
  if (bv < 0.9) return '#fff2da'; if (bv < 1.4) return '#ffd9a4'; return '#ff9d68';
}
function bvName(bv) {
  if (bv < -0.05) return '青白'; if (bv < 0.2) return '白'; if (bv < 0.5) return '黄白';
  if (bv < 0.9) return '黄'; if (bv < 1.4) return 'だいだい'; return '赤';
}
/** 星座の中心（J2000） */
function center(c) {
  let x = 0, y = 0, z = 0;
  for (const s of c.ss) { const a = s[0] * 15 * DEG, d = s[1] * DEG; x += Math.cos(d) * Math.cos(a); y += Math.cos(d) * Math.sin(a); z += Math.sin(d); }
  const n = Math.hypot(x, y, z);
  return { ra: Math.atan2(y, x), dec: Math.asin(z / n) };
}
/** 心射図法。北が上・東が左（空を見上げたときの向き） */
function gnomonic(c0, raH, decD) {
  const a = raH * 15 * DEG, d = decD * DEG, da = a - c0.ra;
  const cosc = Math.sin(c0.dec) * Math.sin(d) + Math.cos(c0.dec) * Math.cos(d) * Math.cos(da);
  if (cosc < 0.2) return null;
  const xi = Math.cos(d) * Math.sin(da) / cosc;
  const eta = (Math.cos(c0.dec) * Math.sin(d) - Math.sin(c0.dec) * Math.cos(d) * Math.cos(da)) / cosc;
  return [-xi, -eta];
}
function chartSvg(c, { w = 640, h = 420, labels = true, faint = 5.0, id = c.id } = {}) {
  const c0 = center(c);
  const pts = c.ss.map(s => gnomonic(c0, s[0], s[1]));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const pad = labels ? 0.18 : 0.12;
  const spanX = Math.max(maxX - minX, 0.05), spanY = Math.max(maxY - minY, 0.05);
  const k = Math.min(w / (spanX * (1 + 2 * pad)), h / (spanY * (1 + 2 * pad)));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const X = p => (w / 2 + (p[0] - cx) * k).toFixed(1), Y = p => (h / 2 + (p[1] - cy) * k).toFixed(1);
  const inside = p => p && Math.abs((p[0] - cx) * k) < w / 2 && Math.abs((p[1] - cy) * k) < h / 2;
  const sr = m => Math.max(0.7, (labels ? 4.4 : 3.2) - m * (labels ? 0.78 : 0.62));
  let bg = '';
  for (let i = 0; i < CATALOG.length; i += 4) {
    const mag = CATALOG[i + 2] / 100; if (mag > faint) break;          // 明るい順に並んでいる
    const p = gnomonic(c0, CATALOG[i] / 1000, CATALOG[i + 1] / 100);
    if (!inside(p)) continue;
    bg += `<circle cx="${X(p)}" cy="${Y(p)}" r="${sr(mag).toFixed(2)}" fill="${bvColor(CATALOG[i + 3] / 100)}" opacity="0.55"/>`;
  }
  const lines = c.ln.map(([a, b]) => `<line x1="${X(pts[a])}" y1="${Y(pts[a])}" x2="${X(pts[b])}" y2="${Y(pts[b])}"/>`).join('');
  const main = c.ss.map((s, i) => s[6]
    ? `<circle cx="${X(pts[i])}" cy="${Y(pts[i])}" r="${labels ? 14 : 6}" fill="url(#g-${id})"/>`
    : `<circle cx="${X(pts[i])}" cy="${Y(pts[i])}" r="${sr(s[2]).toFixed(2)}" fill="${bvColor(s[3] ?? 0.3)}"/>`).join('');
  const names = labels ? c.ss.map((s, i) => s[4]
    ? `<text x="${(+X(pts[i]) + 10).toFixed(1)}" y="${(+Y(pts[i]) + 6).toFixed(1)}">${esc(s[4].split('（')[0])}</text>` : '').join('') : '';
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(c.jp)}の星図"><defs><radialGradient id="g-${id}"><stop offset="0" stop-color="#cfd8ff" stop-opacity=".8"/><stop offset="1" stop-color="#cfd8ff" stop-opacity="0"/></radialGradient></defs>`
    + `<rect width="${w}" height="${h}" fill="#050814"/>${bg}`
    + `<g stroke="#7fd4e8" stroke-opacity=".55" stroke-width="${labels ? 1.3 : 1}">${lines}</g>${main}`
    + (names ? `<g fill="#e8ecf7" fill-opacity=".85" font-size="19" font-family="sans-serif">${names}</g>` : '') + `</svg>`;
}

/* ---------------- 見ごろの計算（東京・夜9時） ---------------- */
function altAt(c0, ms, lat, lon) {
  const lst = A.lstRad(ms, lon);
  return A.altAz(Math.sin(c0.dec), Math.cos(c0.dec), c0.ra, lst, Math.sin(lat * DEG), Math.cos(lat * DEG))[0] / DEG;
}
function viewing(c) {
  const c0 = center(c), decD = c0.dec / DEG;
  const maxAlt = 90 - Math.abs(TOKYO.lat - decD);
  // 夜9時（日本時間）に南中する日: 5日おきに1年分しらべる
  let best = null, bestH = Infinity;
  for (let d = 0; d < 365; d += 5) {
    const ms = Date.UTC(2027, 0, 1, 12, 0) + d * 86400000;
    const lst = A.lstRad(ms, TOKYO.lon);
    let H = ((lst - c0.ra) % A.TAU + A.TAU) % A.TAU; if (H > Math.PI) H -= A.TAU;
    if (Math.abs(H) < bestH) { bestH = Math.abs(H); best = new Date(ms); }
  }
  const month = best.getUTCMonth() + 1, day = best.getUTCDate();
  const part = day <= 10 ? '上旬' : day <= 20 ? '中旬' : '下旬';
  // 夜9時に高度20°以上になる月
  const months = [];
  for (let m = 0; m < 12; m++) if (altAt(c0, Date.UTC(2027, m, 15, 12, 0), TOKYO.lat, TOKYO.lon) >= 20) months.push(m + 1);
  const starMax = Math.max(...c.ss.map(s => 90 - Math.abs(TOKYO.lat - s[1])));
  const circumpolar = c.ss.every(s => s[1] > 90 - TOKYO.lat);          // どの星も地平線の下に沈まない
  const dir = decD > TOKYO.lat ? '北' : '南';
  const height = maxAlt > 75 ? '頭の真上近く' : maxAlt > 50 ? '高いところ' : maxAlt > 25 ? '中くらいの高さ' : '低いところ';
  let text, short;
  if (starMax < 3) {
    short = '日本の本土からは見えない';
    text = `東京など日本の本土からは、地平線の上に昇りません。${c.fun.includes('石垣島') ? '沖縄の石垣島あたりまで南へ行くと、地平線すれすれに見えることがあります。' : ''}南半球のオーストラリアなどでは、よく見える星座です。`;
  } else if (maxAlt < 10) {
    short = '日本からは南の地平線近くに一部だけ';
    text = `日本の本土からは、星座の北の一部が南の地平線近くに見えるだけです。見ごろは${month}月${part}の夜9時ごろ。南が開けた場所でさがしてみてください。南半球では空高く全体が見えます。`;
  } else if (circumpolar) {
    short = '一年中見える（北の空）';
    text = `東京では一年中地平線の下に沈まない、北の空の星座です。北極星のまわりを1日に1回まわるので、季節や時刻で位置と高さが変わります。夜9時にもっとも高く見えるのは${month}月${part}ごろで、北の空の${height}（高さ約${Math.round(maxAlt)}°）に見えます。`;
  } else {
    const range = months.length ? `${months[0]}月〜${months[months.length - 1]}月` : `${month}月ごろ`;
    short = `${month}月${part}の夜9時ごろ${dir}の空`;
    const where = maxAlt > 75 ? '頭の真上近く' : `${dir}の空の${height}`;
    text = `いちばんの見ごろは${month}月${part}の夜9時ごろで、${where}（高さ約${Math.round(maxAlt)}°）に見えます。夜9時に見やすい高さにあるのは、おおよそ${range}です。時刻を早めればその前の季節、遅くすればあとの季節にも見られます。`;
  }
  return { text, short, maxAlt, month };
}
function neighbors(c) {
  const c0 = center(c);
  return CONS.filter(o => o !== c).map(o => {
    const c1 = center(o);
    const d = Math.acos(Math.sin(c0.dec) * Math.sin(c1.dec) + Math.cos(c0.dec) * Math.cos(c1.dec) * Math.cos(c0.ra - c1.ra)) / DEG;
    return [o, d];
  }).filter(x => x[1] < 32).sort((a, b) => a[1] - b[1]).slice(0, 4).map(x => x[0]);
}

/* ---------------- 星座のページ ---------------- */
const GROUPS = [
  ['春の星座', ['春', '春（北の空）']],
  ['夏の星座', ['初夏', '夏', '夏（北の空）']],
  ['秋の星座', ['秋', '秋〜冬']],
  ['冬の星座', ['冬', '冬〜春']],
  ['一年中見える北の星座', ['一年中（北の空）']],
  ['南半球の星座', ['南半球']],
];
const ordered = GROUPS.flatMap(([, keys]) => CONS.filter(c => keys.includes(c.season)));
const firstSentence = s => s.split('。')[0] + '。';

function conPage(c, i) {
  const v = viewing(c);
  const prev = ordered[(i - 1 + ordered.length) % ordered.length], next = ordered[(i + 1) % ordered.length];
  const named = c.ss.filter(s => s[4]);
  const seasonLabel = c.season === '南半球' ? '南半球の星座' : `${c.season}の星座`;
  const rows = named.map(s => `<tr><td><span class="dot" style="color:${bvColor(s[3] ?? 0.3)};background:${bvColor(s[3] ?? 0.3)}"></span>${esc(s[4])}</td>`
    + `<td class="num">${s[6] ? '—' : s[2].toFixed(1) + '等'}</td><td class="num">${s[5] ? '約' + s[5] + '光年' : '—'}</td><td>${s[6] ? '星の集まり' : bvName(s[3] ?? 0.3)}</td></tr>`).join('');
  const nb = neighbors(c).map(o => `<a href="./${o.id}.html">${esc(o.jp)}</a>`).join('・');
  const title = `${c.jp}の見つけ方と神話｜${seasonLabel}｜ほしぞらさんぽ`;
  const description = `${c.jp}（${c.en}）は${seasonLabel}。${v.short}。${firstSentence(c.adl)}主な星・まめちしき・子ども向けのひらがな解説を星図つきで紹介します。`;
  const body = `<div class="crumbs"><a href="../">ほしぞらさんぽ</a> ／ <a href="./">星座図鑑</a> ／ ${esc(c.jp)}</div>
<h1>${esc(c.jp)}<small>${esc(c.kana)}ざ ・ ${esc(c.en)}</small></h1>
<div class="chips"><span class="chip gold">${esc(seasonLabel)}</span><span class="chip">${esc(v.short)}</span></div>
<figure class="chart">${chartSvg(c)}<figcaption>北が上・東が左（空を見上げたときの向き）。線でつないだ星が${esc(c.jp)}、うすい点はまわりの星（5等星まで）。</figcaption></figure>
<a class="cta" href="../?c=${c.id}">プラネタリウムで${esc(c.jp)}を見る →</a>
<h2>見つけ方</h2>
<p>${esc(v.text)}</p>
<h2>星座のお話</h2>
<p>${c.adl}</p>
<div class="box fun"><b>まめちしき</b>　${c.fun}</div>
<h2>こどもと読む（ひらがな）</h2>
<div class="box kids">${c.kid}</div>
${named.length ? `<h2>主な星</h2><div class="scroll"><table><thead><tr><th>名前</th><th>明るさ</th><th>距離</th><th>色</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="lead">色は星の表面温度のめやすです。青白い星ほど熱く、赤い星ほど温度が低くなります。</p>` : ''}
${nb ? `<h2>近くの星座</h2><p>${nb}</p>` : ''}
<nav class="pager" aria-label="前後の星座"><a href="./${prev.id}.html">← ${esc(prev.jp)}</a><a href="./${next.id}.html">${esc(next.jp)} →</a></nav>`;
  const jsonld = [{
    '@context': 'https://schema.org', '@type': 'Article', headline: `${c.jp}の見つけ方と神話`, description,
    inLanguage: 'ja', dateModified: UPDATED, image: BASE + 'og-image.png',
    author: { '@type': 'Organization', name: 'yorozu-craft', url: 'https://yorozu-craft.com/' },
    mainEntityOfPage: `${BASE}zukan/${c.id}.html`,
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ほしぞらさんぽ', item: BASE },
      { '@type': 'ListItem', position: 2, name: '星座図鑑', item: BASE + 'zukan/' },
      { '@type': 'ListItem', position: 3, name: c.jp, item: `${BASE}zukan/${c.id}.html` }],
  }];
  return page({ rel: '../', file: `zukan/${c.id}.html`, title, description, current: 'zukan/', body, jsonld });
}

function zukanIndex() {
  const sections = GROUPS.map(([label, keys]) => {
    const list = CONS.filter(c => keys.includes(c.season));
    return `<h2>${label}</h2><ul class="cards">${list.map(c => `<li><a href="./${c.id}.html">${chartSvg(c, { w: 64, h: 64, labels: false, faint: 4.5, id: c.id + '-s' })}<div><b>${esc(c.jp)}</b><span>${esc(viewing(c).short)}</span></div></a></li>`).join('')}</ul>`;
  }).join('\n');
  const body = `<div class="crumbs"><a href="../">ほしぞらさんぽ</a> ／ 星座図鑑</div>
<h1>星座図鑑<small>${CONS.length}の星座の見つけ方と神話</small></h1>
<p class="lead">季節ごとの星座を、星図・見ごろ・神話・主な星といっしょに紹介します。見ごろは東京で夜9時に見たときのめやすです。ひらがなの解説もあるので、お子さんといっしょに読めます。</p>
<a class="cta" href="../">今夜の星空をプラネタリウムで見る →</a>
${sections}`;
  const description = `黄道12星座やオリオン座・北斗七星・南十字星など${CONS.length}星座の見つけ方と神話を、星図・見ごろ・主な星つきで紹介。子ども向けのひらがな解説も。`;
  return page({ rel: '../', file: 'zukan/index.html', title: '星座図鑑｜季節の星座の見つけ方と神話｜ほしぞらさんぽ', description, current: 'zukan/', body,
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: '星座図鑑', description, url: BASE + 'zukan/', inLanguage: 'ja' } });
}

/* ---------------- このアプリについて ---------------- */
function about() {
  const body = `<h1>このアプリについて<small>つかいかた ・ しくみ ・ データの出典</small></h1>
<p>「ほしぞらさんぽ」は、いつ・どこの星空でも天文計算で再現する、ブラウザで動く無料のプラネタリウムです。星座をタップすると、その星座にまつわる神話やまめちしきが読めます。ひらがなモードにすると、5歳くらいのお子さんから読める文章に切りかわります。</p>
<a class="cta" href="./">プラネタリウムをひらく →</a>

<h2>つかいかた</h2>
<dl class="info">
<dt>見まわす</dt><dd>画面をドラッグ（スマホは指でなぞる）。パソコンでは矢印キーでも動かせます。</dd>
<dt>ズーム</dt><dd>2本指でひろげる・つまむ、またはマウスホイール。ズームすると暗い星や星の名前が見えてきます。</dd>
<dt>くわしく見る</dt><dd>星座・明るい星・月・惑星・太陽をタップすると、説明がひらきます。</dd>
<dt>時間たび</dt><dd>スライダーで前後12時間、ボタンで1日・1ヶ月ずつ動かせます。「早送り」で星がまわる日周運動を見られます（速さは60倍・600倍・3600倍）。</dd>
<dt>場所</dt><dd>札幌・東京・大阪・福岡・那覇・石垣島・シドニーと、いまいる場所（位置情報）から選べます。時刻はその土地の時刻で表示します。</dd>
<dt>クイズ</dt><dd>いま空に出ている星座から5問。見つからないときは「ヒント」で答えの方向へ視点が動きます。</dd>
<dt>ひらがなモード</dt><dd>画面の文字と解説がすべてひらがなになります。</dd>
<dt>赤いライト</dt><dd>画面全体を赤くして、夜の屋外で暗さに慣れた目を守ります。画面の明るさも下げるとより効果的です。</dd>
<dt>オフライン</dt><dd>一度ひらくとブラウザに保存され、電波のない場所でも使えます。ホーム画面に追加するとアプリのように起動できます。</dd>
</dl>

<h2>しくみと精度</h2>
<p>星の位置は、実在の星 約3,300個（5.6等星まで）の座標に、地球の歳差（首ふり運動）を反映して計算しています。太陽・月・惑星（水星・金星・火星・木星・土星）は軌道要素から位置と明るさを計算し、月は満ち欠けと、地表から見たときのずれ（視差）も反映しています。</p>
<p>精度は肉眼で星空を見るためのめやすとして十分な程度です（月や惑星の位置のずれは、満月の直径の数分の一以下）。惑星の位置は1800〜2050年の範囲を想定した計算式を使っています。大気による浮き上がり（大気差）や、天王星・海王星、彗星、人工衛星は表示していません。</p>

<h2>データの出典</h2>
<ul>
<li>恒星: Yale Bright Star Catalogue 第5版（Hoffleit &amp; Warren, 1991）。JSON 化したデータ <a href="https://github.com/brettonw/YaleBrightStarCatalog">brettonw/YaleBrightStarCatalog</a>（MIT License, © 2016 Bretton Wade）を利用</li>
<li>惑星の軌道要素: E. M. Standish, “Keplerian Elements for Approximate Positions of the Major Planets”（NASA JPL）</li>
<li>月の位置: Paul Schlyter, “How to compute planetary positions” の簡略理論</li>
<li>惑星の明るさ: Mallama &amp; Hilton (2018) の式</li>
</ul>
<p>星座の神話は、ギリシャ神話などの一般的な伝承をもとにした要約です。伝承には諸説があります。</p>

<h2>ご利用上の注意</h2>
<p>当アプリの天体の位置は計算による近似値です。天体観測の計画などに使う場合は、国立天文台などの公的な情報もあわせてご確認ください。</p>
<p>太陽は絶対に肉眼や双眼鏡・望遠鏡で直接見ないでください。目を傷めます。夜の観察では、足もとや周囲の安全に気をつけ、お子さんは大人といっしょに出かけてください。</p>
<p>運営者情報・免責事項は <a href="https://yorozu-craft.com/about.html#hoshizora-sanpo">yorozu-craft 共通の運営者情報</a>、位置情報などデータの取り扱いは <a href="https://yorozu-craft.com/privacy-policy.html#hoshizora-sanpo">yorozu-craft 共通のプライバシーポリシー</a> をご覧ください。</p>`;
  return page({ rel: './', file: 'about.html', title: 'このアプリについて｜ほしぞらさんぽ',
    description: 'Webプラネタリウム「ほしぞらさんぽ」のつかいかた、星の位置の計算のしくみと精度、データの出典。', current: 'about.html', body });
}

/* ---------------- プライバシーポリシー ---------------- */
function privacy() {
  // プライバシーポリシーは yorozu-craft 全体で共通のページに移した。古い URL で来た人をそちらへ案内する
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>プライバシーポリシー（移動しました）｜yorozu-craft</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="https://yorozu-craft.com/privacy-policy.html">
<meta http-equiv="refresh" content="0; url=https://yorozu-craft.com/privacy-policy.html#hoshizora-sanpo">
</head>
<body>
<p>プライバシーポリシーは、yorozu-craft のすべてのツールで共通のページに移りました。</p>
<p><a href="https://yorozu-craft.com/privacy-policy.html#hoshizora-sanpo">プライバシーポリシーのページへ移動する</a></p>
</body>
</html>
`;
}

/* ---------------- 書き出し ---------------- */
fs.mkdirSync(path.join(ROOT, 'zukan'), { recursive: true });
const out = (file, html) => fs.writeFileSync(path.join(ROOT, file), html);
out('zukan/index.html', zukanIndex());
ordered.forEach((c, i) => out(`zukan/${c.id}.html`, conPage(c, i)));
out('about.html', about());
out('privacy-policy.html', privacy());

const urls = [['', '1.0', 'weekly'], ['zukan/', '0.8', 'monthly'], ...ordered.map(c => [`zukan/${c.id}.html`, '0.7', 'monthly']),
  ['about.html', '0.4', 'yearly']];
out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, p, f]) => `  <url>
    <loc>${BASE}${u}</loc>
    <lastmod>${UPDATED}</lastmod>
    <changefreq>${f}</changefreq>
    <priority>${p}</priority>
  </url>`).join('\n')}
</urlset>
`);
console.log(`zukan: ${ordered.length} pages + index, about, privacy-policy, sitemap (${urls.length} urls)`);
