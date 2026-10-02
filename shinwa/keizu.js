/* ギリシャ神話の系図: 押した神・人を真ん中に、上に親、下に子（相手ごと）を出す。URL の #p-<id> で開く
   データはページに埋めた JSON（tools/shinwa-pages.js が tools/shinwa-data.js から作る）。保存するものは無い */
(function () {
  'use strict';
  var el = document.getElementById('kz-data'), box = document.getElementById('keizu-result');
  if (!el || !box) return;
  var D = JSON.parse(el.textContent), P = D.people;
  var parentOf = {}, kids = {}, spouses = {};
  D.parents.forEach(function (r) {
    parentOf[r[0]] = r;
    [r[1], r[2]].forEach(function (p) { if (p) (kids[p] = kids[p] || []).push(r[0]); });
  });
  function addSp(a, b) { (spouses[a] = spouses[a] || []); if (spouses[a].indexOf(b) < 0) spouses[a].push(b); }
  D.spouses.forEach(function (s) { addSp(s[0], s[1]); addSp(s[1], s[0]); });
  var trail = [];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function btn(id, cls) {
    return '<a class="kz-p' + (cls ? ' ' + cls : '') + '" href="#p-' + id + '" data-id="' + id + '">' + esc(P[id][0]) + '</a>';
  }
  function render(id) {
    if (!P[id]) id = 'zeus';
    var i = trail.indexOf(id); if (i >= 0) trail = trail.slice(0, i); trail.push(id); if (trail.length > 8) trail = trail.slice(-8);
    var r = parentOf[id], h = '';
    // 親
    h += '<div class="kz-row kz-up"><span class="kz-lab">親</span>';
    var ps = r ? [r[1], r[2]].filter(Boolean) : [];
    h += ps.length ? ps.map(function (p) { return btn(p); }).join('<span class="kz-amp">と</span>') : '<span class="kz-none">この系図には親を入れていない</span>';
    h += '</div>';
    // 本人
    var p = P[id];
    h += '<div class="kz-me"><b>' + esc(p[0]) + '</b><small lang="en">' + esc(p[1]) + '</small>' + (p[2] ? '<span>' + esc(p[2]) + '</span>' : '');
    if (r) h += '<span class="kz-src">' + esc(r[3]) + (r[4] ? '。' + esc(r[4]) : '') + '</span>';
    h += '</div>';
    // きょうだい（同じ親をもつ）
    if (r) {
      var sib = D.parents.filter(function (q) { return q[0] !== id && q[1] === r[1] && q[2] === r[2]; }).map(function (q) { return q[0]; });
      if (sib.length) h += '<div class="kz-row"><span class="kz-lab">きょうだい</span>' + sib.map(function (s) { return btn(s, 'kz-sib'); }).join('') + '</div>';
    }
    // 子（相手ごと）
    var ks = kids[id] || [], byPartner = {}, order = [];
    ks.forEach(function (k) {
      var q = parentOf[k], other = q[1] === id ? q[2] : q[1], key = other || '';
      if (!byPartner[key]) { byPartner[key] = []; order.push(key); }
      byPartner[key].push(k);
    });
    (spouses[id] || []).forEach(function (s) { if (order.indexOf(s) < 0) { order.push(s); byPartner[s] = []; } });
    if (order.length) {
      h += '<div class="kz-down">';
      order.forEach(function (key) {
        h += '<div class="kz-row"><span class="kz-lab">' + (key ? btn(key, 'kz-mate') + ' との' : 'ひとりで生んだ') + (byPartner[key].length ? '子' : '（夫婦）') + '</span>'
          + byPartner[key].map(function (k) { return btn(k); }).join('') + '</div>';
      });
      h += '</div>';
    } else h += '<div class="kz-row"><span class="kz-lab">子</span><span class="kz-none">この系図には入れていない</span></div>';
    if (trail.length > 1) h += '<p class="kz-trail">たどった順: ' + trail.map(function (t) { return t === id ? '<b>' + esc(P[t][0]) + '</b>' : btn(t, 'kz-t'); }).join(' → ') + '</p>';
    box.innerHTML = h;
    var pick = document.getElementById('kz-pick'); if (pick) pick.value = id;
  }
  function fromHash() { var m = /^#p-([a-z]+)$/.exec(location.hash); return m ? m[1] : 'zeus'; }
  box.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-id]'); if (!a) return;
    e.preventDefault(); history.replaceState(null, '', '#p-' + a.dataset.id); render(a.dataset.id);
    box.scrollIntoView({ block: 'nearest' });
  });
  var pick = document.getElementById('kz-pick');
  if (pick) pick.addEventListener('change', function () { if (pick.value) { history.replaceState(null, '', '#p-' + pick.value); render(pick.value); } });
  // 下の一覧の名前を押したときも、上の図で開く
  document.querySelectorAll('.kz-table a[href^="#p-"]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); var id = a.getAttribute('href').slice(3); history.replaceState(null, '', '#p-' + id); render(id); box.scrollIntoView({ block: 'start' }); });
  });
  window.addEventListener('hashchange', function () { render(fromHash()); });
  var start = fromHash();
  render(start);
  // #p-<id> で来たときは、一覧の行ではなく上の図を見せる
  if (location.hash) setTimeout(function () { box.scrollIntoView({ block: 'start' }); }, 0);
})();
