'use strict';
/* 星座早見盤の英語版（en/planisphere/）の画面。盤面は hayamiban/planisphere.js（Hayamiban、lang: 'en'）が作る。
   日本語版（hayamiban/app.js）との違い: 場所は LOCS_WORLD の 4 都市か緯度・経度・UTC との差、北緯・南緯、紙は A4 と US Letter、時刻は 12/24 時間制 */
(function () {
  const H = window.Hayamiban;
  const $ = id => document.getElementById(id);
  const KEY = 'hoshizora-sanpo_planisphere-en';      // README「ツールを追加するとき」12: <リポジトリ名>_
  const IDS = H.EN_PRESETS.map(p => p.id);
  const pad = n => String(n).padStart(2, '0');
  const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /** UTC との差の選択肢: 30 分きざみと、45 分の 3 つ（ネパール・チャタム諸島・オーストラリア中西部） */
  const TZS = [];
  for (let t = H.TZ_MIN; t <= H.TZ_MAX; t += 0.5) TZS.push(t);
  TZS.push(5.75, 8.75, 12.75); TZS.sort((a, b) => a - b);

  /* ---------------- 既定（端末の設定から推す。保存があればそちらを使う） ---------------- */
  /** 端末の標準時の UTC との差（1 月と 7 月の小さい方＝夏時間を除く） */
  function deviceStdTz() {
    const y = new Date().getFullYear();
    const a = -new Date(y, 0, 15).getTimezoneOffset() / 60, b = -new Date(y, 6, 15).getTimezoneOffset() / 60;
    const t = Math.min(a, b);
    return TZS.includes(t) ? t : 0;
  }
  function guess() {
    let zone = '', region = '', h12 = true;
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* 古いブラウザ */ }
    try { region = (new Intl.Locale(navigator.language)).maximize().region || ''; } catch (e) { region = (navigator.language || '').split('-')[1] || ''; }
    try { h12 = new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions().hour12 !== false; } catch (e) { /* 12 時間制のまま */ }
    const letter = ['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'CR', 'PA', 'DO', 'PR'].includes(region.toUpperCase());
    const byZone = H.EN_PRESETS.find(p => p.zone === zone);
    return { place: byZone ? byZone.id : letter ? 'new-york' : 'london', paper: letter ? 'letter' : 'a4', clock: h12 ? 12 : 24 };
  }

  /* ---------------- 設定（保存は try/catch。無くても動く） ---------------- */
  function normalize(o) {
    const g = guess();
    const s = { place: g.place, lat: '', lon: '', tz: deviceStdTz(), paper: g.paper, layout: 'two', mag: 4.5, clock: g.clock, credit: true };
    if (!o || typeof o !== 'object') return s;
    if ([...IDS, 'custom'].includes(o.place)) s.place = o.place;
    const num = (v, ok) => { const n = Number(v); return v !== '' && v != null && isFinite(n) && ok(n) ? n : ''; };
    s.lat = num(o.lat, n => Math.abs(n) >= H.EN_LAT_MIN && Math.abs(n) <= H.EN_LAT_MAX);
    s.lon = num(o.lon, n => n >= -180 && n <= 180);
    if (TZS.includes(Number(o.tz))) s.tz = Number(o.tz);
    if (o.paper === 'a4' || o.paper === 'letter') s.paper = o.paper;
    if (o.layout === 'one') s.layout = 'one';
    if (Number(o.mag) === 5) s.mag = 5;
    if (Number(o.clock) === 12 || Number(o.clock) === 24) s.clock = Number(o.clock);
    if (o.credit === false) s.credit = false;
    return s;
  }
  function load() { try { return normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return normalize(null); } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 保存できない環境 */ } }
  let st = load();

  /** いまの場所（緯度が無ければ null）。経度が空なら時刻帯の子午線（経度の補正なし） */
  function place() {
    if (st.place !== 'custom') { const p = H.EN_PRESETS.find(x => x.id === st.place); return { lat: p.lat, lon: p.lon, tz: p.tz, name: p.en, id: p.id }; }
    if (st.lat === '') return null;
    return { lat: st.lat, lon: st.lon === '' ? st.tz * 15 : st.lon, tz: st.tz, name: '', id: '' };
  }
  const deg = (v, pos, neg) => `${Math.round(Math.abs(v) * 10) / 10}° ${v < 0 ? neg : pos}`;

  /* ---------------- 見本（組み立てた盤を、その日時に回す） ---------------- */
  /** 見本の最初の日時: その場所の標準時で夜（18〜5 時）ならいま、ほかは今日の 21 時 */
  function defaultWhen(tz) {
    const now = Date.now(), p = H.jstParts(now, tz);
    if (p.h >= 18 || p.h < 5) return now;
    return Date.UTC(p.y, p.mo - 1, p.d) + (21 - tz) * 3600000;
  }
  function whenMs(tz) {
    const d = $('pv-date').value, t = $('pv-time').value;
    if (/^\d{4}-\d\d-\d\d$/.test(d) && /^\d\d:\d\d/.test(t)) {
      const ms = Date.parse(`${d}T${t.slice(0, 5)}:00Z`) - tz * 3600000;
      if (isFinite(ms)) return ms;
    }
    return defaultWhen(tz);
  }
  const hm = (h, clock) => {
    const H24 = Math.floor(h), mi = Math.round((h % 1) * 60) % 60;
    return clock === 12 ? `${H24 % 12 || 12}:${pad(mi)} ${H24 < 12 ? 'AM' : 'PM'}` : `${pad(H24)}:${pad(mi)}`;
  };
  const tzIso = tz => `${tz < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(tz)))}:${pad(Math.round((Math.abs(tz) % 1) * 60))}`;

  let urls = [], lastTz = null;
  function render() {
    const P = place();
    const bad = st.place === 'custom' && !P;
    $('custom').hidden = st.place !== 'custom';
    $('print').disabled = bad; $('fixbar-print').disabled = bad;
    const far = P && st.place === 'custom' && st.lon !== '' && Math.abs(((st.lon - st.tz * 15 + 540) % 360) - 180) > 30;
    $('custom-msg').textContent = bad ? `Enter a latitude from ${H.EN_LAT_MIN} to ${H.EN_LAT_MAX}, or −${H.EN_LAT_MIN} to −${H.EN_LAT_MAX} for the south.`
      : far ? 'Check the UTC offset: it is far from this longitude.'
        : 'South and west are negative. Use standard time, not daylight saving time. Leave longitude empty to skip the longitude correction.';
    $('more-state').textContent = `stars to ${st.mag}, ${st.clock}-hour, ${st.credit ? 'credit on' : 'no credit'}`;
    // 印刷の紙の大きさ
    const pp = H.PAPER[st.paper];
    $('paper-css').textContent = st.paper === 'letter'
      ? `@page{size:letter portrait;margin:0;}@media print{#print-sheets .sheet,#print-sheets svg{width:${pp.w}mm !important;height:${pp.h}mm !important;}}`
      : '@page{size:A4 portrait;margin:0;}';
    if (bad) { $('pv-sky').innerHTML = ''; $('pv-caption').textContent = 'Enter a latitude to see your planisphere here.'; $('print-sheets').innerHTML = ''; $('sheets-pv').innerHTML = ''; $('svg-links').innerHTML = ''; return; }
    const who = P.name || deg(P.lat, 'N', 'S');
    $('fixbar-place').textContent = `Planisphere for ${who}`;
    const m = H.model({ lat: P.lat, lon: P.lon, tz: P.tz, magLimit: st.mag, lang: 'en', clock: st.clock });
    // 場所（時刻帯）が変わったら、見本の日時をその場所の今夜に戻す
    if (lastTz !== P.tz) { $('pv-date').value = ''; $('pv-time').value = ''; lastTz = P.tz; }
    const ms = whenMs(P.tz), psi = H.rotationFor(m, ms);
    const p = H.jstParts(ms, P.tz), n = H.nightOf(ms, P.tz);
    const text = `${MONTH_LONG[p.mo - 1]} ${p.d}, ${hm(p.h, st.clock)}`;
    $('pv-sky').innerHTML = `<svg viewBox="-97 -97 194 194" xmlns="http://www.w3.org/2000/svg" font-family='"Helvetica Neue",Helvetica,Arial,sans-serif'>` +
      `<g>${H.diskSvg(m, { rot: psi })}</g><g>${H.maskSvg(m, { mode: 'view' })}</g></svg>`;
    $('pv-caption').textContent = `Sky over ${who}, ${text} (${H.tzEn(P.tz)})` +
      (p.h < 12 ? `. After midnight, set the evening’s date: ${MONTH_LONG[n.mo - 1]} ${n.d}.` : '');
    $('turn-state').textContent = text;
    const d = new Date(ms + P.tz * 3600000);
    if (!$('pv-date').value) $('pv-date').value = d.toISOString().slice(0, 10);
    if (!$('pv-time').value) $('pv-time').value = d.toISOString().slice(11, 16);
    const link = $('pv-link');
    if (P.id) { link.href = `../?t=${encodeURIComponent(`${$('pv-date').value}T${$('pv-time').value}:00${tzIso(P.tz)}`)}&loc=${P.id}&look=az:${P.lat < 0 ? 0 : 180}`; link.hidden = false; }
    else link.hidden = true;
    // 印刷する紙
    const sheets = H.sheets({ lang: 'en', lat: P.lat, lon: P.lon, tz: P.tz, magLimit: st.mag, layout: st.layout, paper: st.paper, place: P.name, credit: st.credit, clock: st.clock });
    $('print-sheets').innerHTML = sheets.map(s => `<div class="sheet">${s}</div>`).join('');
    $('sheets-pv').innerHTML = sheets.join('');
    const base = `planisphere-${P.id || (P.lat < 0 ? 's' : 'n') + Math.abs(P.lat)}-${st.paper}`;
    urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
    $('svg-links').innerHTML = sheets.map((s, i) => {
      const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' })); urls.push(url);
      return `<a href="${url}" download="${base}-${sheets.length > 1 ? (i ? 'window' : 'star-wheel') : 'one-sheet'}.svg">${sheets.length > 1 ? (i ? 'Window' : 'Star wheel') : 'One sheet'}</a>`;
    }).join('');
  }

  /* ---------------- 入力 ---------------- */
  $('tz').innerHTML = TZS.map(t => `<option value="${t}">${H.tzEn(t)}</option>`).join('');
  function sync() {
    document.querySelector(`input[name=place][value=${st.place}]`).checked = true;
    document.querySelector(`input[name=paper][value=${st.paper}]`).checked = true;
    document.querySelector(`input[name=layout][value=${st.layout}]`).checked = true;
    document.querySelector(`input[name=mag][value="${st.mag === 5 ? '5' : '4.5'}"]`).checked = true;
    document.querySelector(`input[name=clock][value="${st.clock}"]`).checked = true;
    $('lat').value = st.lat; $('lon').value = st.lon; $('tz').value = String(st.tz); $('credit').checked = st.credit;
  }
  const val = name => document.querySelector(`input[name=${name}]:checked`).value;
  function onInput() {
    st = normalize({ place: val('place'), lat: $('lat').value, lon: $('lon').value, tz: $('tz').value, paper: val('paper'),
      layout: val('layout'), mag: val('mag'), clock: val('clock'), credit: $('credit').checked });
    $('lat').classList.toggle('bad', $('lat').value !== '' && st.lat === '');
    $('lon').classList.toggle('bad', $('lon').value !== '' && st.lon === '');
    save(st); render();
  }
  let timer = 0;
  document.querySelectorAll('input[name=place],input[name=paper],input[name=layout],input[name=mag],input[name=clock],#credit,#tz')
    .forEach(e => e.addEventListener('change', onInput));
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
