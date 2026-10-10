'use strict';
/* ギリシャ神話の読み物（shinwa/。ROADMAP K119）のページを作る。tools/build-pages.js から呼ぶ
   データと出典は tools/shinwa-data.js。系図の動き（親子をたどる）は shinwa/keizu.js */
const D = require('./shinwa-data.js');

module.exports = function buildShinwa({ page, esc, CONS }) {
  const files = [];
  const person = Object.fromEntries(D.PEOPLE.map(([id, ja, note]) => [id, { id, ja, note }]));
  const latin = Object.fromEntries(D.NAMES.map(n => [n[0], n[1]]));
  const conById = Object.fromEntries(CONS.map(c => [c.id, c]));
  const storyBySlug = Object.fromEntries(D.STORIES.map(s => [s.slug, s]));
  // 読み上げの録音（K140。tools/build-shinwa-audio.mjs が作る）。無い話はボタンを出さない
  const AUDIO = (() => { try { return require('../shinwa/audio/index.json').files; } catch (e) { return {}; } })();
  const cites = c => !c ? [] : Array.isArray(c[0]) ? c : [c];
  const citeHtml = c => cites(c).map(x => `<span class="cite">〔${esc(D.cite(x))}〕</span>`).join('');
  const kz = (id, rel) => person[id] ? `<a href="${rel}keizu.html#p-${id}">${esc(person[id].ja)}</a>` : esc(id);
  const storyTitle = s => `${s.title}（${s.sub}）`;
  const crumbs = (rel, here) => `<div class="crumbs"><a href="${rel}../">ほしぞらさんぽ</a> ／ ${here ? `<a href="${rel}">ギリシャ神話</a> ／ ${esc(here)}` : 'ギリシャ神話'}</div>`;
  const SRC_LINE = `原典: ヘシオドス・アポロドーロス・オウィディウス・アラトスの著作権の切れた英訳（版と訳者は下の「原典と版」）。最終確認日 ${D.CHECKED}。`;
  const srcDetails = (keys) => `<details class="srcs"><summary>原典と版</summary><ul class="src">${keys.map(k => {
    const s = D.SOURCES[k];
    return `<li id="src-${k}">${esc(s.title)}: ${esc(s.ed)}。<a href="${s.url}" rel="noopener">${esc(s.where || s.url)}</a></li>`;
  }).join('')}</ul><p class="lead">最終確認日 ${D.CHECKED}。</p></details>`;
  const subnav = (rel, cur) => `<nav class="toc" aria-label="ギリシャ神話の中">${[['', '入口'], ['keizu.html', '系図'], ['kamigami.html', '神の一覧'], ['seiza/', '星座の由来'], ['namae.html', '名前の由来'], ['hyoki.html', '表記の一覧']]
    .map(([h, l]) => `<a href="${rel}${h || './'}"${cur === h ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
  const breadcrumbLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) });
  const BASE = 'https://yorozu-craft.com/hoshizora-sanpo/';
  const article = (headline, description, file) => ({ '@context': 'https://schema.org', '@type': 'Article', headline, description, inLanguage: 'ja',
    dateModified: D.CHECKED, image: BASE + 'og-image.png', author: { '@type': 'Organization', name: 'yorozu-craft', url: 'https://yorozu-craft.com/' }, mainEntityOfPage: BASE + file });

  /* ---------- 星座の由来（12 本） ---------- */
  const zukanLinks = {};   // 星座図鑑から張るリンク（星座の id → 話）
  D.STORIES.forEach((s, i) => {
    const file = `shinwa/seiza/${s.slug}.html`;
    for (const id of s.cons) zukanLinks[id] = { href: `../shinwa/seiza/${s.slug}.html`, title: s.title, sub: s.sub };
    const prev = D.STORIES[(i + D.STORIES.length - 1) % D.STORIES.length], next = D.STORIES[(i + 1) % D.STORIES.length];
    const used = new Set(s.secs.flatMap(([, ps]) => ps.flatMap(([, c]) => cites(c).map(x => x[0]))));
    const secs = s.secs.map(([h, ps]) => `<h2>${esc(h)}</h2>\n${ps.map(([t, c]) => `<p>${esc(t)}${citeHtml(c)}</p>`).join('\n')}`).join('\n');
    const cons = s.cons.map(id => `<li><a href="../../zukan/${id}.html">${esc(conById[id].jp)}の見つけ方と星図（星座図鑑）</a></li>`).join('');
    const body = `${crumbs('../', s.title)}
<h1>${esc(s.title)}<small>${esc(s.sub)}</small></h1>
<p class="answer">${esc(s.lead)}</p>
${AUDIO[s.slug] ? `<p class="listen"><button type="button" class="listen-btn" data-audio="../audio/${s.slug}.mp3">🔊 読んでもらう</button><span>AI の声・約 ${Math.max(1, Math.round(AUDIO[s.slug].seconds / 60))} 分。読み間違えることがあります</span></p>` : ''}
${subnav('../', 'seiza/')}
${secs}
<h2>星空で見る</h2>
<p>星の並びと見ごろは星座図鑑に、話は原典の英訳に、と分けて置いています。</p>
<ul>${cons}<li><a href="../../?c=${s.cons[0]}">プラネタリウムで今夜の空を見る</a></li></ul>
<h2>出てくる人と神</h2>
<p>名前を押すと、系図でその親と子をたどれます。</p>
<ul class="names">${s.who.map(id => `<li>${kz(id, '../')}</li>`).join('')}</ul>
<p class="lead">${SRC_LINE}言い伝えは本によって違います。このページは、下の版で確かめられたことだけを書いた要約です。</p>
${srcDetails([...used].filter(k => D.SOURCES[k]))}
<nav class="pager" aria-label="前後の話"><a href="./${prev.slug}.html">← ${esc(prev.title)}</a><a href="./${next.slug}.html">${esc(next.title)} →</a></nav>${AUDIO[s.slug] ? '\n<script src="../listen.js" defer></script>' : ''}`;
    const description = `${s.lead.split('。')[0]}。${s.title}を、原典の英訳（${[...used].filter(k => ['hes', 'hh', 'apo', 'ovm', 'ovf', 'ara'].includes(k)).map(k => D.SOURCES[k].title.replace(/『.*』/, '')).filter((v, j, a) => a.indexOf(v) === j).join('・')}）で確かめて書きました。`;
    files.push({ file, html: page({ rel: '../../', file, title: `${s.title}｜${s.sub}｜ギリシャ神話｜ほしぞらさんぽ`, description, current: 'shinwa/', body,
      jsonld: [article(`${s.title}（${s.sub}）`, description, file), breadcrumbLd([['ほしぞらさんぽ', BASE], ['ギリシャ神話', BASE + 'shinwa/'], ['星座の由来', BASE + 'shinwa/seiza/'], [s.title, BASE + file]])] }) });
  });

  /* ---------- 星座の由来の一覧 ---------- */
  {
    const file = 'shinwa/seiza/index.html';
    const body = `${crumbs('../', '星座の由来')}
<h1>星座の由来<small>ギリシャ神話の 12 の話</small></h1>
<p class="answer">星座と結びついたギリシャ神話を 12 本、原典の英訳で確かめて書きました。星座が神話と結びついたことを原典で確かめられた話だけを選んでいます。</p>
${subnav('../', 'seiza/')}
<ul class="cards story">${D.STORIES.map(s => `<li><a href="./${s.slug}.html"><div><b>${esc(s.title)}</b><span>${esc(s.sub)}・${s.cons.map(id => esc(conById[id].jp)).join('・')}</span></div></a></li>`).join('')}</ul>
<p class="lead">${SRC_LINE}</p>`;
    const description = 'おおぐま座・おうし座・オリオン座・ふたご座など、ギリシャ神話と結びついた星座の由来 12 本。アポロドーロス・オウィディウス・アラトスの英訳で確かめた話だけ。';
    files.push({ file, html: page({ rel: '../../', file, title: '星座の由来｜ギリシャ神話の 12 の話｜ほしぞらさんぽ', description, current: 'shinwa/', body,
      jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: '星座の由来', description, url: BASE + 'shinwa/seiza/', inLanguage: 'ja' } }) });
  }

  /* ---------- 系図 ---------- */
  {
    const file = 'shinwa/keizu.html';
    const childrenOf = {};
    for (const [c, f, m] of D.PARENTS) for (const p of [f, m]) if (p) (childrenOf[p] = childrenOf[p] || []).push(c);
    const parentRow = Object.fromEntries(D.PARENTS.map(r => [r[0], r]));
    const rows = D.PEOPLE.map(([id, ja, note]) => {
      const r = parentRow[id];
      const parents = r ? [r[1], r[2]].filter(Boolean).map(p => `<a href="#p-${p}">${esc(person[p].ja)}</a>`).join('・') || '—' : '—';
      const kids = (childrenOf[id] || []).map(k => `<a href="#p-${k}">${esc(person[k].ja)}</a>`).join('・') || '—';
      return `<tr id="p-${id}"><td><b>${esc(ja)}</b>${note ? `<br><small>${esc(note)}</small>` : ''}</td><td>${parents}</td><td>${kids}</td><td><small>${r ? esc(D.cite(r[3])) : ''}${r && r[4] ? '。' + esc(r[4]) : ''}</small></td></tr>`;
    }).join('\n');
    const data = { people: Object.fromEntries(D.PEOPLE.map(([id, ja, note]) => [id, [ja, latin[ja] || '', note]])),
      parents: D.PARENTS.map(([c, f, m, src, note]) => [c, f, m, D.cite(src), note]), spouses: D.SPOUSES.map(([a, b, src]) => [a, b, D.cite(src)]) };
    const opts = D.PEOPLE.map(([id, ja]) => [id, ja]).sort((a, b) => a[1].localeCompare(b[1], 'ja')).map(([id, ja]) => `<option value="${id}">${esc(ja)}</option>`).join('');
    const body = `${crumbs('./', '系図')}
<h1>ギリシャ神話の系図<small>押して親と子をたどる</small></h1>
<p class="answer">名前を押すと、その神や人の親と子が出ます。ヘシオドス『神統記』とアポロドーロスの英訳で確かめた ${D.PEOPLE.length} 人です。</p>
${subnav('./', 'keizu.html')}
<p class="kz-find"><label>名前でさがす <select id="kz-pick"><option value="">えらぶ</option>${opts}</select></label></p>
<div id="keizu-result" class="kz" aria-live="polite"><noscript><p>この図は JavaScript で動きます。下の「全員の一覧」からもたどれます。</p></noscript></div>
<p>本によって親が違う神や人は、系図には 1 つの説を置き、ほかの説は「注」に書きました。</p>
<details class="kz-all"><summary>全員の一覧（親と子・出典）</summary>
<div class="scroll"><table class="kz-table"><thead><tr><th>名前</th><th>親</th><th>子</th><th>出典・注</th></tr></thead><tbody>
${rows}
</tbody></table></div></details>
<p class="lead">${SRC_LINE}</p>
${srcDetails(['hes', 'hh', 'apo'])}
<script type="application/json" id="kz-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script src="./keizu.js" defer></script>`;
    const description = 'ギリシャ神話の神々と英雄の系図。名前を押すと親と子をたどれる。ゼウス・ヘラ・アテナ・ペルセウスなど、ヘシオドスとアポロドーロスの英訳で確かめた親子。';
    files.push({ file, html: page({ rel: '../', file, title: 'ギリシャ神話の系図｜押して親子をたどる｜ほしぞらさんぽ', description, current: 'shinwa/', body,
      jsonld: [article('ギリシャ神話の系図', description, file), breadcrumbLd([['ほしぞらさんぽ', BASE], ['ギリシャ神話', BASE + 'shinwa/'], ['系図', BASE + file]])] }) });
  }

  /* ---------- 神の一覧 ---------- */
  {
    const file = 'shinwa/kamigami.html';
    const linkName = (n) => {
      const p = D.PLANETS.find(x => x.ja.startsWith(n)); if (p) return `<a href="./namae.html#planet">${esc(n)}</a>`;
      const e = D.ELEMENTS.find(x => x[2] === n); if (e) return `<a href="./namae.html#el-${e[1]}">${esc(n)}</a>`;
      return esc(n);
    };
    const rows = D.GODS.map(g => `<tr><td><a href="./keizu.html#p-${g.id}"><b>${esc(person[g.id].ja)}</b></a></td><td lang="en">${esc(g.en)}</td><td>${g.roman ? esc(g.roman) + `<br><small lang="la">${esc(latin[g.roman])}</small>` : '—'}</td><td>${esc(g.role)}</td>`
      + `<td>${g.seiza.map(sl => `<a href="./seiza/${sl}.html">${esc(storyBySlug[sl].title.replace(/の由来$/, ''))}</a>`).join('<br>') || '—'}</td><td>${g.links.map(linkName).join('<br>') || '—'}</td></tr>`).join('\n');
    const srcList = D.GODS.map(g => `<li>${esc(person[g.id].ja)}: 司るもの ${esc(D.cite(g.roleSrc))}${g.roman ? `、ローマ名 ${esc(D.cite(g.romanSrc))}` : ''}</li>`).join('');
    const body = `${crumbs('./', '神の一覧')}
<h1>ギリシャ神話の神の一覧<small>英語名・ローマ名・星座と元素</small></h1>
<p class="answer">主な神 ${D.GODS.length} 柱を、英語名・ローマ名（ラテン語の名）・司るものと、その神が出てくる星座の話・名前のついた惑星と元素で並べました。</p>
${subnav('./', 'kamigami.html')}
<div class="scroll"><table class="gods"><thead><tr><th>神</th><th>英語名</th><th>ローマ名</th><th>司るもの</th><th>星座の話</th><th>惑星・元素</th></tr></thead><tbody>
${rows}
</tbody></table></div>
<p>ローマ名は、ローマの人がこのギリシャの神と同じとみた神の名です。「—」は、同じとみたことを下の原典や資料で確かめられなかったものです。司るものは、讃歌や『神統記』がその神について書いていることを短くしました。</p>
<h2>英語名とローマ名</h2>
<p>英語の本では、ギリシャの神はギリシャ語の名（Zeus）で、惑星はローマ名（Jupiter）で書かれます。日本語のカタカナも、ギリシャ語の名とローマ名の 2 通りがあります。このサイトのカタカナは<a href="./hyoki.html">表記の一覧</a>の 1 つに決めています。</p>
<details class="srcs"><summary>行ごとの出典</summary><ul class="src">${srcList}</ul></details>
<p class="lead">${SRC_LINE}</p>
${srcDetails(['hes', 'hh', 'apo', 'ovm', 'ovf', 'gaz', 'nasa', 'ciaaw'])}`;
    const description = 'ギリシャ神話の神の一覧。ゼウス（Zeus・ユピテル）など主な神の英語名・ローマ名・司るものと、星座の話・惑星・元素とのつながりを表に。原典の英訳で確かめた。';
    files.push({ file, html: page({ rel: '../', file, title: 'ギリシャ神話の神の一覧｜英語名・ローマ名・星座｜ほしぞらさんぽ', description, current: 'shinwa/', body,
      jsonld: [article('ギリシャ神話の神の一覧', description, file), breadcrumbLd([['ほしぞらさんぽ', BASE], ['ギリシャ神話', BASE + 'shinwa/'], ['神の一覧', BASE + file]])] }) });
  }

  /* ---------- 名前の由来（惑星・衛星・元素） ---------- */
  {
    const file = 'shinwa/namae.html';
    const K89 = 'https://yorozu-craft.com/quiz-hiroba/genso/';
    const planets = D.PLANETS.map(p => `<tr><td><b>${esc(p.ja)}</b><br><small lang="en">${esc(p.en)}</small></td><td>${p.roman ? esc(p.roman) : '—'}</td><td>${kz(p.god, './')}</td><td><small>${esc(D.SOURCES[p.src[0]].short)}: ${esc(p.src[1])}</small></td></tr>`).join('\n');
    const moons = D.MOONS.map(m => `<tr><td lang="en">${esc(m.body)}</td><td>${esc(m.who)}</td><td>${esc(m.note)}${m.story ? `（<a href="./seiza/${m.story}.html">${esc(storyBySlug[m.story].title)}</a>）` : ''}</td></tr>`).join('\n');
    const els = D.ELEMENTS.map(([n, sym, ja, en, who, txt, src]) => `<tr id="el-${sym}"><td class="num">${n}</td><td><b>${esc(sym)}</b></td><td>${esc(ja)}<br><small lang="en">${esc(en)}</small></td><td>${esc(txt)}</td><td><small>${esc(D.SOURCES[src].short)}</small></td></tr>`).join('\n');
    const body = `${crumbs('./', '名前の由来')}
<h1>惑星と元素の名前の由来<small>ギリシャ・ローマの神から</small></h1>
<p class="answer">水星から海王星までの英語名はローマの神の名で、木星や土星の衛星、チタン・パラジウム・プロメチウムなどの元素にも神話の名がついています。</p>
${subnav('./', 'namae.html')}
<h2 id="planet">惑星の名前の由来</h2>
<p>惑星の英語名は IAU（国際天文学連合）が決めた名で、2006 年の決議は惑星を Mercury から Neptune までの 8 つとし、Pluto を準惑星としました。由来は NASA と IAU の惑星系命名作業部会の説明によります。</p>
<div class="scroll"><table><thead><tr><th>惑星</th><th>ローマの神</th><th>ギリシャの神</th><th>由来の出典</th></tr></thead><tbody>
${planets}
</tbody></table></div>
<h2>衛星の名前の由来</h2>
<p>木星の衛星はゼウス（ユピテル）が愛した相手や子孫の名、土星の衛星はティタンなどの名、と IAU が決めています。神話の人物から名づけられた衛星の一部です。</p>
<div class="scroll"><table><thead><tr><th>衛星（IAU の名）</th><th>神話の人物</th><th>IAU の説明</th></tr></thead><tbody>
${moons}
</tbody></table></div>
<h2>元素の名前の由来</h2>
<p>ギリシャ・ローマの神話の名がついた元素です。由来は IUPAC の委員会（CIAAW）の元素のページ、CIAAW にページの無い元素はロスアラモス国立研究所の周期表によります。日本語名は日本化学会の原子量表の名です。</p>
<div class="scroll"><table class="els"><thead><tr><th>番号</th><th>記号</th><th>元素</th><th>名前の由来</th><th>出典</th></tr></thead><tbody>
${els}
</tbody></table></div>
<p>トリウム（北欧の神）とバナジウム（北欧の女神）も神の名ですが、ギリシャ・ローマの神話ではないので入れていません。</p>
<a class="cta" href="${K89}">元素記号クイズ（118）で覚える →</a>
<p class="lead">${SRC_LINE}元素と惑星の由来は ${D.CHECKED} に各資料を開いて確かめました。</p>
${srcDetails(['iau06', 'gaz', 'nasa', 'ciaaw', 'lanl'])}`;
    const description = '水星（Mercury）・金星（Venus）など惑星の英語名と、木星・土星の衛星、チタン・パラジウム・プロメチウムなど元素の名前の由来をギリシャ・ローマ神話から。IAU・CIAAW の説明つき。';
    files.push({ file, html: page({ rel: '../', file, title: '惑星と元素の名前の由来｜ギリシャ神話｜ほしぞらさんぽ', description, current: 'shinwa/', body,
      jsonld: [article('惑星と元素の名前の由来', description, file), breadcrumbLd([['ほしぞらさんぽ', BASE], ['ギリシャ神話', BASE + 'shinwa/'], ['名前の由来', BASE + file]])] }) });
  }

  /* ---------- 表記の一覧 ---------- */
  {
    const file = 'shinwa/hyoki.html';
    const KIND_ORDER = ['神', 'ローマ', '人', '怪物', '星', '場所', '書名・人名', 'ことば'];
    const groups = KIND_ORDER.map(k => {
      const list = D.NAMES.filter(n => n[2] === k);
      if (!list.length) return '';
      return `<h3>${esc(k)}</h3><div class="scroll"><table class="hyoki"><thead><tr><th>このサイトの表記</th><th>ラテン文字</th><th>使わない表記</th></tr></thead><tbody>${list.map(([ja, la, , v]) =>
        `<tr><td>${esc(ja)}</td><td lang="en">${esc(la)}</td><td class="variant">${(v || []).map(esc).join('・') || ''}</td></tr>`).join('')}</tbody></table></div>`;
    }).join('\n');
    const body = `${crumbs('./', '表記の一覧')}
<h1>表記の一覧<small>カタカナを 1 つに決める</small></h1>
<p class="answer">ギリシャ神話の名前は本によってカタカナが違います（エウロペと<span class="variant">エウロパ</span>、ゼウスと<span class="variant">ジュピター</span>など）。このサイトでは 1 つに決め、決めた表記だけを本文に使います。</p>
${subnav('./', 'hyoki.html')}
<p>ギリシャの神と人はギリシャ語の名から、ローマの神はラテン語の名から書きます。伸ばす音は、広く使われている形に合わせて省いています。星座の名は日本の正式な名（ペガスス座など）です。本文と一覧が合っているかは、ページを作るたびに機械で突き合わせています。</p>
${groups}
<h3>星座・星・元素の名</h3><p class="names">${D.ASTRO.map(esc).join('・')}</p>
<p class="lead">${SRC_LINE}</p>`;
    const description = 'ギリシャ神話の固有名のカタカナ表記の一覧。ゼウス／ユピテル、エウロペ／エウロパなど、このサイトで使う表記とラテン文字、使わない表記。';
    files.push({ file, html: page({ rel: '../', file, title: 'ギリシャ神話の表記の一覧｜ほしぞらさんぽ', description, current: 'shinwa/', body,
      jsonld: breadcrumbLd([['ほしぞらさんぽ', BASE], ['ギリシャ神話', BASE + 'shinwa/'], ['表記の一覧', BASE + file]]) }) });
  }

  /* ---------- 入口 ---------- */
  {
    const file = 'shinwa/index.html';
    const srcRows = ['hes', 'hh', 'apo', 'ovm', 'ovf', 'ara'].map(k => `<tr><td>${esc(D.SOURCES[k].title)}</td><td>${esc(D.SOURCES[k].ed)}</td><td><a href="${D.SOURCES[k].url}" rel="noopener">${esc(D.SOURCES[k].where)}</a></td></tr>`).join('');
    const body = `${crumbs('./')}
<h1>ギリシャ神話<small>系図・神の一覧・星座の由来</small></h1>
<p class="answer">ギリシャ神話の系図、神の一覧、星座の由来 12 本、惑星と元素の名前の由来を、原典の英訳を読んで書きました。</p>
${subnav('./', '')}
<ul class="cards story">
<li><a href="./keizu.html"><div><b>系図</b><span>名前を押して親と子をたどる（${D.PEOPLE.length} 人）</span></div></a></li>
<li><a href="./kamigami.html"><div><b>神の一覧</b><span>英語名・ローマ名・司るもの・星座と元素</span></div></a></li>
<li><a href="./seiza/"><div><b>星座の由来</b><span>おおぐま座・オリオン座など 12 本</span></div></a></li>
<li><a href="./namae.html"><div><b>名前の由来</b><span>惑星・衛星・元素</span></div></a></li>
<li><a href="./hyoki.html"><div><b>表記の一覧</b><span>カタカナを 1 つに決めた表</span></div></a></li>
</ul>
<h2>星座の由来 12 本</h2>
<ul class="cards story">${D.STORIES.map(s => `<li><a href="./seiza/${s.slug}.html"><div><b>${esc(s.title)}</b><span>${esc(s.sub)}</span></div></a></li>`).join('')}</ul>
<h2>原典と訳</h2>
<p>話は、次の古い英訳（著作権の切れた版）を読んで、自分の言葉で書きました。訳文を写してはいません。原典で確かめられなかった話は書いていません。</p>
<div class="scroll"><table><thead><tr><th>原典</th><th>版と訳者</th><th>読んだ場所</th></tr></thead><tbody>${srcRows}</tbody></table></div>
<p>同じ話でも本によって筋が違うときは、どの本の話かを書いて並べました。各段落の終わりの〔 〕は、原典の巻・章・行です。</p>
<h2>注意とデータ</h2>
<p>このページは言い伝えの要約で、原典の訳ではありません。くわしくは上の版をご覧ください。</p>
<p>このページは入力を受け取らず、何も保存しません。</p>
<p class="lead">${SRC_LINE}</p>`;
    const description = 'ギリシャ神話の系図（押して親子をたどる）、神の一覧（英語名・ローマ名）、星座の由来 12 本、惑星と元素の名前の由来。アポロドーロス・ヘシオドス・オウィディウスの英訳で確かめて書いた読み物。';
    files.push({ file, html: page({ rel: '../', file, title: 'ギリシャ神話｜系図・神の一覧・星座の由来｜ほしぞらさんぽ', description, current: 'shinwa/', body,
      jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'ギリシャ神話', description, url: BASE + 'shinwa/', inLanguage: 'ja' } }) });
  }

  return { files, zukanLinks };
};
