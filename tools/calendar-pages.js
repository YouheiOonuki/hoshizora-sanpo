'use strict';
/* 天文カレンダーのページ（calendar/）を作る。tools/build-pages.js から呼ばれる
 * - 日付の入ったデータは tools/official-events.js（国立天文台の発表）だけから取る
 * - 本文は年によらない書き方にし、年ごとの日付は表として差しこむ
 * - 「この日の星空を見る」の時刻（見やすい時間帯）と放射点の高さは tools/events.js で計算する
 * - 過ぎた日付はページ内のスクリプトで隠す（検索エンジンにはすべて見えるよう HTML に書いておく） */
const A = require('../astro.js');
const O = require('./official-events.js');
const E = require('./events.js');
const { CONS } = require('../data.js');

const DEG = A.DEG, HOUR = 3600000, DAY = 86400000, JST = 9 * HOUR;
const YOBI = '日月火水木金土';
const PLANET_JP = { mercury: '水星', venus: '金星', mars: '火星', jupiter: '木星', saturn: '土星' };

/* ---------------- 流星群の年によらない情報 ----------------
 * radiant: 放射点のおおよその位置（J2000 の赤経・赤緯、度）。放射点の高さの計算とプラネタリウムの向きに使う
 * parent: 母天体（国立天文台の解説ページで確認できたものだけ） */
const SHOWERS = {
  perseids: { name: 'ペルセウス座流星群', page: 'perseids', cons: ['per'], radiant: [48, 58], season: '例年8月中旬（お盆のころ）',
    parent: 'スイフト・タットル彗星（109P/Swift-Tuttle）', naoj: 'https://www.nao.ac.jp/astro/basic/perseid.html', big: true,
    feature: '夏休みの時期で夜も寒くなく、毎年安定して多くの流星が見られます。放射点は夕方にはすでに地平線の上にあり、明け方に向かって高くなるので、夜半すぎから空が白み始めるまでが観察しやすい時間帯です。' },
  geminids: { name: 'ふたご座流星群', page: 'geminids', cons: ['gem'], radiant: [112, 33], season: '例年12月中旬',
    parent: '小惑星フェートン（3200 Phaethon）。過去に彗星活動をしたことのある小惑星と考えられています', naoj: 'https://www.nao.ac.jp/astro/basic/geminid.html', big: true,
    feature: '年間で最も多くの流星が見られる流星群のひとつです。放射点はほぼ一晩中空にあるので、夕方から明け方まで流れ星を見るチャンスがあります。一年で最も寒い時期なので、防寒をしっかりしましょう。' },
  quadrantids: { name: 'しぶんぎ座流星群', page: 'quadrantids', cons: ['boo', 'dra'], radiant: [230, 49], season: '例年1月上旬（年明けすぐ）',
    parent: '諸説あり、まだ確定していません。近年は小惑星 2003 EH1 が有力視されています', naoj: 'https://www.nao.ac.jp/astro/basic/quadrantid.html', big: true,
    feature: '三大流星群のひとつですが、活動が活発な期間が短く、年によって流星数が大きく変わります。名前の「しぶんぎ座」はいまは使われていない星座の名前で、放射点はうしかい座とりゅう座の境界付近にあります。放射点は夜半すぎに高くなり、夜明け前が見ごろです。' },
  orionids: { name: 'オリオン座流星群', cons: ['ori'], season: '例年10月下旬' },
  leonids: { name: 'しし座流星群', cons: ['leo'], season: '例年11月中旬' },
  lyrids: { name: '4月こと座流星群', cons: ['lyr'], season: '例年4月下旬' },
  'eta-aquariids': { name: 'みずがめ座η（エータ）流星群', cons: ['aqr'], season: '例年5月上旬' },
  'delta-aquariids-s': { name: 'みずがめ座δ（デルタ）南流星群', cons: ['aqr'], season: '例年7月末〜8月はじめ' },
  'taurids-s': { name: 'おうし座南流星群', cons: ['tau'], season: '例年11月上旬' },
  'taurids-n': { name: 'おうし座北流星群', cons: ['tau'], season: '例年11月中旬' },
};
const conName = id => (CONS.find(c => c.id === id) || {}).jp || id;

/* ---------------- 日付・リンクの小道具 ---------------- */
/** ISO（+09:00 付き）または 'YYYY-MM-DD' → 日本時間の各部分 */
function parts(iso) {
  const ms = iso.length <= 10 ? Date.parse(iso + 'T00:00:00+09:00') : Date.parse(iso);
  const d = new Date(ms + JST);
  return { ms, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: YOBI[d.getUTCDay()],
    hh: d.getUTCHours(), mm: String(d.getUTCMinutes()).padStart(2, '0'), date: d.toISOString().slice(0, 10), hasTime: iso.length > 10 };
}
const dayLabel = (iso, withYear = true) => { const p = parts(iso); return `${withYear ? p.y + '年' : ''}${p.m}月${p.d}日（${p.w}）`; };
const timeLabel = iso => { const p = parts(iso); return p.hasTime ? `${p.hh}時${p.mm === '00' ? '' : p.mm + '分'}` : ''; };
const isoJst = ms => new Date(ms + JST).toISOString().slice(0, 16) + '+09:00';
const midnightJst = date => Date.parse(date + 'T00:00:00+09:00');
/** プラネタリウムへのリンク（calendar/ から見た相対パス） */
const skyLink = (t, look) => `../?t=${encodeURIComponent(t)}&amp;loc=tokyo${look ? '&amp;look=' + encodeURIComponent(look) : ''}`;
const srcOf = key => O.SRC[key];

