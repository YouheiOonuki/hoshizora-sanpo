'use strict';
/* 購読用の天文カレンダー（data/tenmon.ics、CC0）のテスト。実行: node --test tests/*.test.js
   ファイルが tools/official-events.js から書き出した結果と同じか（手で直していないか・書き出し忘れがないか）、
   カレンダーの説明（CC0・出典・確認日）と更新の間隔、各予定の説明と出典、UID が安定しているかを確かめる */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const O = require('../tools/official-events.js');
const B = require('../tools/build-ics.js');

const ics = fs.readFileSync(path.join(__dirname, '..', 'data/tenmon.ics'), 'utf8');
const unfold = s => s.replace(/\r\n[ \t]/g, '');
const value = (s, name) => { const m = unfold(s).match(new RegExp('^' + name + '(?:;[^:\\r\\n]*)?:(.*)\\r$', 'm')); return m && m[1].replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1'); };
const vevents = () => unfold(ics).split('BEGIN:VEVENT\r\n').slice(1).map(b => b.split('END:VEVENT')[0]);

test('data/tenmon.ics が tools/official-events.js から書き出した結果と同じ（node tools/build-ics.js）', () => {
  assert.strictEqual(ics, B.buildIcs());
});

test('形: VCALENDAR で始まり CRLF だけ、1 行 75 オクテット以内、Windows で取り出しても CRLF のまま', () => {
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), '改行は CRLF だけ');
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.match(fs.readFileSync(path.join(__dirname, '..', '.gitattributes'), 'utf8'), /^data\/\*\.ics -text$/m);
});

test('カレンダーの説明に CC0・確認日・出典の URL（予定に使った出典をすべて）、更新の間隔は 1 週間', () => {
  const d = value(ics, 'X-WR-CALDESC');
  assert.match(d, /CC0 1\.0/);
  assert.ok(d.includes('確認日: ' + O.CHECKED) && d.includes(O.CHECKED_QUARTERS));
  const used = new Set(B.events().flatMap(e => e.srcs.map(k => O.SRC[k][1])));
  for (const u of used) assert.ok(d.split('\n').includes(u), u);
  assert.match(unfold(ics), /^REFRESH-INTERVAL;VALUE=DURATION:P1W\r$/m);
  assert.match(unfold(ics), /^X-PUBLISHED-TTL:P1W\r$/m);
});

test('予定: 朔弦望・流星群・日食月食がそろい、各予定に説明 1 文と出典の URL、UID は重ならない', () => {
  const ev = vevents();
  const uids = ev.map(b => b.match(/^UID:(.+)\r$/m)[1]);
  assert.strictEqual(new Set(uids).size, uids.length);
  const inCov = r => { const d = new Date(Date.parse(r.at) + 9 * 3600000).toISOString().slice(0, 10); return d >= O.COVERAGE.from && d <= O.COVERAGE.to; };
  const nMoon = O.MOON_PHASES.filter(inCov).length + O.MOON_QUARTERS.filter(inCov).length;
  assert.strictEqual(uids.filter(u => u.startsWith('tenmon-moon-')).length, nMoon);
  assert.strictEqual(uids.filter(u => u.startsWith('tenmon-meteor-')).length, O.METEOR_PEAKS.length);
  assert.strictEqual(uids.filter(u => u.startsWith('tenmon-eclipse-')).length, O.ECLIPSES.filter(e => e.date >= O.COVERAGE.from).length);
  for (const t of ['new', 'first', 'full', 'last']) assert.ok(uids.some(u => u.endsWith('-' + t + '@yorozu-craft.com')), t);
  for (const b of ev) {
    const desc = value(b + '\r\n', 'DESCRIPTION');
    const [first] = desc.split('\n');
    assert.match(first, /。$/, '1 行目は説明の文');
    assert.match(desc, /\n出典: [^\n]+ https:\/\/(eco\.mtk\.nao\.ac\.jp|www\.nao\.ac\.jp)\//, b.slice(0, 60));
    assert.match(b, /^URL:https:\/\/yorozu-craft\.com\/hoshizora-sanpo\/calendar\//m);
    assert.match(b, /^DTSTART(;VALUE=DATE:\d{8}|:\d{8}T\d{6}Z)\r$/m);
  }
});

test('時刻: 予定の時刻（UTC）は暦要項の日本時間と同じ瞬間（例: 2026-10-11 0:50 の新月）', () => {
  const b = vevents().find(x => x.includes('UID:tenmon-moon-2026-10-11-new@'));
  assert.match(b, /^DTSTART:20261010T155000Z\r$/m);
  const g = vevents().find(x => x.includes('UID:tenmon-meteor-geminids-2026@'));
  assert.match(g, /^DTSTART:20261214T140000Z\r$/m);           // 極大 2026-12-14 23:00 JST
  const o = vevents().find(x => x.includes('UID:tenmon-meteor-orionids-2026@'));
  assert.match(o, /^DTSTART;VALUE=DATE:20261022\r$/m);         // 「このころ」は終日
  assert.match(o, /^DTEND;VALUE=DATE:20261023\r$/m);
});

test('天文カレンダーのページの一覧の下に「カレンダーに登録」（webcal のリンク・URL・共通の手順ページ）', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'calendar/index.html'), 'utf8');
  const at = html.indexOf('id="calendar-subscribe"');
  assert.ok(at > 0);
  assert.ok(at > html.lastIndexOf('class="evlist"'), '一覧より後');
  assert.match(html, /href="webcal:\/\/yorozu-craft\.com\/hoshizora-sanpo\/data\/tenmon\.ics"/);
  assert.match(html, /value="https:\/\/yorozu-craft\.com\/hoshizora-sanpo\/data\/tenmon\.ics"/);
  assert.match(html, /href="\.\.\/\.\.\/calendar-help\.html"/);
  assert.ok(!fs.readFileSync(path.join(__dirname, '..', 'sitemap.xml'), 'utf8').includes('.ics'), 'ics は sitemap に入れない');
});
