'use strict';
/* 英語版の読みものページ（en/calendar/ と en/guide.html）を作る。tools/build-pages.js から呼ばれる
 * - 日付・時刻は日本語版と同じ tools/official-events.js（国立天文台の発表）から取る。値を書き写さない
 * - 満月・新月・時刻のある流星群の極大は、同じ瞬間を UTC で書き、ページ内のスクリプトで見る人の時刻も出す
 * - 時刻の無いもの（日付だけの極大・惑星・日食・月食）は日本時間の日付なので「JST」と書く
 * - 「See the sky」は場所を指定せず、見る人の場所の現地時刻で開く（main.js の lt / d&tw）
 * - 月の明るさ（極大の瞬間に光っている割合）と放射点の高さは astro.js で計算する */
const A = require('../astro.js');
const O = require('./official-events.js');
const C = require('./calendar-pages.js');
const { CONS } = require('../data.js');

const DEG = A.DEG, HOUR = 3600000, DAY = 86400000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PLANET = { mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' };
const con = id => (CONS.find(c => c.id === id) || {}).en || id;

/* 流星群の英語名と、年によらない説明（日本語版 SHOWERS の訳。母天体は国立天文台の解説ページと同じ内容） */
const SHOWERS_EN = {
  perseids: { name: 'Perseids', long: 'Perseid meteor shower', season: 'every year in mid-August',
    parent: 'comet 109P/Swift–Tuttle',
    feature: 'The shower is reliable every year, and in the Northern Hemisphere it comes on mild summer nights. The radiant is already up in the evening and climbs toward dawn, so the best hours are from after midnight until the sky starts to brighten. From the Southern Hemisphere the radiant stays low or below the horizon, so fewer meteors are seen.' },
  geminids: { name: 'Geminids', long: 'Geminid meteor shower', season: 'every year in mid-December',
    parent: 'asteroid 3200 Phaethon, which is thought to have been active like a comet in the past',
    feature: 'It is one of the richest showers of the year. The radiant is up almost all night, so you can watch from evening until dawn. In the Northern Hemisphere it comes in one of the coldest times of year, so dress warmly.' },
  quadrantids: { name: 'Quadrantids', long: 'Quadrantid meteor shower', season: 'every year in early January',
    parent: 'not settled yet; asteroid 2003 EH1 is the leading candidate',
    feature: 'Its peak is short, and the count changes a lot from year to year. It is named after Quadrans Muralis, a constellation no longer in use; the radiant lies near the border of Boötes and Draco. The radiant climbs after midnight, and the best time is before dawn.' },
  orionids: { name: 'Orionids', season: 'late October' },
  leonids: { name: 'Leonids', season: 'mid-November' },
  lyrids: { name: 'Lyrids', season: 'late April' },
  'eta-aquariids': { name: 'Eta Aquariids', season: 'early May' },
  'delta-aquariids-s': { name: 'Southern Delta Aquariids', season: 'late July to early August' },
  'taurids-s': { name: 'Southern Taurids', season: 'early November' },
  'taurids-n': { name: 'Northern Taurids', season: 'mid-November' },
};
const ECLIPSE_TYPE = { '皆既月食': 'Total lunar eclipse', '部分月食': 'Partial lunar eclipse', '皆既日食': 'Total solar eclipse',
  '金環日食': 'Annular solar eclipse', '部分日食': 'Partial solar eclipse' };
const JAPAN_VIS = { visible: 'Visible from Japan', none: 'Not visible from Japan', central: 'Central eclipse near Japan (annular or total in part of the area)' };
const TSUKIMI = { '中秋の名月': 'Chūshū no meigetsu (mid-autumn moon)', '十三夜': 'Jūsan-ya (13th-night moon)' };

/** 出典の英語表記（キーから。国立天文台のページはどれも日本語） */
function srcEn(key) {
  const [, url] = O.SRC[key];
  let m;
  if ((m = key.match(/^rekiyou(\d{4})-(moon|eclipse)$/))) return [`NAOJ Calendar and Ephemeris Office, Rekiyōkō ${m[1]}: ${m[2] === 'moon' ? 'new and full moons' : 'eclipses'}`, url];
  if (key === 'eclipsedb') return ['NAOJ Calendar and Ephemeris Office, eclipse database (2026–2030, visibility near Japan)', url];
  if ((m = key.match(/^sky(\d{4})-(\d\d)(?:-(\w+))?$/))) {
    const topic = { meigetsu: 'mid-autumn moon', geminids: 'Geminids', quadrantids: 'Quadrantids' }[m[3]];
    return [`NAOJ, ${topic ? topic + ', ' : 'sky guide (Hoshizora Jōhō), '}${MONTH[+m[2] - 1]} ${m[1]}`, url];
  }
  throw new Error('英語の出典名が無い: ' + key);
}

/* ---------------- 日付の書き方 ---------------- */
const pad = n => String(n).padStart(2, '0');
const utcDate = ms => new Date(ms).toISOString().slice(0, 10);
function utcLabel(ms, withYear = true) {
  const d = new Date(ms);
  return `${WD[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}${withYear ? ', ' + d.getUTCFullYear() : ''}`;
}
const utcTime = ms => { const d = new Date(ms); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; };
/** 'YYYY-MM-DD'（日本時間の日付）→ 曜日つき */
function jstDateLabel(date, withYear = true) {
  const [y, m, d] = date.split('-').map(Number), w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WD[w]}, ${MON[m - 1]} ${d}${withYear ? ', ' + y : ''}`;
}
/** 見る人の時刻を入れる <time>（ページ内のスクリプトが中身を入れる） */
const localTime = ms => `<time class="yt" datetime="${new Date(ms).toISOString()}"></time>`;

/** プラネタリウムへのリンク（en/calendar/ から見た相対パス。場所は見る人の設定のまま） */
function sky(q) {
  return '../?' + Object.entries(q).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&amp;');
}
const localClock = iso => iso.slice(0, 16);                        // '2027-08-14T03:00+09:00' → その時計の時刻

/** 流星数（ほしぞら情報の「1時間にN〜M個程度」）→ 英語。形が違えばビルドを止める */
function rateEn(s) {
  const m = s.match(/^1時間に(\d+)(?:〜(\d+))?個程度$/);
  if (!m) throw new Error('流星数の形が想定外: ' + s);
  return `about ${m[1]}${m[2] ? '–' + m[2] : ''} per hour`;
}
/** 極大の瞬間（時刻の無い日は日本時間の正午）に月が光っている割合 */
function moonAt(rec) {
  const ms = rec.peak.length > 10 ? Date.parse(rec.peak) : Date.parse(rec.peak + 'T12:00:00+09:00');
  const M = A.moon(ms);
  return `${Math.round(M.illum * 100)}% lit${M.illum > 0.03 && M.illum < 0.97 ? M.waxing ? ', waxing' : ', waning' : ''}`;
}

/* ---------------- 全イベント（日本語版の allEvents をそのまま使い、英語の表示を足す） ---------------- */
function eventsEn() {
  return C.allEvents().map(e => {
    const x = { ...e, ms: e.at ? Date.parse(e.at) : null };
    x.date = x.ms ? utcDate(x.ms) : e.date;                         // 時刻があれば UTC の日付、無ければ日本時間の日付
    x.jst = !x.ms;
    if (e.kind === 'full' || e.kind === 'new') {
      const note = e.kind === 'full' && O.MOON_NOTES.find(n => n.date === e.date);
      x.chip = 'Moon';
      x.title = e.kind === 'full' ? 'Full moon' : 'New moon';
      x.sub = note ? note.en : e.kind === 'new' ? 'No moonlight: a good time for stargazing' : '';
      x.link = sky({ lt: `${x.date}T21:00`, look: e.kind === 'full' ? 'moon' : '' });
      x.more = e.kind === 'full' ? 'full-moon.html' : 'new-moon.html';
    } else if (e.kind === 'moonview') {
      const v = O.MOON_VIEWING.find(v => v.date === e.date && v.name === e.title);
      x.chip = 'Tsukimi'; x.title = `Moon viewing in Japan: ${TSUKIMI[v.name]}`; x.sub = v.en || '';
      x.link = sky({ lt: `${e.date}T21:00`, look: 'moon' }); x.more = 'full-moon.html#tsukimi';
    } else if (e.kind === 'meteor') {
      const s = SHOWERS_EN[e.shower], r = e.rec;
      x.chip = 'Meteors'; x.title = `${s.name} peak`; x.showerEn = s;
      x.sub = `Up to ${rateEn(r.rate)} (NAOJ, for dark skies in Japan). Moon at peak: ${moonAt(r)}.`;
      x.link = sky({ lt: localClock(e.view), look: e.look });
      x.more = s.long ? `${e.shower}.html` : `meteor-showers.html#${e.shower}`;
    } else if (e.kind === 'eclipse') {
      const r = e.rec;
      x.chip = 'Eclipse'; x.title = ECLIPSE_TYPE[r.type]; x.sub = JAPAN_VIS[r.japan] + (r.en ? `. ${r.en}` : '');
      if (!x.title) throw new Error('食の種類の英語が無い: ' + r.type);
      const dl = r.dateLabel && r.dateLabel.match(/^(\d{4})年(\d+)月(\d+)〜(\d+)日$/);     // 例: 2027年2月6〜7日
      if (r.dateLabel && !dl) throw new Error('日付の書き方が想定外: ' + r.dateLabel);
      x.dateText = dl ? `${MON[+dl[2] - 1]} ${dl[3]}–${dl[4]}, ${dl[1]}` : null;
      x.more = r.body === 'sun' ? 'solar-eclipse.html' : 'lunar-eclipse.html';
    } else if (e.kind === 'planet') {
      const r = e.rec, p = PLANET[r.planet];
      x.chip = 'Planet';
      x.title = r.kind === 'opposition' ? `${p} at opposition` : r.kind === 'brightest' ? `${p} at greatest brilliancy`
        : r.kind === 'elong-east' ? `${p} at greatest eastern elongation` : `${p} at greatest western elongation`;
      x.sub = (r.kind === 'opposition' ? 'Up all night, and at its brightest and largest for the year'
        : r.kind === 'brightest' ? `At its brightest${r.en ? ' (' + r.en + ')' : ''}`
        : r.kind === 'elong-east' ? 'Farthest from the Sun in the evening sky, low in the west after sunset'
        : 'Farthest from the Sun in the morning sky, low in the east before sunrise')
        + (r.en && r.kind !== 'brightest' ? `. ${r.en}` : '');
      if (r.note && !r.en) throw new Error('惑星の注記の英語が無い: ' + r.note);
      const evening = r.kind === 'elong-east' || (r.kind === 'brightest' && +C.planetView(r).slice(11, 13) >= 12);
      x.link = r.kind === 'opposition' ? sky({ lt: `${r.date}T23:00`, look: r.planet }) : sky({ d: r.date, tw: evening ? 'evening' : 'morning', look: r.planet });
      x.more = 'planets.html';
    }
    for (const n of [...O.MOON_NOTES, ...O.MOON_VIEWING].filter(n => n.note)) if (!n.en) throw new Error('注記の英語が無い: ' + n.note);
    return x;
  }).sort((a, b) => (a.ms || Date.parse(a.date + 'T12:00:00+09:00')) - (b.ms || Date.parse(b.date + 'T12:00:00+09:00')));
}