/** 満月を見るのによい時刻: 満月の瞬間が夜ならその時刻、昼なら近いほうの夜21時 */
function fullMoonView(at) {
  const p = parts(at);
  if (p.hh >= 18 || p.hh < 5) return at;
  return isoJst(midnightJst(p.date) + (p.hh >= 12 ? 21 : -3) * HOUR);
}
/** 惑星の現象を見るのによい時刻 */
function planetView(ev) {
  const mid = midnightJst(ev.date);
  if (ev.kind === 'opposition') return isoJst(mid + 23 * HOUR);
  let evening = ev.kind === 'elong-east';
  if (ev.kind === 'brightest') {                                   // 最大光度は、太陽の東にいれば夕方、西なら明け方
    const P = A.precessor(mid), p = A.planet(ev.planet, mid, P), s = A.sun(mid);
    evening = ((p.ra - s.ra + 3 * Math.PI) % (2 * Math.PI)) - Math.PI > 0;
  }
  return isoJst(Math.round(E.twilight(mid, evening) / 60000) * 60000);
}

/* ---------------- 全イベントを1本の日付順リストに ---------------- */
function allEvents() {
  const ev = [];
  const noteOf = date => O.MOON_NOTES.find(n => n.date === date);
  for (const r of O.MOON_PHASES) {
    const p = parts(r.at), full = r.type === 'full', note = full && noteOf(p.date);
    ev.push({ date: p.date, at: r.at, kind: full ? 'full' : 'new', chip: full ? '満月' : '新月',
      title: full ? '満月' : '新月', sub: note ? note.note : (full ? '' : '月明かりがなく、星空の観察に向いた時期'),
      view: full ? fullMoonView(r.at) : isoJst(midnightJst(p.date) + 21 * HOUR), look: full ? 'moon' : 'az:180',
      more: full ? 'full-moon.html' : 'new-moon.html', src: note ? [r.src, note.src] : [r.src] });
  }
  for (const v of O.MOON_VIEWING) {
    ev.push({ date: v.date, kind: 'moonview', chip: 'お月見', title: v.name, sub: v.note || '',
      view: isoJst(midnightJst(v.date) + 21 * HOUR), look: 'moon', more: 'full-moon.html#otsukimi', src: [v.src] });
  }
  for (const m of O.METEOR_PEAKS) {
    const s = SHOWERS[m.shower];
    ev.push({ date: parts(m.peak).date, at: m.peak.length > 10 ? m.peak : null, kind: 'meteor', chip: '流星群', shower: m.shower,
      title: `${s.name}が極大`, sub: `見ごろは${m.best}。${m.rate}。${m.moon}`,
      view: m.view, look: s.radiant && s.page === 'quadrantids' ? `radiant:${s.radiant.join(',')}` : `con:${s.cons[0]}`,
      more: s.page ? `${s.page}.html` : `meteor-showers.html#${m.shower}`, src: [m.src], rec: m });
  }
  for (const e of O.ECLIPSES) {
    const vis = e.japan === 'visible' ? '日本で見られる' : e.japan === 'central' ? '日本付近で中心食' : '日本では見られない';
    ev.push({ date: e.date, dateLabel: e.dateLabel, kind: 'eclipse', chip: e.body === 'sun' ? '日食' : '月食', title: `${e.type}（${vis}）`,
      sub: e.note || '', more: e.body === 'sun' ? 'solar-eclipse.html' : 'lunar-eclipse.html', src: [e.src], rec: e });
  }
  for (const pe of O.PLANET_EVENTS) {
    const jp = PLANET_JP[pe.planet];
    const title = pe.kind === 'opposition' ? `${jp}が衝（見ごろ）` : pe.kind === 'brightest' ? `${jp}が最大光度`
      : pe.kind === 'elong-east' ? `${jp}が東方最大離角` : `${jp}が西方最大離角`;
    const sub = pe.kind === 'opposition' ? '一晩中見え、一年でいちばん明るく大きく見えるころ'
      : pe.kind === 'brightest' ? `いちばん明るく輝くころ${pe.note ? '（' + pe.note + '）' : ''}`
      : pe.kind === 'elong-east' ? '夕方の西の空で太陽から最も離れ、見つけやすいころ' : '明け方の東の空で太陽から最も離れ、見つけやすいころ';
    ev.push({ date: pe.date, kind: 'planet', chip: '惑星', title, sub: sub + (pe.note && pe.kind !== 'brightest' ? `。${pe.note}` : ''),
      view: planetView(pe), look: pe.planet, more: 'planets.html', src: [pe.src], rec: pe });
  }
  return ev.filter(e => e.date >= O.COVERAGE.from && e.date <= O.COVERAGE.to || e.kind === 'eclipse')
    .sort((a, b) => (a.date + (a.at || '')).localeCompare(b.date + (b.at || '')));
}

