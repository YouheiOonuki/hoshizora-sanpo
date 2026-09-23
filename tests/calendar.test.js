'use strict';
/* 天文カレンダーのデータ（国立天文台から書き写したもの）を、自前の計算と突き合わせる。
   書き写しの誤り（桁・日付・種類の取り違え）を見つけるのが目的。実行: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const O = require('../tools/official-events.js');
const E = require('../tools/events.js');

const JST = 9 * 3600000;
const jstDate = ms => new Date(ms + JST).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

test('すべての行に出典がある', () => {
  const all = [...O.MOON_PHASES, ...O.MOON_NOTES, ...O.MOON_VIEWING, ...O.METEOR_PEAKS, ...O.ECLIPSES, ...O.PLANET_EVENTS];
  for (const r of all) assert.ok(O.SRC[r.src], `出典がない: ${JSON.stringify(r)}`);
  for (const [name, url] of Object.values(O.SRC)) assert.match(url, /^https:\/\/(eco\.mtk\.nao\.ac\.jp|www\.nao\.ac\.jp)\//, name);
});

test('新月・満月の時刻が計算（Meeus）と2分以内で一致する', () => {
  const from = Date.parse(O.MOON_PHASES[0].at) - 86400000, to = Date.parse(O.MOON_PHASES.at(-1).at) + 86400000;
  const calc = E.moonPhases(from, to);
  assert.strictEqual(calc.length, O.MOON_PHASES.length, '回数が合わない（抜け・重複の疑い）');
  O.MOON_PHASES.forEach((r, i) => {
    assert.strictEqual(calc[i].type, r.type === 'full' ? 'full-moon' : 'new-moon', r.at);
    const diffMin = Math.abs(calc[i].ms - Date.parse(r.at)) / 60000;
    assert.ok(diffMin <= 2, `${r.at} は計算と ${diffMin.toFixed(1)} 分ずれている`);
  });
});

test('満月の注記・お月見の日付は満月の前後に入っている', () => {
  const fulls = O.MOON_PHASES.filter(r => r.type === 'full').map(r => jstDate(Date.parse(r.at)));
  for (const n of O.MOON_NOTES) assert.ok(fulls.includes(n.date), `${n.date} は満月の日ではない`);
  for (const v of O.MOON_VIEWING) {
    const near = O.MOON_PHASES.filter(r => r.type === 'full').some(r => Math.abs(dayDiff(v.date, jstDate(Date.parse(r.at)))) <= 3)
      || v.name === '十三夜';                                      // 十三夜は満月の2日ほど前
    assert.ok(near, v.date);
  }
});

test('惑星の衝・最大離角の日付が計算と一致する（日本時間の日付）', () => {
  const from = Date.parse('2026-09-01'), to = Date.parse('2028-01-01');
  const opp = E.oppositions(from, to), el = E.elongations(from, to);
  for (const r of O.PLANET_EVENTS) {
    if (r.kind === 'opposition') {
      const c = opp.find(o => o.planet === r.planet && Math.abs(dayDiff(jstDate(o.ms), r.date)) <= 1);
      assert.ok(c, `${r.date} ${r.planet} の衝が計算にない`);
      assert.strictEqual(jstDate(c.ms), r.date, `${r.planet} の衝の日付`);
    } else if (r.kind.startsWith('elong')) {
      const side = r.kind === 'elong-east' ? 'east' : 'west';
      const c = el.find(o => o.planet === r.planet && o.side === side && Math.abs(dayDiff(jstDate(o.ms), r.date)) <= 1);
      assert.ok(c, `${r.date} ${r.planet} の${side}最大離角が計算にない（1日以内）`);
    }
  }
  // 逆向き: 期間内に計算で出た衝は、すべてデータに入っている
  for (const o of opp.filter(o => jstDate(o.ms) >= O.COVERAGE.from && jstDate(o.ms) <= O.COVERAGE.to)) {
    assert.ok(O.PLANET_EVENTS.some(r => r.kind === 'opposition' && r.planet === o.planet), `${o.planet} の衝が抜けている`);
  }
});

test('流星群: 「星空を見る」時刻は極大の前後2日以内、日食・月食の日付は新月・満月の日', () => {
  for (const m of O.METEOR_PEAKS) {
    assert.ok(Math.abs(dayDiff(m.view.slice(0, 10), m.peak.slice(0, 10))) <= 2, `${m.shower} ${m.peak}`);
  }
  const phases = E.moonPhases(Date.parse('2026-01-01'), Date.parse('2031-01-01'));
  for (const e of O.ECLIPSES) {
    const want = e.body === 'sun' ? 'new-moon' : 'full-moon';
    const ok = phases.some(p => p.type === want && Math.abs(dayDiff(jstDate(p.ms), e.date)) <= 1);
    assert.ok(ok, `${e.date} ${e.type}: その日は${e.body === 'sun' ? '新月' : '満月'}ではない`);
  }
});