/* ---------------- 部品 ---------------- */
/* 過ぎた日付を隠す（UTC の昨日より前）・見る人の時刻を入れる・「次の〜」を入れる */
const PAGE_SCRIPT = `<script>
(function(){var t=new Date(Date.now()-864e5).toISOString().slice(0,10);
document.querySelectorAll('[data-date]').forEach(function(e){if(e.getAttribute('data-date')<t)e.classList.add('past');});
document.querySelectorAll('[data-empty]').forEach(function(b){if(b.querySelector('[data-date]:not(.past)'))return;var m=b.getAttribute('data-empty');
if(!m){b.classList.add('past');return;}var p=document.createElement('p');p.className='lead';p.textContent=m;b.appendChild(p);});
document.querySelectorAll('[data-next]').forEach(function(s){var k=s.getAttribute('data-next'),e=document.querySelector('[data-kind="'+k+'"]:not(.past)');if(e)s.textContent=e.getAttribute('data-summary');});
try{var f=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
document.querySelectorAll('time.yt').forEach(function(e){e.textContent=f.format(new Date(e.getAttribute('datetime')));});}catch(err){}
})();
</script>`;
const JST_NOTE = 'Dates marked JST are Japan dates (UTC+9); in the Americas and Europe the same event may fall on the previous day.';

