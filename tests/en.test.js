'use strict';
/* 英語版（en/）の確認: 文言の抜け、名前の対応、カレンダーが日本語版と同じデータから作られていること。
   実行: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const { TEXT } = require('../text.js');
const D = require('../data.js');
const O = require('../tools/official-events.js');
const buildEn = require('../tools/calendar-pages-en.js');

test('英語の文言が日本語と同じ項目をすべて持つ', () => {
  const skip = ['kidsToast'];                                     // ひらがなモードは日本語版だけ
  for (const k of Object.keys(TEXT.ja)) if (!skip.includes(k)) assert.ok(k in TEXT.en, `TEXT.en.${k} が無い`);
});

test('名前のある星・星座・場所・天体に英語名がある', () => {
  for (const c of D.CONS) {
    assert.ok(c.en, c.jp);
    for (const s of c.ss) if (s[4]) assert.ok(D.STAR_EN[s[4].split('（')[0]], s[4]);
    assert.ok(D.SEASON_EN[c.season], c.season);
  }
  for (const s of D.LONE) { assert.ok(D.STAR_EN[s[4]], s[4]); assert.ok(D.CON_EN_EXTRA[s[6]], s[6]); }
  for (const l of D.LOCS_WORLD) { assert.ok(l && l.en && l.tz, JSON.stringify(l)); assert.ok(Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180); }
  for (const [id, b] of Object.entries(D.BODY_INFO)) assert.ok(b.en && b.adlEn && b.funEn, id);
  for (const m of D.MOON_NAMES) assert.ok(m[3], m[1]);
  for (const a of D.ASTER) assert.ok(a.en, a.name);
  for (const d of D.DSO) assert.ok(d.en, d.name);
});

test('カレンダーの注記に英語がある', () => {
  for (const r of [...O.MOON_NOTES, ...O.MOON_VIEWING, ...O.PLANET_EVENTS, ...O.ECLIPSES]) if (r.note) assert.ok(r.en, r.note);
});

test('英語のカレンダーは日本語版と同じ瞬間を載せる（書き写しをしていない）', () => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const { files } = buildEn({ esc, BASE: 'https://yorozu-craft.com/hoshizora-sanpo/', UPDATED: O.COVERAGE.from, ADSENSE: '', BEACON: '' });
  const page = name => files.find(f => f.file === `en/calendar/${name}`).html;
  for (const r of O.MOON_PHASES) {
    const iso = new Date(Date.parse(r.at)).toISOString();
    assert.ok(page(r.type === 'full' ? 'full-moon.html' : 'new-moon.html').includes(`datetime="${iso}"`), r.at);
  }
  for (const m of O.METEOR_PEAKS.filter(m => m.peak.length > 10)) {
    assert.ok(page('meteor-showers.html').includes(`datetime="${new Date(Date.parse(m.peak)).toISOString()}"`), m.peak);
  }
  for (const f of files) {
    assert.match(f.html, /<html lang="en">/, f.file);
    assert.ok(!/[ぁ-んァ-ン一-龯]/.test(f.html.replace(/<a [^>]*lang="ja"[^>]*>日本語<\/a>/g, '').replace(/<link[^>]*>/g, '')), `${f.file} に日本語が残っている`);
  }
});
