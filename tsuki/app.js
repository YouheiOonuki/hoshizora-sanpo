'use strict';
/* 月の出・月の入りの画面。計算は moonrise.js（astro.js の月の位置）。場所は data.js の LOCS。
   保存はしない（共有リンクの # 以降だけ。今いる場所の緯度経度は # に入れない） */
(function () {
  const R = window.MoonRise;
  const $ = (id) => document.getElementById(id);
  const PRESET = ['sapporo', 'tokyo', 'osaka', 'fukuoka', 'naha', 'ishigaki'];
  const loc = (id) => LOCS.find((l) => l.id === id);
  const JST = 9 * 3600000;
  const WD = ['日', '月', '火', '水', '木', '金', '土'];

  const todayJst = () => { const d = new Date(Date.now() + JST); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
  const iso = (o) => o.y + '-' + String(o.m).padStart(2, '0') + '-' + String(o.d).padStart(2, '0');
  const parseIso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };

  let here = null;          // { lat, lon }（0.01° に丸めた値。保存しない）
  let view = null;          // 表に出している年月 { y, m }

  function place() {
    const v = document.querySelector('input[name=place]:checked').value;
    if (PRESET.includes(v)) { const l = loc(v); return { id: v, name: l.name, lat: l.lat, lon: l.lon }; }
    if (v === 'here') return here ? { id: 'here', name: '今いる場所', lat: here.lat, lon: here.lon } : null;
    const lat = Number($('lat').value), lon = Number($('lon').value);
    const ok = $('lat').value !== '' && $('lon').value !== '' && lat >= 20 && lat <= 46 && lon >= 122 && lon <= 154;
    return ok ? { id: 'custom', name: '北緯 ' + lat + '°・東経 ' + lon + '°', lat, lon } : null;
  }

  function cell(ev, kind) {
    if (!ev) return '--:--';
    return R.hm(ev.ms) + '<small>' + (kind === 'transit' ? Math.round(ev.alt) + '°' : R.dir16(ev.az) + ' ' + Math.round(ev.az) + '°') + '</small>';
  }

  function render() {
    $('custom').hidden = document.querySelector('input[name=place]:checked').value !== 'custom';
    const p = place();
    const day = parseIso($('date').value) || todayJst();
    if (!view || view.y !== day.y || view.m !== day.m) view = { y: day.y, m: day.m };
    writeHash(p, day);
    if (!p) {
      $('when').textContent = '場所を選ぶと出ます';
      for (const id of ['rise', 'set']) $(id).textContent = '—';
      $('transit').textContent = ''; $('age').textContent = ''; $('sky-link-p').hidden = true;
      $('tbody').innerHTML = '';
      return;
    }
    const r = R.moonDay(day.y, day.m, day.d, p.lat, p.lon);
    const wd = WD[new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay()];
    $('when').textContent = day.y + '年' + day.m + '月' + day.d + '日（' + wd + '）・' + p.name;
    const big = (ev) => ev ? R.hm(ev.ms) + ' <small>' + R.dir16(ev.az) + '（' + ev.az.toFixed(0) + '°）</small>' : '<small>この日はありません</small>';
    $('rise').innerHTML = big(r.rise);
    $('set').innerHTML = big(r.set);
    $('transit').textContent = r.transit ? '南中（真南に来る）' + R.hm(r.transit.ms) + '・高さ ' + Math.round(r.transit.alt) + '°' : '南中はこの日はありません';
    $('age').textContent = '月齢 ' + r.age.toFixed(1) + '（正午）・' + R.phaseName(r.age) + '・光っている部分 ' + Math.round(r.illum * 100) + '%';
    const linkEv = r.rise || r.transit || r.set;
    const pre = PRESET.includes(p.id);
    $('sky-link-p').hidden = !(linkEv && pre);
    if (linkEv && pre) {
      const t = new Date(linkEv.ms + JST + 10 * 60000).toISOString().slice(0, 16) + '+09:00';
      $('sky-link').href = '../?t=' + encodeURIComponent(t) + '&loc=' + p.id + '&look=moon';
    }
    renderMonth(p, day);
  }

  function renderMonth(p, day) {
    const rows = R.moonMonth(view.y, view.m, p.lat, p.lon);
    $('month-title').textContent = view.y + '年' + view.m + '月の月の出入り（' + p.name + '）';
    $('month-sum').textContent = view.y + '年' + view.m + '月の表（' + p.name + '・印刷できます）';
    const t = todayJst();
    $('tbody').innerHTML = rows.map((r) => {
      const wd = WD[new Date(Date.UTC(view.y, view.m - 1, r.d)).getUTCDay()];
      const cur = view.y === day.y && view.m === day.m && r.d === day.d;
      return '<tr' + (cur ? ' class="today"' : '') + '><td>' + r.d + '<small>' + wd + '</small></td><td>' + cell(r.rise) + '</td><td>' + cell(r.transit, 'transit') +
        '</td><td>' + cell(r.set) + '</td><td>' + r.age.toFixed(1) + '</td></tr>';
    }).join('');
    $('print-note').textContent = '北緯 ' + p.lat.toFixed(2) + '°・東経 ' + p.lon.toFixed(2) + '°・標高 0 m。時刻は日本標準時、方角は北 0° から東回り、月齢は正午。月の中心が地平線に来る時刻（大気差 35′8″）。yorozu-craft.com/hoshizora-sanpo/tsuki/ で計算（' + iso(t) + '）';
  }

  function writeHash(p, day) {
    const q = new URLSearchParams();
    const v = document.querySelector('input[name=place]:checked').value;
    q.set('p', v);
    if (v === 'custom' && p) { q.set('lat', String(p.lat)); q.set('lon', String(p.lon)); }
    if ($('date').value) q.set('d', $('date').value);
    try { history.replaceState(null, '', '#' + q.toString()); } catch (e) { /* file:// など */ }
  }

  function moveMonth(n) {
    let y = view.y, m = view.m + n;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cur = parseIso($('date').value) || todayJst();
    $('date').value = iso({ y, m, d: Math.min(cur.d, days) });
    render();
  }

  function askHere() {
    const msg = $('here-msg');
    msg.hidden = false;
    if (!navigator.geolocation) { msg.textContent = 'このブラウザは位置情報に対応していません。緯度・経度を入れてください。'; return; }
    msg.textContent = '位置情報を確かめています…（端末の中だけで使い、送信しません）';
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = Math.round(pos.coords.latitude * 100) / 100, lon = Math.round(pos.coords.longitude * 100) / 100;
      if (lat < 20 || lat > 46 || lon < 122 || lon > 154) { msg.textContent = '日本の外の場所なので計算できません（北緯 20〜46°・東経 122〜154°）。'; here = null; }
      else { here = { lat, lon }; msg.textContent = '北緯 ' + lat + '°・東経 ' + lon + '° で計算しています。'; }
      render();
    }, () => { msg.textContent = '位置情報を使えませんでした。緯度・経度を入れてください。'; render(); }, { timeout: 10000, maximumAge: 600000 });
  }

  document.querySelectorAll('input[name=place]').forEach((el) => el.addEventListener('change', () => {
    $('here-msg').hidden = true;
    if (el.value === 'here' && el.checked) askHere(); else render();
  }));
  let timer = 0;
  for (const id of ['lat', 'lon']) $(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 300); });
  $('date').addEventListener('change', render);
  $('prev').addEventListener('click', () => moveMonth(-1));
  $('next').addEventListener('click', () => moveMonth(1));
  $('print').addEventListener('click', () => window.print());
  // 印刷のときは表を開いておく（閉じた details の中は印刷されない）
  window.addEventListener('beforeprint', () => { $('month-box').open = true; });

  // 共有リンク（# 以降）
  const q = new URLSearchParams(location.hash.slice(1));
  const pv = q.get('p');
  if (pv && document.querySelector('input[name=place][value="' + CSS.escape(pv) + '"]')) {
    document.querySelector('input[name=place][value="' + CSS.escape(pv) + '"]').checked = true;
    if (pv === 'custom') { $('lat').value = q.get('lat') || ''; $('lon').value = q.get('lon') || ''; }
  }
  const qd = parseIso(q.get('d'));
  $('date').value = iso(qd || todayJst());
  if (pv === 'here') askHere(); else render();
})();
