// ===========================
// 「この端末ならフル版がおすすめ」の 1 行（オーナー決定 2026-10-03「入口は軽量版のまま、フル版を目立たせる」）
// ・出す条件はフル版（hoshizora-night）の段階判定と同じ基準: 最初の 3 秒の fps の中央値が 24 以上（render/look.js の FPS）
//   ＋ WebGL が使える（render/gate.js の webglOk と同じ: 文脈が作れて、点の大きさの上限が 2 以上）
// ・出さない: 閉じた（または開いた）ことがある・フル版から来た（referrer）・データセーバー（Save-Data）
// ・閉じたら localStorage の KEY に記録して二度と出さない。KEY は hoshizora-sanpo_ で始まり、
//   日英の画面の「保存した内容をすべて消す」（K123、data-reset-storage）で消える
// ・フル版へのリンクには、開いた URL の時刻・場所（#lat,lon,unixtime と ?t=&loc=&look= など）をそのまま渡す
// ・ブラウザでも Node（テスト）でも読める。DOM に触るのは mount だけ
// ===========================
(function (root) {
  'use strict';

  var KEY = 'hoshizora-sanpo_suggest-full';
  var FPS = { probeMs: 3000, min: 24 };            // hoshizora-night render/look.js の FPS.probeMs・FPS.min と同じ
  var FULL = '/hoshizora-night/', FULL_EN = '/hoshizora-night/en/';
  var PASS = ['t', 'loc', 'look', 'lt', 'd', 'tw', 'c'];   // フル版の openAt・focusCon が読む ?（軽量版と同じ名前）
  var HASH = /^#-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,\d{1,12}$/; // フル版 render/look.js の parseHash が読む形

  var TEXT = {
    ja: { msg: 'この端末なら、天の川や暗い星まで描くフル版がおすすめです。', link: 'フル版を開く', close: 'とじる' },
    kana: { msg: 'この たんまつ なら フルばん が おすすめ だよ。', link: 'フルばんを ひらく' },
    en: { msg: 'The full version is recommended for this device.', link: 'Open full version', close: 'Close' }
  };

  /** WebGL を作れるか（hoshizora-night render/gate.js の webglOk と同じ基準）。確かめた文脈は手放す */
  function webglOk(canvas) {
    try {
      if (!canvas || typeof canvas.getContext !== 'function') return false;
      var gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return false;
      var range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      var ok = !(range && range[1] < 2);
      var lose = gl.getExtension && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return ok;
    } catch (e) { return false; }
  }

  function median(xs) {
    if (!xs.length) return 0;
    var s = xs.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** 最初の probeMs ミリ秒のフレーム間隔を集める。tick(now) が fps の中央値を返したら測り終わり（それまでは null） */
  function probe() {
    var start = 0, last = 0, dts = [], done = false;
    return {
      tick: function (now) {
        if (done) return null;
        if (last) dts.push(now - last);
        last = now; if (!start) start = now;
        if (now - start >= FPS.probeMs && dts.length) { done = true; return 1000 / median(dts); }
        return null;
      }
    };
  }

  /** 出すか。理由の文字列を返す（'show' のときだけ出す）。webgl は関数でもよい（fps が足りたときだけ呼ぶ） */
  function decide(o) {
    if (o.dismissed) return 'dismissed';
    if (o.fromFull) return 'from-full';
    if (o.saveData) return 'save-data';
    if (!(o.fps >= FPS.min)) return 'slow';
    var gl = typeof o.webgl === 'function' ? o.webgl() : o.webgl;
    if (!gl) return 'no-webgl';
    return 'show';
  }

  /** フル版の URL。開いた URL の ?（時刻・場所・向き・星座）と #（共有の場所と時刻）だけを渡す */
  function fullUrl(en, search, hash) {
    var q = [], p = String(search || '').replace(/^\?/, '').split('&');
    for (var i = 0; i < p.length; i++) {
      var k = p[i].split('=')[0];
      if (k && PASS.indexOf(decodeURIComponent(k)) !== -1) q.push(p[i]);
    }
    var h = HASH.test(String(hash || '')) ? String(hash) : '';
    return (en ? FULL_EN : FULL) + (q.length ? '?' + q.join('&') : '') + h;
  }

  function isDismissed(storage) {
    try { return !!storage && storage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function dismiss(storage) {
    try { if (storage) storage.setItem(KEY, '1'); } catch (e) { /* 保存できない環境では、このページの間だけ消える */ }
  }

  /** 1 行を作って parent に入れる。env: { document, storage, location, en, onClose } */
  function mount(parent, env) {
    var doc = env.document, en = !!env.en;
    var box = doc.createElement('div');
    box.id = 'suggestFull';
    box.setAttribute('role', 'note');
    var msg = doc.createElement('span');
    msg.className = 'sf-msg';
    var a = doc.createElement('a');
    a.className = 'sf-link';
    if (en) {
      msg.textContent = TEXT.en.msg; a.textContent = TEXT.en.link;
    } else {
      msg.innerHTML = '<span class="ad">' + TEXT.ja.msg + '</span><span class="kd">' + TEXT.kana.msg + '</span>';
      a.innerHTML = '<span class="ad">' + TEXT.ja.link + '</span><span class="kd">' + TEXT.kana.link + '</span>';
    }
    var href = function () { return fullUrl(en, env.location.search, env.location.hash); };
    a.setAttribute('href', href());
    var x = doc.createElement('button');
    x.type = 'button';
    x.className = 'sf-close';
    x.setAttribute('aria-label', en ? TEXT.en.close : TEXT.ja.close);
    x.textContent = '✕';
    box.appendChild(msg); box.appendChild(doc.createTextNode(' ')); box.appendChild(a); box.appendChild(x);
    // 開いたら（新しいタブでも）、もう出さない。押した瞬間の URL（「いまの空にもどる」で # が消えたあと等）で送る
    a.addEventListener('click', function () { a.setAttribute('href', href()); dismiss(env.storage); });
    x.addEventListener('click', function () {
      dismiss(env.storage);
      if (box.parentNode) box.parentNode.removeChild(box);
      if (env.onClose) env.onClose();
    });
    parent.appendChild(box);
    return box;
  }

  var api = { KEY: KEY, FPS: FPS, FULL: FULL, FULL_EN: FULL_EN, PASS: PASS, TEXT: TEXT,
    webglOk: webglOk, median: median, probe: probe, decide: decide, fullUrl: fullUrl,
    isDismissed: isDismissed, dismiss: dismiss, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SuggestFull = api;
})(typeof window !== 'undefined' ? window : globalThis);
