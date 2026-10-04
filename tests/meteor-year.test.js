'use strict';
/* 三大流星群のページの「年ごとの月明かりと見ごろ」（tools/meteor-year.js）を確かめる。
   - 極大のときの月齢を、国立天文台の暦要項の新月の時刻（tools/official-events.js の MOON_PHASES）から数え直して突き合わせる
   - 国立天文台が発表した「月の条件」の文と、計算した月の位置が食い違わないこと
   - ページ（calendar/*.html、コミットされているもの）に計算どおりの数字が入っていること
   実行: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Y = require('../tools/meteor-year.js');
const O = require('../tools/official-events.js');
const C = require('../tools/calendar-pages.js');

const ROOT = path.join(__dirname, '..');
const big = O.METEOR_PEAKS.filter(m => C.SHOWERS[m.shower].big);
const cond = m => Y.yearCondition(m, C.SHOWERS[m.shower].radiant);

test('三大流星群の予報が 4 件ある（2026 ふたご座・2027 しぶんぎ座・ペルセウス座・ふたご座）', () => {
  assert.deepEqual(big.map(m => m.shower + m.peak.slice(0, 4)), ['geminids2026', 'quadrantids2027', 'perseids2027', 'geminids2027']);
});

for (const m of big) {
  test(`月齢を暦要項の新月から数え直す: ${m.shower} ${m.peak}`, () => {
    const y = cond(m);
    const news = O.MOON_PHASES.filter(p => p.type === 'new').map(p => Date.parse(p.at)).filter(t => t <= y.peakMs);
    const age = (y.peakMs - Math.max(...news)) / 86400000;
    assert.ok(Math.abs(age - y.age) < 0.1, `暦要項から ${age.toFixed(2)} / 計算 ${y.age.toFixed(2)}`);
  });
}

test('国立天文台の「月の条件」と計算が食い違わない', () => {
  const by = (s, yr) => cond(big.find(m => m.shower === s && m.peak.startsWith(yr)));
  // 2026 ふたご座「月明かりがなく」: 見ごろの時刻に月は地平線の下で、暗い時間の大半は月が無い
  const g26 = by('geminids', '2026');
  assert.ok(g26.viewMoonAlt < 0 && g26.moonlessHours > g26.darkHours / 2);
  // 2027 ふたご座「月がたいへん明るく悪条件」: 満月に近く、暗い時間ずっと月が出ている
  const g27 = by('geminids', '2027');
  assert.ok(g27.illum > 0.9 && g27.moonlessHours === 0);
  // 2027 ペルセウス座「未明に月が沈んだ後は条件が良い」: 夜半すぎに月が沈み、見ごろ（3 時）には地平線の下
  const p27 = by('perseids', '2027');
  const set = p27.moonEvents.find(e => e.type === 'set');
  assert.ok(set && Y.jst(set.ms).h < 3 && p27.viewMoonAlt < 0);
  // 2027 しぶんぎ座「月の条件は良い」: 細い月（光っている部分 20% 未満）
  assert.ok(by('quadrantids', '2027').illum < 0.2);
});

test('放射点: ペルセウス座流星群は東京で沈まず、しぶんぎ座流星群は 21 時に地平線の下', () => {
  assert.ok(C.SHOWERS.perseids.radiant[1] > 90 - Y.TOKYO.lat);
  assert.ok(cond(big.find(m => m.shower === 'quadrantids')).radiantAt21 < 0);
});

test('ページに計算どおりの月齢と放射点の高さが入っている（生成し直し忘れの検出）', () => {
  for (const m of big) {
    const y = cond(m), html = fs.readFileSync(path.join(ROOT, `calendar/${C.SHOWERS[m.shower].page}.html`), 'utf8');
    assert.ok(html.includes(`月齢は${y.age.toFixed(1)}`), `${m.shower} ${m.peak} 月齢`);
    assert.ok(html.includes(`高さ約${Math.round(y.radiant.alt)}°`), `${m.shower} ${m.peak} 放射点`);
  }
});

test('英語版の流星群ページは変えていない（日本語だけ足した）', () => {
  for (const id of ['perseids', 'geminids', 'quadrantids']) {
    const html = fs.readFileSync(path.join(ROOT, `en/calendar/${id}.html`), 'utf8');
    assert.ok(!html.includes('月齢'), id);
  }
});