/* ---------------- 部品 ---------------- */
const PAST_SCRIPT = `<script>
/* 過ぎた日付を隠す（日本時間の今日より前）。すべて隠れた表には data-empty の案内を出し、案内が空なら（月の見出しなど）まるごと隠す */
(function(){var t=new Date(Date.now()+324e5).toISOString().slice(0,10);
document.querySelectorAll('[data-date]').forEach(function(e){if(e.getAttribute('data-date')<t)e.classList.add('past');});
document.querySelectorAll('[data-empty]').forEach(function(b){if(b.querySelector('[data-date]:not(.past)'))return;var m=b.getAttribute('data-empty');
if(!m){b.classList.add('past');return;}var p=document.createElement('p');p.className='lead';p.textContent=m;b.appendChild(p);});
document.querySelectorAll('[data-next]').forEach(function(s){var k=s.getAttribute('data-next'),e=document.querySelector('[data-kind="'+k+'"]:not(.past)');if(e)s.textContent=e.getAttribute('data-summary');});
})();
</script>`;

function sourceList(keys, esc) {
  const uniq = [...new Set(keys)].filter(Boolean);
  return `<h2>出典</h2><ul class="src">${uniq.map(k => { const [n, u] = srcOf(k); return `<li><a href="${u}">${esc(n)}</a></li>`; }).join('')}</ul>
<p class="lead">クレジット：国立天文台。日時はすべて日本時間です（${O.CHECKED} に確認）。流星群の極大日時は、国立天文台が国際流星機構（IMO）の予報をもとに掲載しているものです。プラネタリウムの星空と「見やすい時刻」は、ほしぞらさんぽの計算によるめやすです。</p>`;
}
function eventItem(e, esc, { withYear = false } = {}) {
  const summary = `${dayLabel(e.at || e.date, true)}${e.at ? ' ' + timeLabel(e.at) : ''}　${e.title}`;
  return `<li class="ev ev-${e.kind}" data-date="${e.date}" data-kind="${e.kind}" data-summary="${esc(summary)}">
  <div class="ev-date">${e.dateLabel ? esc(e.dateLabel.replace(/^\d+年/, '')) : dayLabel(e.date, withYear)}${e.at ? `<small>${timeLabel(e.at)}${e.kind === 'meteor' ? 'ごろ' : ''}</small>` : ''}</div>
  <div class="ev-body"><span class="chip">${e.chip}</span> <b>${esc(e.title)}</b>${e.sub ? `<span class="ev-sub">${esc(e.sub)}</span>` : ''}
    <span class="ev-links">${e.view ? `<a href="${skyLink(e.view, e.look)}">この日の星空を見る →</a>` : ''}<a href="./${e.more}">くわしく</a></span></div>
</li>`;
}
const monthKey = d => d.slice(0, 7);

