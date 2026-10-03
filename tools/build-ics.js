'use strict';
/* 天文カレンダーの購読用 .ics（data/tenmon.ics、CC0）を tools/official-events.js から書き出す（yorozu-plans ROADMAP 7.14 の 2、K129）
 *   node tools/build-ics.js          書き出す
 *   node tools/build-ics.js --check  書き出した結果とファイルが違えば終了コード 1（テストと同じ確認）
 * data/tenmon.ics は手で直さない。日付は official-events.js にだけ書き、これを走らせる
 * 入れるもの: 朔弦望（新月・上弦・満月・下弦）、流星群の極大、日食・月食（COVERAGE.from 以降）。お月見・惑星は入れない
 * - UID は現象と日付から作る（同じ現象なら書き出し直しても同じ UID。購読している端末で予定が重ならない）
 * - DTSTAMP は確認日（同じデータなら同じファイル）。時刻のある現象は UTC（末尾 Z）で書き、VTIMEZONE を持たない
 * - 各予定の説明は 1 文＋出典（名前と URL）＋くわしいページ
 * - 同じ予定を data/tenmon.json（CC0。yorozu-plans ROADMAP 7.17 の K133）にも書き出す
 * - 生成日（generated。ACCEPTANCE 7.10.3 e）: 中身（生成日を除く）が今のファイルと同じなら今の生成日をそのまま使い、
 *   中身が変わったときだけその日（日本時間。環境変数 GENERATED=YYYY-MM-DD で指定もできる）にする（seido-keisan の tools/build-data.mjs と同じ決まり） */
const fs = require('fs');
const path = require('path');
const O = require('./official-events.js');
const { SHOWERS } = require('./calendar-pages.js');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://yorozu-craft.com/hoshizora-sanpo/';
const ICS_URL = BASE + 'data/tenmon.ics';
const FILE = path.join(ROOT, 'data/tenmon.ics');
const JSON_URL = BASE + 'data/tenmon.json';
const JSON_FILE = path.join(ROOT, 'data/tenmon.json');
const JST = 9 * 3600000;

/* ---------- iCalendar の書き方（RFC 5545。seido-keisan の lib/kaitei.js と同じ） ---------- */
const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utf8len = ch => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };
/** 1 行 75 オクテットで折り返す（UTF-8 の文字の途中では切らない。続きの行は空白 1 つで始める） */
function fold(line) {
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const b = utf8len(ch);
    if (bytes + b > 75) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}