module.exports = function buildEn({ esc, BASE, UPDATED, ADSENSE, BEACON }) {
  const events = eventsEn();
  const files = [];
  const yFrom = O.COVERAGE.from.slice(0, 4), yTo = O.COVERAGE.to.slice(0, 4);
  const upcoming = e => e.date >= UPDATED;
  const nextOf = kind => events.find(e => e.kind === kind && upcoming(e));
  const whenOf = e => e.ms ? `${utcLabel(e.ms)}, ${utcTime(e.ms)}` : `${e.dateText || jstDateLabel(e.date)} (JST)`;
  const summaryOf = e => e ? `${whenOf(e)}: ${e.title}` : '';

  /* 枠。rel は en/ から見た相対パス（'' か '../'） */
  function pageEn({ rel, file, jaFile, title, description, current, body, jsonld, script = true }) {
    const url = BASE + file.replace(/index\.html$/, ''), jaUrl = BASE + jaFile.replace(/index\.html$/, '');
    const top = rel + '../../en/';                                   // yorozu-craft の英語のトップ
    const nav = [['', 'Planetarium'], ['calendar/', 'Sky calendar'], ['planisphere/', 'Planisphere'], ['guide.html', 'How it works']]
      .map(([href, label]) => `<a href="${rel}${href || './'}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="ja" href="${jaUrl}">
<link rel="alternate" hreflang="en" href="${url}">
<link rel="alternate" hreflang="x-default" href="${jaUrl}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${/calendar\/(?!index)/.test(file) ? 'article' : 'website'}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="ja_JP">
<meta property="og:image" content="${BASE}og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="yorozu-craft">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#070b18">
<link rel="icon" href="${rel}../favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${rel}../apple-touch-icon.png">
${jsonld ? `<script type="application/ld+json">\n${JSON.stringify(jsonld, null, 1)}\n</script>\n` : ''}${ADSENSE}
<link rel="stylesheet" href="${rel}../pages.css">
</head>
<body>
<header class="site"><div class="wrap">
  <a class="logo" href="${rel || './'}"><img src="${rel}../favicon.svg" alt="" width="28" height="28">Web Planetarium</a>
  <nav aria-label="Site">${nav}<a href="${rel}../${jaFile.replace(/index\.html$/, '')}" hreflang="ja" lang="ja">日本語</a></nav>
</div></header>
<main class="wrap">
${body}
</main>
<footer class="site"><div class="wrap">
  <nav><a href="${top}">yorozu-craft</a><a href="${rel || './'}">Planetarium</a><a href="${rel}calendar/">Sky calendar</a><a href="${rel}planisphere/">Planisphere</a><a href="${rel}guide.html">How it works</a><a href="${top}about.html">About</a><a href="${top}privacy-policy.html">Privacy policy</a></nav>
  &copy; 2026 yorozu-craft. All rights reserved.
</div></footer>
${script ? PAGE_SCRIPT + '\n' : ''}${BEACON}
</body>
</html>
`;
  }
  const add = (name, title, description, body, jsonld) => files.push({ file: `en/calendar/${name}`, html: pageEn({ rel: '../', file: `en/calendar/${name}`,
    jaFile: `calendar/${name}`, title, description, current: 'calendar/', body, jsonld }) });
  const crumbs = label => `<div class="crumbs"><a href="../">Planetarium</a> / <a href="./">Sky calendar</a> / ${esc(label)}</div>`;
  const breadcrumb = (name, file) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Web Planetarium', item: BASE + 'en/' },
    { '@type': 'ListItem', position: 2, name: 'Sky calendar', item: BASE + 'en/calendar/' },
    { '@type': 'ListItem', position: 3, name, item: BASE + 'en/calendar/' + file }] });
  function sources(keys) {
    const uniq = [...new Set(keys)].filter(Boolean);
    return `<h2>Sources</h2><ul class="src">${uniq.map(k => { const [n, u] = srcEn(k); return `<li><a href="${u}" hreflang="ja">${esc(n)}</a> (in Japanese)</li>`; }).join('')}</ul>
<p class="lead">Credit: National Astronomical Observatory of Japan (NAOJ). Dates and times are from NAOJ, checked on ${O.CHECKED}. NAOJ bases meteor shower peaks on predictions by the International Meteor Organization (IMO). Moon illumination, radiant heights and the “See the sky” times are calculated by this site.</p>`;
  }
  function eventItem(e) {
    const date = e.ms ? utcLabel(e.ms, false) : (e.dateText ? e.dateText.replace(/, \d{4}$/, '') : jstDateLabel(e.date, false));
    const small = e.ms ? `${utcTime(e.ms)}${e.kind === 'meteor' ? ' (approx.)' : ''}` : 'JST date';
    return `<li class="ev ev-${e.kind}" data-date="${e.date}" data-kind="${e.kind}" data-summary="${esc(summaryOf(e))}">
  <div class="ev-date">${esc(date)}<small>${small}</small></div>
  <div class="ev-body"><span class="chip">${e.chip}</span> <b>${esc(e.title)}</b>${e.ms ? `<span class="ev-sub">Your time: ${localTime(e.ms)}</span>` : ''}${e.sub ? `<span class="ev-sub">${esc(e.sub)}</span>` : ''}
    <span class="ev-links">${e.link ? `<a href="${e.link}">See the sky →</a>` : ''}<a href="./${e.more}">Details</a></span></div>
</li>`;
  }
  const nextBox = rows => `<div class="box next">${rows.map(([label, kind]) => `<div><span class="chip">${label}</span> <span data-next="${kind}">${esc(summaryOf(nextOf(kind)))}</span></div>`).join('')}</div>`;

  /* ---- 一覧 ---- */
  {
    const inRange = events.filter(e => e.date >= O.COVERAGE.from && e.date <= O.COVERAGE.to);
    const months = [...new Set(inRange.map(e => e.date.slice(0, 7)))];
    const list = months.map(mk => `<section class="month" data-empty=""><h3>${MONTH[+mk.slice(5) - 1]} ${mk.slice(0, 4)}</h3><ul class="evlist">${inRange.filter(e => e.date.slice(0, 7) === mk).map(eventItem).join('')}</ul></section>`).join('\n');
    const body = `<div class="crumbs"><a href="../">Planetarium</a> / Sky calendar</div>
<h1>Astronomy calendar ${yFrom}–${yTo}<small>Full moons, new moons, meteor showers, eclipses and planets</small></h1>
<p class="lead">Upcoming sky events in date order, from the National Astronomical Observatory of Japan (NAOJ). Exact times are in UTC and in your own time zone. “See the sky” opens the planetarium for your place.</p>
${nextBox([['Next full moon', 'full'], ['Next new moon', 'new'], ['Next meteor shower', 'meteor']])}
<nav class="toc" aria-label="Topics"><a href="./full-moon.html">Full moons</a><a href="./new-moon.html">New moons</a><a href="./meteor-showers.html">Meteor showers</a><a href="./perseids.html">Perseids</a><a href="./geminids.html">Geminids</a><a href="./quadrantids.html">Quadrantids</a><a href="./lunar-eclipse.html">Lunar eclipses</a><a href="./solar-eclipse.html">Solar eclipses</a><a href="./planets.html">Planets</a></nav>
<h2>Upcoming events</h2>
${list}
<p class="lead">${JST_NOTE} Events after ${yTo} are added once NAOJ publishes them (each February for the next year).</p>
${sources(inRange.flatMap(e => e.src))}`;
    files.push({ file: 'en/calendar/index.html', html: pageEn({ rel: '../', file: 'en/calendar/index.html', jaFile: 'calendar/index.html',
      title: `Astronomy Calendar ${yFrom}–${yTo}: Full Moons, Meteor Showers, Eclipses and Planets`,
      description: `Sky events for ${yFrom}–${yTo} in date order: full and new moons, meteor shower peaks, eclipses and planet viewing, from NAOJ. Times in UTC and your time zone.`,
      current: 'calendar/', body, jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Astronomy calendar', url: BASE + 'en/calendar/', inLanguage: 'en' } }) });
  }

  /* ---- 満月・新月 ---- */
  const moonTable = kind => `<div class="scroll" data-empty="The next dates will be added after checking NAOJ’s announcement."><table class="evtable"><thead><tr><th>Date and time (UTC)</th><th>Your time</th><th>Note</th><th></th></tr></thead><tbody>${events.filter(e => e.kind === kind).map(e =>
    `<tr data-date="${e.date}" data-kind="${kind}" data-summary="${esc(summaryOf(e))}"><td>${utcLabel(e.ms)}<br><span class="num">${utcTime(e.ms)}</span></td><td>${localTime(e.ms)}</td><td>${esc(e.sub)}</td><td><a href="${e.link}">See the sky →</a></td></tr>`).join('')}</tbody></table></div>`;
  {
    const views = events.filter(e => e.kind === 'moonview').map(e => `<tr data-date="${e.date}"><td>${jstDateLabel(e.date)}</td><td>${esc(TSUKIMI[O.MOON_VIEWING.find(v => v.date === e.date).name])}</td><td>${esc(e.sub)}</td><td><a href="${e.link}">See the sky →</a></td></tr>`).join('');
    const body = `${crumbs('Full moons')}
<h1>Full moon calendar<small>When is the next full moon? Dates and times for ${yFrom}–${yTo}</small></h1>
${nextBox([['Next full moon', 'full']])}
${moonTable('full')}
<p class="lead">“See the sky” opens 9 p.m. on that date at your place, facing the Moon.</p>
<h2>What is a full moon?</h2>
<p>The Moon shines by reflecting sunlight. A full moon is the moment the Moon is exactly opposite the Sun as seen from Earth; the table gives that moment. The Moon also looks full on the nights just before and after it.</p>
<p>A full moon rises in the east around sunset, is highest around midnight and sets in the west around sunrise, so it is up all night.</p>
<h2>Closest and farthest full moons</h2>
<p>The Moon’s orbit is slightly oval, so its distance changes from one full moon to the next. A full moon near its closest point looks a little bigger and brighter and is sometimes called a supermoon. The notes mark the year’s closest and farthest full moons, as listed by NAOJ.</p>
<h2 id="tsukimi">Tsukimi: moon viewing in Japan</h2>
<p>Chūshū no meigetsu, the mid-autumn moon, is the night of the 15th day of the 8th month in the old lunisolar calendar Japan used until 1872. That calendar counts days from the new moon, so the date often differs from the full moon by a day or two. Jūsan-ya is the 13th night of the 9th month, a moon-viewing custom unique to Japan.</p>
<div class="scroll" data-empty="The next moon-viewing dates will be added after checking NAOJ’s announcement."><table class="evtable"><thead><tr><th>Date (JST)</th><th>Name</th><th>Note</th><th></th></tr></thead><tbody>${views}</tbody></table></div>
${sources([...O.MOON_PHASES.map(r => r.src), ...O.MOON_NOTES.map(n => n.src), ...O.MOON_VIEWING.map(v => v.src)])}`;
    add('full-moon.html', `Full Moon Calendar ${yFrom}–${yTo}: When Is the Next Full Moon?`,
      `When is the next full moon? Full moon dates and exact times for ${yFrom}–${yTo} from NAOJ, in UTC and your time zone, with the closest full moon of the year and Japan’s moon-viewing nights.`, body,
      breadcrumb('Full moons', 'full-moon.html'));
  }
  {
    const body = `${crumbs('New moons')}
<h1>New moon calendar<small>Dark nights for stargazing: new moon dates and times ${yFrom}–${yTo}</small></h1>
${nextBox([['Next new moon', 'new']])}
${moonTable('new')}
<h2>What is a new moon?</h2>
<p>A new moon is the moment the Moon is in the same direction as the Sun. Its unlit side faces Earth, and it rises and sets with the Sun, so you cannot see it at night.</p>
<h2>Stargaze around the new moon</h2>
<p>Moonlight is brighter than you might think: around the full moon, faint stars and the Milky Way almost disappear. The few days around a new moon have no moonlight, so they are the best nights for the Milky Way, faint constellations and meteors. “See the sky” opens 9 p.m. on that date at your place.</p>
${sources(O.MOON_PHASES.map(r => r.src))}`;
    add('new-moon.html', `New Moon Calendar ${yFrom}–${yTo}: Best Nights for Stargazing`,
      `New moon dates and exact times for ${yFrom}–${yTo} from NAOJ, in UTC and your time zone. The nights around a new moon are the darkest, best for the Milky Way and meteors.`, body,
      breadcrumb('New moons', 'new-moon.html'));
  }

  /* ---- 流星群 ---- */
  const meteorRows = id => events.filter(e => e.kind === 'meteor' && (!id || e.shower === id));
  const peakText = e => e.ms ? `${utcLabel(e.ms)}, around ${utcTime(e.ms)}` : `around ${jstDateLabel(e.date)} (JST)`;
  const meteorCards = (rows, withName) => `<div class="mcards" data-empty="The next peak prediction will be added after checking NAOJ’s announcement.">${rows.map(e => {
    const s = e.showerEn;
    return `<div class="box mcard" data-date="${e.date}" data-kind="meteor" data-summary="${esc(summaryOf(e))}">
  <div class="mcard-h">${withName ? `<a href="./${e.more}">${esc(s.name)}</a>: ` : ''}peak <b>${esc(peakText(e))}</b></div>
  <dl class="info">${e.ms ? `<dt>Your time</dt><dd>${localTime(e.ms)}</dd>` : ''}<dt>Expected rate</dt><dd>Up to ${esc(rateEn(e.rec.rate))} (NAOJ, dark skies in Japan)</dd><dt>Moon at peak</dt><dd>${esc(moonAt(e.rec))}</dd></dl>
  <a href="${e.link}">See the sky at a good hour →</a>
</div>`;
  }).join('')}</div>`;
  /** 放射点の高さ（緯度ごと、地方平均太陽時）。見ごろの夜の日付で計算 */
  function radiantTable(id, rec) {
    const s = C.SHOWERS[id], date = rec.view.slice(0, 10), base = Date.parse(date + 'T00:00:00Z');
    const [ra, dec] = A.precessor(base)(s.radiant[0] * DEG, s.radiant[1] * DEG);
    const hours = [-2, 0, 2, 4], lats = [50, 35, 20, 0, -35];
    const rows = lats.map(lat => `<tr><th>${Math.abs(lat)}°${lat > 0 ? 'N' : lat < 0 ? 'S' : ''}</th>${hours.map(h => {
      const alt = A.altAz(Math.sin(dec), Math.cos(dec), ra, A.lstRad(base + h * HOUR, 0), Math.sin(lat * DEG), Math.cos(lat * DEG))[0] / DEG;
      return `<td class="num">${alt < 0 ? 'below' : Math.round(alt) + '°'}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class="scroll"><table class="evtable"><thead><tr><th>Latitude</th>${hours.map(h => `<th>${(h + 24) % 24}:00</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
<p class="lead">Height of the radiant above the horizon on the night of ${(d => `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`)(new Date(base - DAY))}–${+date.slice(8)}, ${date.slice(0, 4)}, calculated by this site. Times are local solar time, usually within an hour of standard clock time (add an hour under daylight saving time). The higher the radiant, the more meteors you see.</p>`;
  }
  for (const id of ['perseids', 'geminids', 'quadrantids']) {
    const s = SHOWERS_EN[id], rows = meteorRows(id), next = rows.find(upcoming) || rows.at(-1);
    const year = next ? (next.ms ? new Date(next.ms).getUTCFullYear() : next.date.slice(0, 4)) : '';
    const radiant = C.SHOWERS[id].cons.map(con).join(' and ');
    const body = `${crumbs(s.name)}
<h1>${s.long}<small>When to watch, where to look and what time</small></h1>
<p class="lead">The ${s.name} are one of the three major annual meteor showers, peaking ${s.season}. ${esc(s.feature)}</p>
<h2>When is the peak?</h2>
${meteorCards(rows, false)}
<p>The peak time shifts a little each year. The prediction above is from NAOJ, based on IMO predictions. Even when the peak falls in your daytime, the nights before and after still bring many meteors.</p>
${next ? `<a class="cta" href="${next.link}">See the ${year} peak-night sky →</a>` : ''}
<h2>Where should I look?</h2>
<p>Meteors seem to shoot out from one point in the sky, the radiant. The ${s.name} radiant is ${C.SHOWERS[id].cons.length > 1 ? 'near the border of ' : 'in '}${radiant}. Meteors appear all over the sky, not only near the radiant, so take in as much sky as you can.</p>
<h2>What time is best?</h2>
${next ? radiantTable(id, next.rec) : ''}
<h2>How to watch</h2>
<ul>
<li>Find a dark place with a wide view of the sky, away from city lights.</li>
<li>Give your eyes at least 15 minutes to adjust. A bright phone screen undoes that; the planetarium’s Red light helps.</li>
<li>Lie back on a mat or a reclining chair. Binoculars and telescopes show too little sky, so leave them at home.</li>
<li>A bright Moon cuts the count; check “Moon at peak” above.</li>
<li>Stay safe at night: watch for traffic, dress for the cold and keep children with an adult.</li>
</ul>
<h2>Where the meteors come from</h2>
<p>A meteor shower happens when Earth runs into dust left along the path of a comet or similar body. The source of the ${s.name} is ${esc(s.parent)}. Other showers are on the <a href="./meteor-showers.html">meteor shower calendar</a>.</p>
${sources(rows.map(e => e.src[0]))}`;
    add(`${id}.html`, `${s.long.replace(/^\w| \w/g, c => c.toUpperCase())} ${year}: Peak Date, Time and Where to Look`,
      `When do the ${s.name} peak in ${year}? The peak time from NAOJ in UTC and your time zone, expected rate, moonlight, where to look and the best hours by latitude.`, body,
      [{ '@context': 'https://schema.org', '@type': 'Article', headline: `${s.long}: peak date, time and where to look`, inLanguage: 'en', dateModified: UPDATED,
        author: { '@type': 'Organization', name: 'yorozu-craft', url: 'https://yorozu-craft.com/en/' }, mainEntityOfPage: `${BASE}en/calendar/${id}.html` },
       breadcrumb(s.name, `${id}.html`)]);
  }
  {
    const all = meteorRows();
    const others = Object.entries(SHOWERS_EN).filter(([, s]) => !s.long).map(([id, s]) =>
      `<h3 id="${id}">${esc(s.name)}</h3><p>Peaks in ${esc(s.season)}. The radiant is in ${C.SHOWERS[id].cons.map(con).join(' and ')}.</p>`).join('');
    const body = `${crumbs('Meteor showers')}
<h1>Meteor shower calendar ${yFrom}–${yTo}<small>Peak times, expected rates and moonlight</small></h1>
${nextBox([['Next meteor shower', 'meteor']])}
${meteorCards(all, true)}
<p class="lead">Rates are NAOJ’s estimate of the most meteors per hour at the best time, under a dark sky where the Milky Way is visible. Under city lights you see only a fraction. ${JST_NOTE}</p>
<h2>The three major showers</h2>
<ul class="cards">${['perseids', 'geminids', 'quadrantids'].map(id => `<li><a href="./${id}.html"><div><b>${SHOWERS_EN[id].name}</b><span>Peaks ${SHOWERS_EN[id].season}</span></div></a></li>`).join('')}</ul>
<h2>Other showers</h2>
${others}
<h2>What is a meteor shower?</h2>
<p>Comets and similar bodies leave trails of dust along their orbits. Earth passes through the same trail at the same time each year, so meteors are frequent then. The meteors seem to shoot out from one point, the radiant, and the shower is named after the constellation it lies in.</p>
${sources(all.map(e => e.src[0]))}`;
    add('meteor-showers.html', `Meteor Shower Calendar ${yFrom}–${yTo}: Next Peak Dates and Rates`,
      `When is the next meteor shower? Peak times from NAOJ for the Perseids, Geminids, Quadrantids and other showers, in UTC and your time zone, with expected rates and moonlight.`, body,
      breadcrumb('Meteor showers', 'meteor-showers.html'));
  }

  /* ---- 日食・月食 ---- */
  const eclipseTable = bodyId => `<div class="scroll" data-empty="The next dates will be added after checking NAOJ’s announcement."><table class="evtable"><thead><tr><th>Date (JST)</th><th>Type</th><th>From Japan</th></tr></thead><tbody>${events.filter(e => e.kind === 'eclipse' && e.rec.body === bodyId).map(e => {
    const r = e.rec, vis = r.japan === 'visible' ? '<b>Visible</b>' : r.japan === 'central' ? '<b>Central eclipse in part of the area</b>' : 'Not visible';
    return `<tr data-date="${e.date}" data-kind="${bodyId}-eclipse${r.japan !== 'none' ? '-jp' : ''}" data-summary="${esc(`${e.dateText || jstDateLabel(e.date)} (JST): ${e.title}`)}"><td>${esc(e.dateText || jstDateLabel(e.date))}</td><td>${esc(e.title)}</td><td>${vis}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  const nextJp = bodyId => events.find(e => e.kind === 'eclipse' && e.rec.body === bodyId && e.rec.japan !== 'none' && upcoming(e));
  const nasa = '<a href="https://science.nasa.gov/eclipses/future-eclipses/">NASA’s future eclipses page</a>';
  {
    const nx = nextJp('moon'), ex = O.ECLIPSES.find(e => e.tokyo);
    const exRow = ex ? `<h2>Example: ${esc(ECLIPSE_TYPE[ex.type].toLowerCase())} of ${jstDateLabel(ex.date)} (Tokyo, JST)</h2>
<div class="scroll"><table class="evtable"><thead><tr><th>Begins</th><th>Totality begins</th><th>Maximum</th><th>Totality ends</th><th>Ends</th></tr></thead>
<tbody><tr>${['start', 'totalStart', 'max', 'totalEnd', 'end'].map(k => `<td class="num">${ex.tokyo[k]}</td>`).join('')}</tr></tbody></table></div>
<p class="lead">Times in hours:minutes (JST) from NAOJ’s Rekiyōkō; magnitude ${ex.tokyo.mag}. A lunar eclipse happens at the same moment everywhere; you can see it if the Moon is above your horizon then.</p>` : '';
    const body = `${crumbs('Lunar eclipses')}
<h1>Lunar eclipse calendar<small>Dates to 2030, and whether each can be seen from Japan</small></h1>
${nextBox([]).replace('</div>', `<div><span class="chip">Next lunar eclipse visible from Japan</span> <span data-next="moon-eclipse-jp">${esc(nx ? `${jstDateLabel(nx.date)} (JST): ${nx.title}` : '')}</span></div></div>`)}
${eclipseTable('moon')}
<p>Lunar eclipses from ${O.ECLIPSES[0].date.slice(0, 4)} to 2030. Through 2027 the list follows NAOJ’s Rekiyōkō; later years come from NAOJ’s eclipse database (dates and visibility near Japan). Like NAOJ, it leaves out penumbral eclipses, when the Moon only dims slightly. For where else an eclipse can be seen, see ${nasa}.</p>
<h2>What is a lunar eclipse?</h2>
<p>The Sun, Earth and Moon line up in that order, and the Moon passes into Earth’s shadow. It happens only at full moon. In a partial eclipse, part of the Moon is in the shadow; in a total eclipse, all of it is. During totality the Moon does not go black but turns a dark coppery red, because a little red light bends through Earth’s atmosphere and reaches it.</p>
${exRow}
<h2>How to watch</h2>
<p>You can watch a lunar eclipse safely with your eyes alone whenever the Moon is up. Binoculars show the moving shadow and the color change better.</p>
${sources(O.ECLIPSES.filter(e => e.body === 'moon').map(e => e.src))}`;
    add('lunar-eclipse.html', 'Lunar Eclipse Calendar to 2030: Next Total Lunar Eclipse and Visibility from Japan',
      'Lunar eclipse dates to 2030 from NAOJ, including total lunar eclipses, with visibility from Japan, how a lunar eclipse works and how to watch it.', body,
      breadcrumb('Lunar eclipses', 'lunar-eclipse.html'));
  }
  {
    const nx = nextJp('sun');
    const body = `${crumbs('Solar eclipses')}
<h1>Solar eclipse calendar<small>Dates to 2030, and whether each can be seen from Japan</small></h1>
<div class="box warn"><b>⚠ Never look at the Sun directly.</b><br>Even during an eclipse, looking at the Sun with your eyes, binoculars, a telescope or a camera viewfinder can damage your eyes and cause vision loss. Sunglasses, colored plastic and smoked glass are not safe either. Use eclipse glasses made for solar viewing, correctly, or project the Sun’s image through a pinhole. Children should always watch with an adult.</div>
${nextBox([]).replace('</div>', `<div><span class="chip">Next solar eclipse visible from Japan</span> <span data-next="sun-eclipse-jp">${esc(nx ? `${jstDateLabel(nx.date)} (JST): ${nx.title}` : '')}</span></div></div>`)}
${eclipseTable('sun')}
<p>Solar eclipses from ${O.ECLIPSES[0].date.slice(0, 4)} to 2030. Through 2027 the list follows NAOJ’s Rekiyōkō; later years come from NAOJ’s eclipse database (dates and visibility near Japan, judged over a slightly wide area). For where else an eclipse can be seen, see ${nasa}.</p>
<h2>What is a solar eclipse?</h2>
<p>The Sun, Moon and Earth line up in that order, and the Moon hides the Sun. It happens only at new moon. In a partial eclipse the Moon hides part of the Sun; in a total eclipse, all of it. When the Moon looks a little smaller than the Sun, a ring of Sun is left: an annular eclipse. A total or annular eclipse is seen only along the narrow path of the Moon’s shadow; around it, a wide area sees a partial eclipse.</p>
<h2>In the planetarium</h2>
<p>The planetarium does not draw the Sun being covered. You can use Time to see the Sun and Moon line up on an eclipse day.</p>
${sources(O.ECLIPSES.filter(e => e.body === 'sun').map(e => e.src))}`;
    add('solar-eclipse.html', 'Solar Eclipse Calendar to 2030: Next Solar Eclipse and Visibility from Japan',
      'Solar eclipse dates to 2030 from NAOJ, including total and annular eclipses, with visibility from Japan, how solar eclipses work and how to watch safely.', body,
      breadcrumb('Solar eclipses', 'solar-eclipse.html'));
  }

  /* ---- 惑星 ---- */
  {
    const rows = events.filter(e => e.kind === 'planet');
    const table = `<div class="scroll" data-empty="The next dates will be added after checking NAOJ’s announcement."><table class="evtable"><thead><tr><th>Date (JST)</th><th>Event</th><th>What you see</th><th></th></tr></thead><tbody>${rows.map(e =>
      `<tr data-date="${e.date}" data-kind="planet" data-summary="${esc(summaryOf(e))}"><td>${jstDateLabel(e.date)}</td><td>${esc(e.title)}</td><td>${esc(e.sub)}</td><td><a href="${e.link}">See the sky →</a></td></tr>`).join('')}</tbody></table></div>`;
    const body = `${crumbs('Planets')}
<h1>Planet viewing calendar<small>Oppositions of Mars, Jupiter and Saturn; greatest elongations of Mercury and Venus</small></h1>
${table}
<p class="lead">“See the sky” opens your place at 11 p.m. for an opposition, and at dusk or dawn (when the Sun is 6° below the horizon) for an elongation. ${JST_NOTE}</p>
<h2>Opposition: Mars, Jupiter and Saturn</h2>
<p>When a planet outside Earth’s orbit is exactly opposite the Sun as seen from Earth, it is at opposition. It rises in the east around sunset, is up all night and is highest around midnight. It is also near its closest to Earth, so it looks brightest, and largest in a telescope.</p>
<h2>Greatest elongation: Mercury and Venus</h2>
<p>Mercury and Venus orbit inside Earth’s orbit, so they always appear near the Sun: in the west after sunset or in the east before sunrise. Greatest elongation is when they appear farthest from the Sun, which makes them easier to find. Eastern elongation is in the evening sky, western elongation in the morning sky. Mercury never gets far from the Sun, so even then it is low and can be hard to spot.</p>
<h2>Greatest brilliancy: Venus</h2>
<p>Venus changes brightness as its phase and distance change. Its brightest point is called greatest brilliancy. It then shines brighter than magnitude −4, bright enough to be seen at times in a blue daytime sky.</p>
${sources(rows.map(e => e.src[0]))}`;
    add('planets.html', `Planet Viewing Calendar ${yFrom}–${yTo}: Oppositions and Greatest Elongations`,
      `When to see the planets in ${yFrom}–${yTo}: oppositions of Mars, Jupiter and Saturn, greatest elongations of Mercury and Venus and Venus at its brightest, from NAOJ.`, body,
      breadcrumb('Planets', 'planets.html'));
  }

  /* ---- 使い方（en/guide.html） ---- */
  {
    const form = 'https://docs.google.com/forms/d/e/1FAIpQLSd8B90qh5lEIyr25iw1jOjdQjOyaPZ1_z2wMB4kH-EmEeJYWw/viewform?usp=pp_url&amp;entry.585564634=hoshizora-sanpo';
    const body = `<h1>How the web planetarium works<small>Use, accuracy and sources</small></h1>
<p class="lead">What this page covers: how to use the planetarium, how accurate it is, what is in English, and where the data comes from.</p>
<a class="cta" href="./">Open the planetarium →</a>
<h2>How to use</h2>
<ol>
<li>Tap Place and pick a city, use your location, or type a latitude and longitude.</li>
<li>Drag to look around. Pinch or scroll to zoom.</li>
<li>Tap a constellation, bright star, planet or the Moon for notes.</li>
<li>Open Time to move by hours, days or months, or to fast-forward.</li>
<li>Tap Moon phase for the Moon’s phase, age and how much of it is lit.</li>
</ol>
<p>For a paper version to take outside, <a href="planisphere/">print a planisphere</a> for your latitude.</p>
<h2>Works for any place on Earth</h2>
<p>Positions are calculated from your latitude, longitude and time, so the sky is right for any place. City times use that city’s time zone. For your location or typed coordinates, times use your device’s time zone.</p>
<h2>Accuracy</h2>
<p>The sky shows about 3,300 real stars down to magnitude 5.6, adjusted for precession. The Sun, Moon and five naked-eye planets come from orbital formulas, and the Moon includes parallax. Moon and planet positions are within a few arcminutes, fine for naked-eye viewing. The planet formulas are meant for 1800–2050. Atmospheric refraction, Uranus, Neptune, comets and satellites are not shown.</p>
<h2>What is in English</h2>
<p>Constellation names are the official IAU names. Star names follow the IAU Working Group on Star Names. Constellation myths, the constellation guide and the kids’ hiragana mode are in Japanese only for now.</p>
<h2>Sources</h2>
<ul class="src">
<li>Stars: Yale Bright Star Catalogue, 5th ed. (Hoffleit &amp; Warren, 1991), via <a href="https://github.com/brettonw/YaleBrightStarCatalog">brettonw/YaleBrightStarCatalog</a> (MIT License)</li>
<li>Planets: E. M. Standish, “Keplerian Elements for Approximate Positions of the Major Planets” (NASA JPL); brightness: Mallama &amp; Hilton (2018)</li>
<li>Moon: Paul Schlyter, “How to compute planetary positions”</li>
<li>Star names: IAU WGSN, <a href="https://exopla.net/star-names/modern-iau-star-names/">IAU Catalog of Star Names</a></li>
<li>Sky calendar: National Astronomical Observatory of Japan (NAOJ)</li>
</ul>
<h2>Your data</h2>
<p>Your settings and chosen place are saved only in this browser (localStorage) and are never sent anywhere. “Use my location” rounds your position to 0.1° (about 10 km) before saving. <a href="${form}" target="_blank" rel="noopener">Feedback form</a> (Google Forms, in Japanese; you can write in English). We read every message but do not reply.</p>`;
    files.push({ file: 'en/guide.html', html: pageEn({ rel: '', file: 'en/guide.html', jaFile: 'about.html', title: 'How the Web Planetarium Works: Accuracy and Sources',
      description: 'How to use the free web planetarium, why it works for any place on Earth, how accurate the star, Moon and planet positions are, and the data sources.',
      current: 'guide.html', body, script: false }) });
  }

  /* 日本語の about.html にも英語の対（guide.html）を付けるため、対の一覧を返す */
  return { files, pairs: files.map(f => [f.file.replace(/^en\//, '').replace('guide.html', 'about.html'), f.file]) };
};