/* ---------------- ページ ---------------- */
module.exports = function buildCalendar({ page, esc, BASE, UPDATED }) {
  const events = allEvents();
  const files = [];
  // 天文カレンダーは全ページに英語版（en/calendar/、tools/calendar-pages-en.js）がある
  const add = (file, title, description, body, jsonld) => files.push({ file, html: page({ rel: '../', file, title, description, current: 'calendar/', body: body + PAST_SCRIPT, jsonld, alt: 'en/' + file }) });
  const crumbs = (label) => `<div class="crumbs"><a href="../">ほしぞらさんぽ</a> ／ <a href="./">天文カレンダー</a> ／ ${esc(label)}</div>`;
  const breadcrumb = (name, file) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'ほしぞらさんぽ', item: BASE },
    { '@type': 'ListItem', position: 2, name: '天文カレンダー', item: BASE + 'calendar/' },
    { '@type': 'ListItem', position: 3, name, item: BASE + file }] });
  const upcoming = e => e.date >= UPDATED;
  const nextOf = kind => events.find(e => e.kind === kind && upcoming(e));
  const summaryOf = e => e ? `${dayLabel(e.at || e.date)}${e.at ? ' ' + timeLabel(e.at) : ''}　${e.title}` : '';
  const yFrom = O.COVERAGE.from.slice(0, 4), yTo = O.COVERAGE.to.slice(0, 4);

  /* ---- 一覧 ---- */
  {
    const inRange = events.filter(e => e.date >= O.COVERAGE.from && e.date <= O.COVERAGE.to);
    const months = [...new Set(inRange.map(e => monthKey(e.date)))];
    const list = months.map(mk => {
      const [y, m] = mk.split('-');
      return `<section class="month" data-empty=""><h2>${+y}年${+m}月</h2><ul class="evlist">${inRange.filter(e => monthKey(e.date) === mk).map(e => eventItem(e, esc)).join('')}</ul></section>`;
    }).join('\n');
    const nf = nextOf('full'), nn = nextOf('new'), nm = nextOf('meteor');
    const body = `<div class="crumbs"><a href="../">ほしぞらさんぽ</a> ／ 天文カレンダー</div>
<h1>天文カレンダー ${yFrom}–${yTo}<small>流星群・満月・新月・日食・月食・惑星の見ごろ</small></h1>
<p class="lead">これから見られる主な天文現象を日付順にまとめました。「この日の星空を見る」を押すと、プラネタリウムがその日時・その方角の空（東京）でひらきます。日付と時刻は国立天文台の発表にもとづいています。</p>
<div class="box next">
  <div><span class="chip">次の満月</span> <span data-next="full">${esc(summaryOf(nf))}</span></div>
  <div><span class="chip">次の新月</span> <span data-next="new">${esc(summaryOf(nn))}</span></div>
  <div><span class="chip">次の流星群</span> <span data-next="meteor">${esc(summaryOf(nm))}</span></div>
</div>
<nav class="toc" aria-label="解説ページ"><a href="./full-moon.html">満月カレンダー</a><a href="./new-moon.html">新月カレンダー</a><a href="./meteor-showers.html">流星群カレンダー</a><a href="./perseids.html">ペルセウス座流星群</a><a href="./geminids.html">ふたご座流星群</a><a href="./quadrantids.html">しぶんぎ座流星群</a><a href="./lunar-eclipse.html">月食</a><a href="./solar-eclipse.html">日食</a><a href="./planets.html">惑星の見ごろ</a></nav>
${list}
<p class="lead">${yTo}年12月より先の現象は、国立天文台が暦要項（毎年2月に翌年分を発表）や「ほしぞら情報」で発表したあとに追加します。</p>
${sourceList(inRange.flatMap(e => e.src), esc)}`;
    add('calendar/index.html', `天文カレンダー${yFrom}-${yTo}｜流星群・満月・日食月食・惑星の見ごろ｜ほしぞらさんぽ`,
      `${yFrom}〜${yTo}年の主な天文現象を日付順に。流星群の極大、満月・新月、日食・月食、惑星の見ごろを国立天文台の発表にもとづいて掲載。その日時の星空をプラネタリウムで見られます。`, body,
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: '天文カレンダー', url: BASE + 'calendar/', inLanguage: 'ja' });
  }

  /* ---- 満月・新月 ---- */
  const moonTable = (kind) => {
    const rows = events.filter(e => e.kind === kind);
    return `<div class="scroll" data-empty="次の予定は、国立天文台の発表を確認してから掲載します。"><table class="evtable"><thead><tr><th>日付</th><th>時刻</th><th>メモ</th><th></th></tr></thead><tbody>${rows.map(e =>
      `<tr data-date="${e.date}" data-kind="${kind}" data-summary="${esc(summaryOf(e))}"><td>${dayLabel(e.date)}</td><td class="num">${timeLabel(e.at)}</td><td>${esc(e.sub)}</td><td><a href="${skyLink(e.view, e.look)}">星空を見る →</a></td></tr>`).join('')}</tbody></table></div>`;
  };
  {
    const nf = nextOf('full');
    const views = O.MOON_VIEWING.map(v => `<tr data-date="${v.date}"><td>${dayLabel(v.date)}</td><td>${esc(v.name)}</td><td>${esc(v.note || '')}</td><td><a href="${skyLink(isoJst(midnightJst(v.date) + 21 * HOUR), 'moon')}">星空を見る →</a></td></tr>`).join('');
    const body = `${crumbs('満月カレンダー')}
<h1>満月カレンダー<small>次の満月はいつ？ ${yFrom}–${yTo}年の満月の日時</small></h1>
<div class="box next"><div><span class="chip">次の満月</span> <span data-next="full">${esc(summaryOf(nf))}</span></div></div>
${moonTable('full')}
<h2>満月とは</h2>
<p>月は太陽の光を反射して光っています。地球から見て月が太陽とちょうど反対の方向にきた瞬間が「満月（望）」です。上の表の時刻はその瞬間で、満月の日とは、この瞬間をふくむ日のことです。時刻が昼間でも、その前後の夜の月はほとんど満月の形に見えます。</p>
<p>満月は、日の入りのころに東の空から昇り、真夜中に南の空高くを通って、日の出のころ西の空に沈みます。一晩中見えるので、お子さんと月を見るならいちばん見つけやすい時期です。</p>
<h2>地球に近い満月・遠い満月</h2>
<p>月の通り道（軌道）は少しだけ楕円なので、地球との距離は満月ごとに変わります。地球に近いときの満月は少し大きく明るく見え、「スーパームーン」と呼ばれることもあります。表のメモ欄に、その年でいちばん近い・遠い満月を書いています。</p>
<h2 id="otsukimi">お月見（中秋の名月・十三夜）</h2>
<p>「中秋の名月」は、明治5年まで使われていた暦（太陰太陽暦）の8月15日の夜の月です。この日は新月の日を1日目として数えるため、天文学でいう満月の日と1〜2日ずれることがよくあります。「十三夜」は同じ暦の9月13日の夜の月で、日本独自のお月見の風習です。</p>
<div class="scroll" data-empty="次のお月見の日付は、国立天文台の発表を確認してから掲載します。"><table class="evtable"><thead><tr><th>日付</th><th>名前</th><th>メモ</th><th></th></tr></thead><tbody>${views}</tbody></table></div>
<h2>月を観察するときは</h2>
<p>月は道具がなくても楽しめますが、双眼鏡を使うとクレーターや「うさぎのもちつき」の模様がよく見えます。満月より、半月のころのほうが、影のおかげでクレーターの凹凸がくっきり見えます。<a href="./new-moon.html">新月カレンダー</a>もあわせてどうぞ。</p>
${sourceList([...O.MOON_PHASES.map(r => r.src), ...O.MOON_NOTES.map(n => n.src), ...O.MOON_VIEWING.map(v => v.src)], esc)}`;
    add('calendar/full-moon.html', `満月カレンダー${yFrom}-${yTo}｜次の満月はいつ？中秋の名月も｜ほしぞらさんぽ`,
      `次の満月はいつ？${yFrom}〜${yTo}年の満月の日時を国立天文台の暦要項にもとづいて一覧に。地球に近い満月、中秋の名月・十三夜の日付も。その夜の月をプラネタリウムで見られます。`, body,
      breadcrumb('満月カレンダー', 'calendar/full-moon.html'));
  }
  {
    const nn = nextOf('new');
    const body = `${crumbs('新月カレンダー')}
<h1>新月カレンダー<small>星がいちばんよく見える夜はいつ？ ${yFrom}–${yTo}年の新月</small></h1>
<div class="box next"><div><span class="chip">次の新月</span> <span data-next="new">${esc(summaryOf(nn))}</span></div></div>
${moonTable('new')}
<h2>新月とは</h2>
<p>月が太陽と同じ方向にきた瞬間が「新月（朔）」です。月は太陽の光が当たっていない側を地球に向けているうえ、太陽といっしょに昇って沈むので、夜空に月は見えません。</p>
<h2>星空観察は新月の前後がねらい目</h2>
<p>月明かりは想像以上に明るく、満月のころは暗い星や天の川がほとんど見えなくなります。新月をはさんだ前後数日は月明かりがないので、天の川や暗い星座、流れ星を見るのにいちばん向いています。キャンプや星空観察の予定を立てるときの目安にしてください。「星空を見る」を押すと、その夜21時の南の空（東京）がプラネタリウムでひらきます。</p>
${sourceList(O.MOON_PHASES.map(r => r.src), esc)}`;
    add('calendar/new-moon.html', `新月カレンダー${yFrom}-${yTo}｜星空観察に向いた日はいつ？｜ほしぞらさんぽ`,
      `${yFrom}〜${yTo}年の新月の日時を国立天文台の暦要項にもとづいて一覧に。月明かりのない新月前後は、天の川や流れ星を見るのにいちばん向いた時期です。`, body,
      breadcrumb('新月カレンダー', 'calendar/new-moon.html'));
  }

  /* ---- 流星群 ---- */
  const meteorRows = (id) => events.filter(e => e.kind === 'meteor' && (!id || e.shower === id));
  /** 流星群の予報（スマホでも読めるよう、表ではなくカードで並べる） */
  const meteorTable = (rows, withName) => `<div class="mcards" data-empty="次の極大の予報は、国立天文台の発表を確認してから掲載します。">${rows.map(e => {
    const r = e.rec, s = SHOWERS[e.shower];
    const peak = `${dayLabel(r.peak)}${r.peak.length > 10 ? ' ' + timeLabel(r.peak) + 'ごろ' : 'ごろ'}`;
    return `<div class="box mcard" data-date="${e.date}" data-kind="meteor" data-summary="${esc(summaryOf(e))}">
  <div class="mcard-h">${withName ? `<a href="./${s.page ? s.page + '.html' : '#' + e.shower}">${esc(s.name)}</a>　` : ''}<b>${peak}</b> に極大</div>
  <dl class="info"><dt>見ごろ</dt><dd>${esc(r.best)}</dd><dt>流星数のめやす</dt><dd>${esc(r.rate)}</dd><dt>月の条件</dt><dd>${esc(r.moon)}</dd></dl>
  <a href="${skyLink(e.view, e.look)}">見ごろの星空をプラネタリウムで見る →</a>