const ymd = date => date.slice(0, 10).replace(/-/g, '');
const nextDay = date => new Date(Date.parse(date.slice(0, 10) + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10).replace(/-/g, '');
const utcStamp = iso => new Date(Date.parse(iso)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
/** 日本時間の日付と「H時MM分」 */
function jst(iso) {
  const d = new Date(Date.parse(iso) + JST);
  const date = d.toISOString().slice(0, 10);
  const [y, m, dd] = date.split('-').map(Number);
  return { date, label: `${y}年${m}月${dd}日`, time: `${d.getUTCHours()}時${String(d.getUTCMinutes()).padStart(2, '0')}分` };
}
const src = key => { const s = O.SRC[key]; if (!s) throw new Error('出典が無い: ' + key); return { label: s[0], url: s[1] }; };

/* ---------- 予定 ---------- */
const MOON = {
  new: { name: '新月', summary: '新月', page: 'calendar/new-moon.html', tail: '月明かりがなく、星空の観察に向いた時期です' },
  first: { name: '上弦', summary: '上弦の月', page: 'calendar/', tail: '右半分が光る半月のころです' },
  full: { name: '満月', summary: '満月', page: 'calendar/full-moon.html', tail: '' },
  last: { name: '下弦', summary: '下弦の月', page: 'calendar/', tail: '左半分が光る半月のころです' },
};

function events() {
  const ev = [];
  const from = O.COVERAGE.from, to = O.COVERAGE.to;
  // 朔弦望（暦要項）。満月の注記（ほしぞら情報）は説明に足す
  for (const r of [...O.MOON_PHASES, ...O.MOON_QUARTERS]) {
    const t = jst(r.at);
    if (t.date < from || t.date > to) continue;
    const m = MOON[r.type];
    const note = r.type === 'full' && O.MOON_NOTES.find(n => n.date === t.date);
    const sentence = `国立天文台の暦要項による${m.name}の時刻は、日本時間で${t.label} ${t.time}です${m.tail ? '。' + m.tail : ''}${note ? '。' + note.note + 'です' : ''}。`;
    ev.push({ sort: r.at, uid: `tenmon-moon-${t.date}-${r.type}`, start: { time: r.at },
      summary: m.summary + (note ? `（${note.note}）` : ''), desc: sentence, srcs: note ? [r.src, note.src] : [r.src], page: m.page });
  }
  // 流星群の極大（ほしぞら情報）。「このころ」（日付だけ）は終日の予定
  for (const p of O.METEOR_PEAKS) {
    const s = SHOWERS[p.shower];
    const timed = p.peak.length > 10;
    const t = timed ? jst(p.peak) : null;
    const when = timed ? `極大は日本時間で${t.label} ${t.time}ごろ` : `極大は${jst(p.peak + 'T12:00:00+09:00').label}ごろ`;
    ev.push({ sort: timed ? p.peak : p.peak + 'T00:00+09:00', uid: `tenmon-meteor-${p.shower}-${p.peak.slice(0, 4)}`,
      start: timed ? { time: p.peak } : { date: p.peak },
      summary: `${s.name}が極大`, desc: `${when}で、見ごろは${p.best}、流星数のめやすは${p.rate}です（${p.moon}）。`,
      srcs: [p.src], page: s.page ? `calendar/${s.page}.html` : `calendar/meteor-showers.html#${p.shower}` });
  }
  // 日食・月食（暦要項・日月食等データベース）。日付だけなので終日の予定
  for (const e of O.ECLIPSES) {
    if (e.date < from) continue;
    const vis = e.japan === 'visible' ? '日本で見られます' : e.japan === 'central' ? '日本付近で中心食になります' : '日本では見られません';
    const visShort = e.japan === 'visible' ? '日本で見られる' : e.japan === 'central' ? '日本付近で中心食' : '日本では見られない';
    ev.push({ sort: e.date + 'T00:00+09:00', uid: `tenmon-eclipse-${e.date}-${e.body}`, start: { date: e.date },
      summary: `${e.type}（${visShort}）`,
      desc: `国立天文台の発表による${e.type}の日${e.dateLabel ? `（${e.dateLabel}）` : ''}で、${vis}。`,
      srcs: [e.src], page: e.body === 'sun' ? 'calendar/solar-eclipse.html' : 'calendar/lunar-eclipse.html' });
  }
  return ev.sort((a, b) => Date.parse(a.sort) - Date.parse(b.sort) || a.uid.localeCompare(b.uid));
}

/** 日本時間の今日（YYYY-MM-DD）。GENERATED があればそれ */
function today() {
  const g = process.env.GENERATED;
  if (g && /^\d{4}-\d{2}-\d{2}$/.test(g)) return g;
  return new Date(Date.now() + JST).toISOString().slice(0, 10);
}

function calDesc(ev, generated = today()) {
  const urls = [...new Set(ev.flatMap(e => e.srcs.map(k => src(k).url)))];
  return [
    '天文カレンダー（yorozu-craft ほしぞらさんぽ）。新月・上弦・満月・下弦（朔弦望）、流星群の極大、日食・月食。日時は日本時間で、国立天文台の発表を書き写したもの（クレジット: 国立天文台）。',
    'ライセンス: CC0 1.0（パブリック・ドメイン提供） https://creativecommons.org/publicdomain/zero/1.0/deed.ja',
    `確認日: ${O.CHECKED}（新月・満月・流星群・日食・月食）、${O.CHECKED_QUARTERS}（上弦・下弦）。新月・上弦・満月・下弦は自前の計算（Meeus）と2分以内で一致することを確かめた`,
    `生成日: ${generated}（このファイルの中身が変わった日）`,
    `範囲: ${O.COVERAGE.from}〜${O.COVERAGE.to}（日食・月食はデータベースの日付まで）。先の分は国立天文台の発表のあとに足す`,
    'ページ: ' + BASE + 'calendar/',
    '出典（各予定の説明欄にも）:',
    ...urls,
  ].join('\n');
}

function eventLines(e, stamp) {
  const desc = [e.desc, ...e.srcs.map(k => `出典: ${src(k).label} ${src(k).url}`), 'くわしく: ' + BASE + e.page].join('\n');
  const start = e.start.time
    ? ['DTSTART:' + utcStamp(e.start.time)]
    : ['DTSTART;VALUE=DATE:' + ymd(e.start.date), 'DTEND;VALUE=DATE:' + nextDay(e.start.date)];
  return ['BEGIN:VEVENT', `UID:${e.uid}@yorozu-craft.com`, 'DTSTAMP:' + stamp, ...start,
    'SUMMARY:' + icsText(e.summary), 'DESCRIPTION:' + icsText(desc), 'URL:' + BASE + e.page, 'TRANSP:TRANSPARENT', 'END:VEVENT'];
}

function buildIcs(generated = today()) {
  const ev = events();
  const latest = [O.CHECKED, O.CHECKED_QUARTERS].sort().at(-1);
  const stamp = ymd(latest) + 'T000000Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//yorozu-craft//hoshizora-sanpo tenmon//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsText('天文カレンダー（yorozu-craft）'),
    'X-WR-TIMEZONE:Asia/Tokyo',
    'X-WR-CALDESC:' + icsText(calDesc(ev, generated)),
    'REFRESH-INTERVAL;VALUE=DURATION:P1W',
    'X-PUBLISHED-TTL:P1W',
    ...ev.flatMap(e => eventLines(e, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/* ---------- 同じ予定の JSON（data/tenmon.json） ---------- */
function buildJson(generated = today()) {
  const ev = events();
  const urls = [...new Set(ev.flatMap(e => e.srcs.map(k => src(k).url)))];
  const data = {
    title: '天文カレンダー（朔弦望・流星群の極大・日食と月食）',
    license: 'CC0-1.0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.ja',
    publisher: 'yorozu-craft（Youhei Oonuki）',
    credit: '国立天文台（日時は国立天文台の発表を書き写したもの）',
    homepage: BASE + 'calendar/',
    data_url: JSON_URL,
    ics_url: ICS_URL,
    repository: 'https://github.com/YouheiOonuki/hoshizora-sanpo',
    generated_from: 'tools/official-events.js（tools/build-ics.js で書き出し）',
    checked: [O.CHECKED, O.CHECKED_QUARTERS].sort().at(-1),
    checked_detail: { moon_new_full_meteor_eclipse: O.CHECKED, moon_quarters: O.CHECKED_QUARTERS },
    generated,
    source: urls,
    coverage: { from: O.COVERAGE.from, to: O.COVERAGE.to, note: '日食・月食はデータベースの日付まで' },
    note: '時刻のある予定の start は UTC の ISO 8601（日本時間は +9 時間）、日付だけの予定（流星群の「このころ」・日食・月食）は日本の日付。お月見・惑星の見ごろは入れていない。',
    events: ev.map(e => ({
      id: e.uid,
      ...(e.start.time ? { start: new Date(Date.parse(e.start.time)).toISOString().replace(/\.000Z$/, 'Z') } : { date: e.start.date }),
      summary: e.summary,
      description: e.desc,
      url: BASE + e.page,
      sources: e.srcs.map(k => src(k)),
    })),
  };
  return JSON.stringify(data, null, 2) + '\n';
}

/** 今のファイルの生成日（無ければ null） */
function generatedOf(text) {
  if (text == null) return null;
  const m = text.replace(/\r\n[ \t]/g, '').match(/"generated": "(\d{4}-\d{2}-\d{2})"|生成日: (\d{4}-\d{2}-\d{2})/);
  return m ? (m[1] || m[2]) : null;
}
/** 中身が同じなら今の生成日を残し、変わったときだけ今日にする */
function stamp(build, now) {
  const prev = generatedOf(now);
  if (prev && build(prev) === now) return now;
  return build(today());
}
const readOr = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
function outputs() {
  return { [FILE]: stamp(buildIcs, readOr(FILE)), [JSON_FILE]: stamp(buildJson, readOr(JSON_FILE)) };
}

module.exports = { buildIcs, buildJson, events, calDesc, fold, icsText, generatedOf, stamp, outputs, today, ICS_URL, JSON_URL, FILE, JSON_FILE };

if (require.main === module) {
  let bad = 0;
  for (const [file, body] of Object.entries(outputs())) {
    const rel = path.relative(ROOT, file);
    const now = readOr(file);
    if (now === body) console.log(rel + ': 変更なし');
    else if (process.argv.includes('--check')) { console.error(rel + ' が tools/official-events.js と合っていない。node tools/build-ics.js を実行する'); bad++; }
    else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); console.log(rel + ' を書き出した'); }
  }
  if (bad) process.exit(1);
}
