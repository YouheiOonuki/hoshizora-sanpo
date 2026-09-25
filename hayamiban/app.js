'use strict';
/* 星座早見盤（hayamiban/）の画面。盤面は planisphere.js（Hayamiban）が作る */
(function () {
  const H = window.Hayamiban;
  const $ = id => document.getElementById(id);
  const KEY = 'hoshizora-sanpo_hayamiban';          // README「ツールを追加するとき」12: <リポジトリ名>_
  const PLACE_NAMES = { sapporo: '札幌', tokyo: '東京', naha: '那覇' };
  const pad = n => String(n).padStart(2, '0');

  /* ---------------- 設定（保存は try/catch。無くても動く） ---------------- */
  function normalize(o) {
    const s = { place: 'tokyo', lat: '', lon: '', layout: 'two', mag: 4.5, credit: true };
    if (!o || typeof o !== 'object') return s;
    if (['sapporo', 'tokyo', 'naha', 'custom'].includes(o.place)) s.place = o.place;
    const num = (v, lo, hi) => { const n = Number(v); return v !== '' && v != null && isFinite(n) && n >= lo && n <= hi ? n : ''; };
    s.lat = num(o.lat, H.LAT_MIN, H.LAT_MAX); s.lon = num(o.lon, H.LON_MIN, H.LON_MAX);
    if (o.layout === 'one') s.layout = 'one';
    if (Number(o.mag) === 5) s.mag = 5;
    if (o.credit === false) s.credit = false;
    return s;
  }
  function load() { try { return normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return normalize(null); } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 保存できない環境 */ } }
  let st = load();

  /** いまの場所（緯度・経度が揃わなければ null） */
  function place() {
    if (st.place !== 'custom') { const l = H.PRESETS.find(p => p.id === st.place); return { lat: l.lat, lon: l.lon, name: l.name, id: l.id }; }
    if (st.lat === '') return null;
    return { lat: st.lat, lon: st.lon === '' ? 135 : st.lon, name: '', id: '' };
  }

  /* ---------------- 見本（組み立てた盤を、その日時に回す） ---------------- */
  /** 見本の最初の日時: 日本時間で夜（18〜5 時）ならいま、ほかは今日の 21 時 */
  function defaultWhen() {
    const now = Date.now(), p = H.jstParts(now);
    if (p.h >= 18 || p.h < 5) return new Date(now);
    return new Date(Date.UTC(p.y, p.mo - 1, p.d, 21 - 9));
  }
  let when = defaultWhen();
  function whenMs() {
    const d = $('pv-date').value, t = $('pv-time').value;
    if (/^\d{4}-\d\d-\d\d$/.test(d) && /^\d\d:\d\d/.test(t)) { const ms = Date.parse(`${d}T${t.slice(0, 5)}:00+09:00`); if (isFinite(ms)) return ms; }
    return when.getTime();
  }
  function jstLabel(ms) {
    const p = H.jstParts(ms), n = H.nightOf(ms);
    const hm = `${Math.floor(p.h)}:${pad(Math.round((p.h % 1) * 60) % 60)}`;
    return { text: `${p.mo}月${p.d}日 ${hm}`, night: `${n.mo}月${n.d}日`, after: p.h < 12 };
  }

  let urls = [];
  function render() {
    const P = place();
    const bad = st.place === 'custom' && !P;
    $('custom').hidden = st.place !== 'custom';
    $('print').disabled = bad; $('fixbar-print').disabled = bad;
    $('custom-msg').textContent = bad ? `北緯を ${H.LAT_MIN}〜${H.LAT_MAX} の数で入れてください（東経は空なら 135）。`
      : 'Google マップで場所を長押しすると出る 2 つの数字の、前が北緯・後が東経です。';
    $('more-state').textContent = `星 ${st.mag} 等まで・${st.credit ? 'クレジットあり' : 'クレジットなし'}`;
    if (bad) { $('pv-sky').innerHTML = ''; $('pv-caption').textContent = '北緯を入れると、ここに盤が出ます。'; $('print-sheets').innerHTML = ''; $('sheets-pv').innerHTML = ''; return; }
    const who = P.name || `北緯 ${P.lat}°`;
    $('fixbar-place').textContent = `${who}の星座早見盤`;
    const m = H.model({ lat: P.lat, lon: P.lon, magLimit: st.mag });
    // 見本
    const ms = whenMs(), psi = H.rotationFor(m, ms), L = jstLabel(ms);
    $('pv-sky').innerHTML = `<svg viewBox="-97 -97 194 194" xmlns="http://www.w3.org/2000/svg" font-family='"Noto Sans JP","Hiragino Sans",Meiryo,sans-serif'>` +
      `<g>${H.diskSvg(m, { rot: psi })}</g><g>${H.maskSvg(m, { mode: 'view' })}</g></svg>`;
    $('pv-caption').textContent = `${who}・${L.text} の空（${L.after ? `日付は前の夜の ${L.night} に合わせる` : `日付 ${L.night} を ${L.text.split(' ')[1]} に合わせた形`}）`;
    $('turn-state').textContent = L.text;
    const d = new Date(ms + 9 * 3600000);
    if (!$('pv-date').value) $('pv-date').value = d.toISOString().slice(0, 10);
    if (!$('pv-time').value) $('pv-time').value = d.toISOString().slice(11, 16);
    const link = $('pv-link');
    if (P.id) { link.href = `../?t=${encodeURIComponent(`${$('pv-date').value}T${$('pv-time').value}+09:00`)}&loc=${P.id}&look=az:180`; link.parentElement.hidden = false; }
    else link.parentElement.hidden = true;
    // 印刷する紙
    const sheets = H.sheets({ lat: P.lat, lon: P.lon, magLimit: st.mag, layout: st.layout, place: P.name, credit: st.credit });
    $('print-sheets').innerHTML = sheets.map(s => `<div class="sheet">${s}</div>`).join('');
    $('sheets-pv').innerHTML = sheets.join('');
    const base = `hayamiban-${P.id || `n${P.lat}`}`;
    urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
    $('svg-links').innerHTML = sheets.map((s, i) => {
      const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' })); urls.push(url);
      return `<a href="${url}" download="${base}-${sheets.length > 1 ? (i ? 'ue' : 'shita') : 'a4'}.svg">${sheets.length > 1 ? (i ? '上の盤' : '下の盤') : '1 枚'}</a>`;
    }).join('');
  }

  /* ---------------- 入力 ---------------- */
  function sync() {
    document.querySelector(`input[name=place][value=${st.place}]`).checked = true;
    document.querySelector(`input[name=layout][value=${st.layout}]`).checked = true;
    document.querySelector(`input[name=mag][value="${st.mag === 5 ? '5' : '4.5'}"]`).checked = true;
    $('lat').value = st.lat; $('lon').value = st.lon; $('credit').checked = st.credit;
  }
  function onInput() {
    st = normalize({
      place: document.querySelector('input[name=place]:checked').value,
      lat: $('lat').value, lon: $('lon').value,
      layout: document.querySelector('input[name=layout]:checked').value,
      mag: document.querySelector('input[name=mag]:checked').value,
      credit: $('credit').checked,
    });
    $('lat').classList.toggle('bad', $('lat').value !== '' && st.lat === '');
    $('lon').classList.toggle('bad', $('lon').value !== '' && st.lon === '');
    save(st); render();
  }
  let timer = 0;
  document.querySelectorAll('input[name=place],input[name=layout],input[name=mag],#credit').forEach(e => e.addEventListener('change', onInput));
  ['lat', 'lon'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(onInput, 300); }));
  ['pv-date', 'pv-time'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 150); }));
  const doPrint = () => { if (!$('print').disabled) window.print(); };
  $('print').addEventListener('click', doPrint);
  $('fixbar-print').addEventListener('click', doPrint);

  /* 固定バー: 印刷ボタンが画面の外にあるときだけ */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { $('fixbar').hidden = es[0].isIntersecting || es[0].boundingClientRect.top > 0; })
      .observe($('print-row'));
  }

  sync(); render();
})();