</div>`;
  }).join('')}</div>`;
  /** 放射点の高さ（東京、その年の極大の夜） */
  function radiantTable(s, rec) {
    const base = midnightJst(parts(rec.view).date);                // 見ごろの日の0時
    const [ra, dec] = A.precessor(base)(s.radiant[0] * DEG, s.radiant[1] * DEG);
    const hours = [-4, -2, 0, 2, 4];
    const cells = hours.map(h => {
      const ms = base + h * HOUR, lst = A.lstRad(ms, E.TOKYO.lon);
      const alt = A.altAz(Math.sin(dec), Math.cos(dec), ra, lst, Math.sin(E.TOKYO.lat * DEG), Math.cos(E.TOKYO.lat * DEG))[0] / DEG;
      const sun = E.sunAlt(ms);
      return `<td class="num">${alt < 0 ? '地平線の下' : Math.round(alt) + '°'}${sun > -12 ? '<br><small>空が明るい</small>' : ''}</td>`;
    });
    const p = parts(rec.view);
    return `<div class="scroll"><table class="evtable"><thead><tr><th>時刻</th>${hours.map(h => `<th>${(h + 24) % 24}時</th>`).join('')}</tr></thead>
<tbody><tr><th>放射点の高さ</th>${cells.join('')}</tr></tbody></table></div>
<p class="lead">東京で ${p.y}年${p.m}月${p.d}日の0時前後に見たときの計算値（ほしぞらさんぽの計算によるめやす）。放射点が高いほど、たくさんの流星が見えます。</p>`;
  }
  for (const [id, s] of Object.entries(SHOWERS).filter(([, s]) => s.big)) {
    const rows = meteorRows(id), next = rows.find(upcoming) || rows.at(-1);
    const year = next ? parts(next.rec.peak).y : '';
    const cons = s.cons.map(c => `<a href="../zukan/${c}.html">${esc(conName(c))}</a>`).join('と');
    const body = `${crumbs(s.name)}
<h1>${s.name}<small>いつ・どの方角・何時ごろ見える？</small></h1>
<p class="lead">${esc(s.name)}は三大流星群のひとつで、${esc(s.season)}に活動が最も活発になります（極大）。${esc(s.feature)}</p>
<h2>いつ見える？（極大の予報）</h2>
${meteorTable(rows, false)}
<p>極大の日時は年ごとに少しずつ変わります。上の予報は国立天文台の発表（国際流星機構 IMO の予報にもとづく）です。極大の時刻が日本の昼間でも、その前後の夜に多くの流星が見られます。</p>
${next ? `<a class="cta" href="${skyLink(next.view, next.look)}">${year}年の見ごろの星空をプラネタリウムで見る →</a>` : ''}
<h2>どの方角を見ればいい？</h2>
<p>流星は、放射点という空の一点から放射状に飛び出すように流れます。${esc(s.name)}の放射点は${cons}${s.cons.length > 1 ? 'の境界付近' : ''}にあります。ただし流星は放射点のまわりだけでなく空全体に現れるので、方角にこだわらず、なるべく空の広い範囲を見渡すのがコツです。</p>
<h2>何時ごろが見ごろ？</h2>
${next ? radiantTable(s, next.rec) : ''}
<h2>観察のしかた</h2>
<ul>
<li>街明かりの少ない、空の広く見える場所を選びましょう。</li>
<li>目が暗さに慣れるまで、最低でも15分ほどは見続けましょう。スマホの画面を見ると目が明るさに戻ってしまうので、ほしぞらさんぽの「赤いライト」を使うのがおすすめです。</li>
<li>レジャーシートに寝転んだり、背もたれを倒せるイスに座ったりすると楽な姿勢で見られます。双眼鏡や望遠鏡は視野がせまくなるので使いません。</li>
<li>月が明るい年は流星数が減ります。表の「月の条件」も確認してください。</li>
<li>夜の外出は、事故や防寒・防虫に気をつけ、お子さんは大人といっしょに。マナーを守って観察しましょう。</li>
</ul>
<h2>流星のもとになる天体（母天体）</h2>
<p>流星群は、彗星などが通り道にまき散らしたチリの粒が、地球の大気に飛び込んで光る現象です。${esc(s.name)}の母天体は、${esc(s.parent)}。</p>
<p>もっと詳しくは、国立天文台の解説ページ「<a href="${s.naoj}">${esc(s.name)}</a>」「<a href="https://www.nao.ac.jp/astro/basic/obs-meteor-shower.html">流星群の観察方法</a>」をご覧ください。ほかの流星群は<a href="./meteor-showers.html">流星群カレンダー</a>にまとめています。</p>
${sourceList(rows.map(e => e.src[0]), esc)}`;
    add(`calendar/${s.page}.html`, `${s.name}${year}はいつ？見える方角・時間・見方｜ほしぞらさんぽ`,
      `${s.name}${year ? year + '年' : ''}の極大はいつ？国立天文台の発表をもとに、極大の日時・見ごろの時間帯・流星数のめやす・月の条件、見る方角と観察のしかたを解説。見ごろの星空をプラネタリウムで確かめられます。`, body,
      [{ '@context': 'https://schema.org', '@type': 'Article', headline: `${s.name}はいつ？見える方角・時間・見方`, inLanguage: 'ja', dateModified: UPDATED,
        author: { '@type': 'Organization', name: 'yorozu-craft', url: 'https://yorozu-craft.com/' }, mainEntityOfPage: `${BASE}calendar/${s.page}.html` },
       breadcrumb(s.name, `calendar/${s.page}.html`)]);
  }
  {
    const all = meteorRows();
    const others = Object.entries(SHOWERS).filter(([, s]) => !s.big).map(([id, s]) =>
      `<h3 id="${id}">${esc(s.name)}</h3><p>${esc(s.season)}に極大。放射点は${s.cons.map(c => `<a href="../zukan/${c}.html">${esc(conName(c))}</a>`).join('・')}の方向にあります。</p>`).join('');
    const body = `${crumbs('流星群カレンダー')}
<h1>流星群カレンダー ${yFrom}–${yTo}<small>主な流星群の極大・見ごろ・流星数</small></h1>
<div class="box next"><div><span class="chip">次の流星群</span> <span data-next="meteor">${esc(summaryOf(nextOf('meteor')))}</span></div></div>
${meteorTable(all, true)}
<p class="lead">流星数は、見ごろの時間帯に天の川が見えるような暗い空で見たときの、1時間あたりの最大のめやすです。街明かりの中ではその数分の1になります。</p>
<h2>三大流星群</h2>
<ul class="cards">${Object.entries(SHOWERS).filter(([, s]) => s.big).map(([, s]) => `<li><a href="./${s.page}.html"><div><b>${esc(s.name)}</b><span>${esc(s.season)}</span></div></a></li>`).join('')}</ul>
<h2>そのほかの流星群</h2>
${others}
<h2>流星群とは</h2>
<p>彗星などが通り道にまき散らしたチリの粒の集まりに地球が毎年同じ時期に飛び込むため、決まった時期に流星が多く流れます。流星が空の一点（放射点）から飛び出すように見えることから、放射点のある星座の名前で呼ばれます。</p>
${sourceList(all.map(e => e.src[0]), esc)}`;
    add('calendar/meteor-showers.html', `流星群カレンダー${yFrom}-${yTo}｜次の流星群はいつ？極大と見ごろ｜ほしぞらさんぽ`,
      `次の流星群はいつ？ペルセウス座・ふたご座・しぶんぎ座の三大流星群ほか、主な流星群の極大日時・見ごろ・流星数のめやす・月の条件を国立天文台の発表にもとづいて一覧に。`, body,
      breadcrumb('流星群カレンダー', 'calendar/meteor-showers.html'));
  }

  /* ---- 日食・月食 ---- */
  const eclipseTable = (body) => {
    const rows = events.filter(e => e.kind === 'eclipse' && e.rec.body === body);
    return `<div class="scroll" data-empty="次の予定は、国立天文台の発表を確認してから掲載します。"><table class="evtable"><thead><tr><th>日付</th><th>種類</th><th>日本での見え方</th></tr></thead><tbody>${rows.map(e => {
      const r = e.rec, vis = r.japan === 'visible' ? '<b>見られる</b>' : r.japan === 'central' ? '<b>中心食が見られる地域がある</b>' : '見られない';
      return `<tr data-date="${e.date}" data-kind="${body}-eclipse${r.japan !== 'none' ? '-jp' : ''}" data-summary="${esc(`${e.dateLabel || dayLabel(e.date)}　${r.type}`)}"><td>${esc(e.dateLabel || dayLabel(e.date))}</td><td>${esc(r.type)}</td><td>${vis}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  };
  const nextJp = body => events.find(e => e.kind === 'eclipse' && e.rec.body === body && e.rec.japan !== 'none' && upcoming(e));
  {
    const nx = nextJp('moon');
    const ex = O.ECLIPSES.find(e => e.tokyo);
    const exRow = ex ? `<h2>例：${dayLabel(ex.date)}の${esc(ex.type)}（東京）</h2>
<div class="scroll"><table class="evtable"><thead><tr><th>食の始め</th><th>皆既の始め</th><th>食の最大</th><th>皆既の終り</th><th>食の終り</th></tr></thead>
<tbody><tr>${['start', 'totalStart', 'max', 'totalEnd', 'end'].map(k => `<td class="num">${ex.tokyo[k].replace(/(\d+):(\d+)\.(\d)/, '$1時$2.$3分')}</td>`).join('')}</tr></tbody></table></div>
<p class="lead">国立天文台の暦要項より（食分 ${ex.tokyo.mag}）。月食の時刻は日本のどこで見てもほぼ同じで、見られるかどうかは、その時刻に月が地平線の上にあるかで決まります。</p>` : '';
    const body = `${crumbs('月食')}
<h1>月食カレンダー<small>次に日本で見られる月食・皆既月食はいつ？</small></h1>
<div class="box next"><div><span class="chip">日本で見られる次の月食</span> <span data-next="moon-eclipse-jp">${esc(nx ? `${dayLabel(nx.date)}　${nx.rec.type}` : '')}</span></div></div>
${eclipseTable('moon')}
<p>${O.ECLIPSES[0].date.slice(0, 4)}〜2030年の月食です。${'2027'}年までは国立天文台の暦要項、それより先は国立天文台の日月食等データベース（日付と日本付近での見え方）によります。詳しい時刻は、国立天文台が前の年の2月に発表する暦要項で決まります。暦要項と同じく、月がわずかに暗くなるだけの「半影月食」はのせていません。</p>
<h2>月食とは</h2>
<p>太陽・地球・月がこの順に一直線に並び、地球の影に月が入って欠けて見える現象です。満月のときにだけ起こります。月の一部が影に入るのが「部分月食」、月全体が影に入るのが「皆既月食」です。皆既月食のあいだ、月は真っ暗にはならず、赤銅色（しゃくどういろ）と呼ばれる赤黒い色に見えます。地球の大気を通った赤い光が、わずかに月まで届くためです。</p>
${exRow}
<h2>観察のしかた</h2>
<p>月食は、月が見えていれば特別な道具なしで、肉眼で安全に観察できます。双眼鏡があると、欠けていく様子や月の色の変化がよりよく分かります。各地での見え方は、国立天文台の「<a href="https://eco.mtk.nao.ac.jp/cgi-bin/koyomi/eclipsex_l.cgi">月食各地予報</a>」で調べられます。</p>
${sourceList(O.ECLIPSES.filter(e => e.body === 'moon').map(e => e.src), esc)}`;
    add('calendar/lunar-eclipse.html', '次の皆既月食はいつ？日本で見られる月食カレンダー｜ほしぞらさんぽ',
      `次に日本で見られる月食・皆既月食はいつ？国立天文台の暦要項と日月食等データベースにもとづく月食の一覧（2030年まで）と、月食のしくみ・観察のしかた。`, body,
      breadcrumb('月食', 'calendar/lunar-eclipse.html'));
  }
  {
    const nx = nextJp('sun');
    const body = `${crumbs('日食')}
<h1>日食カレンダー<small>次に日本で見られる日食はいつ？</small></h1>
<div class="box warn"><b>⚠ 太陽は絶対に直接見ないでください</b><br>日食のときも、太陽を肉眼や双眼鏡・望遠鏡・カメラのファインダーで直接見ると、目を傷めて視力を失うおそれがあります。下じきや色つきの下敷き、サングラス、すすをつけたガラスなども危険です。観察するときは、日食観察用に作られた専用のグラスを正しく使うか、ピンホールで太陽の像を映すなど、安全な方法で。お子さんは必ず大人といっしょに観察してください。</div>
<div class="box next"><div><span class="chip">日本で見られる次の日食</span> <span data-next="sun-eclipse-jp">${esc(nx ? `${dayLabel(nx.date)}　${nx.rec.type}` : '')}</span></div></div>
${eclipseTable('sun')}
<p>${O.ECLIPSES[0].date.slice(0, 4)}〜2030年の日食です。2027年までは国立天文台の暦要項、それより先は国立天文台の日月食等データベース（日付と日本付近での見え方。やや広めの範囲で判定したもの）によります。詳しい時刻や、それぞれの地域での見え方は、国立天文台の「<a href="https://eco.mtk.nao.ac.jp/cgi-bin/koyomi/eclipsex_s.cgi">日食各地予報</a>」で調べられます。</p>
<h2>日食とは</h2>
<p>太陽・月・地球がこの順に一直線に並び、月が太陽をかくす現象です。新月のときにだけ起こります。太陽の一部がかくれるのが「部分日食」、全部がかくれるのが「皆既日食」、月が太陽より少し小さく見えるときに太陽がリングのように残るのが「金環日食」です。皆既日食や金環日食が見られるのは、月の影が通るせまい地域だけで、そのまわりの広い地域では部分日食になります。</p>
<h2>プラネタリウムでは</h2>
<p>ほしぞらさんぽのプラネタリウムは、日食で太陽が欠ける様子は描きません。日食の日の太陽と月の位置関係（ほぼ同じ方向に並ぶこと）は、時間たびで確かめられます。</p>
${sourceList(O.ECLIPSES.filter(e => e.body === 'sun').map(e => e.src), esc)}`;
    add('calendar/solar-eclipse.html', '次の日食はいつ？日本で見られる日食カレンダー｜ほしぞらさんぽ',
      `次に日本で見られる日食はいつ？国立天文台の暦要項と日月食等データベースにもとづく日食の一覧（2030年まで）と、日食のしくみ・安全な観察のしかた。`, body,
      breadcrumb('日食', 'calendar/solar-eclipse.html'));
  }

  /* ---- 惑星 ---- */
  {
    const rows = events.filter(e => e.kind === 'planet');
    const table = `<div class="scroll" data-empty="次の予定は、国立天文台の発表を確認してから掲載します。"><table class="evtable"><thead><tr><th>日付</th><th>現象</th><th>見え方</th><th></th></tr></thead><tbody>${rows.map(e =>
      `<tr data-date="${e.date}" data-kind="planet" data-summary="${esc(summaryOf(e))}"><td>${dayLabel(e.date)}</td><td>${esc(e.title)}</td><td>${esc(e.sub)}</td><td><a href="${skyLink(e.view, e.look)}">星空を見る →</a></td></tr>`).join('')}</tbody></table></div>`;
    const body = `${crumbs('惑星の見ごろ')}
<h1>惑星の見ごろカレンダー<small>火星・木星・土星の衝と、水星・金星の最大離角</small></h1>
${table}
<p class="lead">「星空を見る」は、衝は23時、東方最大離角は夕方、西方最大離角は明け方の、空が暗くなるころ（東京）の星空をひらきます。</p>
<h2>衝（しょう）— 火星・木星・土星の見ごろ</h2>
<p>地球より外側をまわる惑星が、地球から見て太陽とちょうど反対の方向にくることを「衝」といいます。夕方に東から昇って一晩中見え、真夜中に南の空高くにきます。地球との距離も近くなるので、一年のうちで最も明るく、望遠鏡では大きく見える、いちばんの見ごろです。</p>
<h2>最大離角（さいだいりかく）— 水星・金星の見ごろ</h2>
<p>地球より内側をまわる水星と金星は、いつも太陽の近くに見えるため、夕方の西の空か明け方の東の空でしか見られません。太陽から最も離れて見えるときを「最大離角」といい、見つけやすい時期です。夕方の空で離れるのが「東方最大離角」、明け方の空で離れるのが「西方最大離角」です。水星は太陽から大きく離れないので、最大離角のころでも低い空で、見つけるのは少し難しい惑星です。</p>
<h2>最大光度 — 金星がいちばん明るいころ</h2>
<p>金星は満ち欠けと地球との距離の変化によって明るさが変わり、いちばん明るく見えるころを「最大光度」といいます。マイナス4等を超える明るさで、昼間の青空の中でも見えることがあるほどです。</p>
${sourceList(rows.map(e => e.src[0]), esc)}`;
    add('calendar/planets.html', `惑星の見ごろカレンダー${yFrom}-${yTo}｜火星・木星・土星の衝、金星・水星の最大離角｜ほしぞらさんぽ`,
      `${yFrom}〜${yTo}年の惑星の見ごろ。火星・木星・土星の衝、水星・金星の最大離角、金星の最大光度の日付を国立天文台の発表にもとづいて一覧に。その日の星空をプラネタリウムで見られます。`, body,
      breadcrumb('惑星の見ごろ', 'calendar/planets.html'));
  }

  /** 星座図鑑から流星群へのリンク用 */
  const showerLinks = {};
  for (const [id, s] of Object.entries(SHOWERS)) for (const c of s.cons) {
    (showerLinks[c] ||= []).push({ name: s.name, season: s.season, href: `../calendar/${s.page ? s.page + '.html' : 'meteor-showers.html#' + id}` });
  }
  return { files, showerLinks };
};
/* 英語版（tools/calendar-pages-en.js）が同じデータ・同じ計算を使うための部品 */
Object.assign(module.exports, { allEvents, SHOWERS, parts, isoJst, midnightJst, planetView, fullMoonView });
