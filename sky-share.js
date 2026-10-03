/*
 * 共有される結果（yorozu-plans K124・企画書 60）: 「この空」の URL。プラネタリウム（./）と星座早見盤（hayamiban/）で同じ形
 *   #<緯度>,<経度>,<UNIX 秒>   例: #35.681,139.767,1790942640（ROADMAP 7.15.1 の 8。フル版 K132 も同じ形で読む）
 * - 一覧の都市（data.js の LOCS・LOCS_WORLD）は、その都市の緯度・経度をそのまま入れる（開いた側で都市の名前と時刻帯に戻る）
 * - それ以外（「いまいる場所」・緯度を入れた場所）は 1 度単位に丸める（約 100 km。住んでいる所が URL から分からないように）
 * - 結果の種類 = その土地の暦の月（1〜12）。着地ページ s/<月>.html と OG 画像 s/<月>.jpg が 12 ずつ
 * ブラウザでは window.SkyShare、Node（テスト）では module.exports
 */
(function (root) {
  'use strict';
  var T_MIN = 1500000000, T_MAX = 4102444800;   // 2017-07〜2100-01
  var RE = /^#(-?\d{1,2}(?:\.\d{1,3})?),(-?\d{1,3}(?:\.\d{1,3})?),(\d{10})$/;

  function r3(v) { return Math.round(v * 1000) / 1000; }
  function num(v) { return String(Number(v)); }   // 末尾の 0 を付けない

  /** 一覧の都市か（緯度・経度が 0.001 度まで同じ） */
  function findPlace(lat, lon, places) {
    return (places || []).filter(function (p) { return p && Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lon - lon) < 0.0005; })[0] || null;
  }

  /** 場所と時刻（UNIX ミリ秒）→「#…」。places は一覧の都市（ここにある都市だけ緯度・経度をそのまま入れる） */
  function encode(place, ms, places) {
    var known = findPlace(place.lat, place.lon, places);
    var lat = known ? r3(known.lat) : Math.round(place.lat), lon = known ? r3(known.lon) : Math.round(place.lon);
    var t = Math.floor(ms / 1000);
    if (!(t >= T_MIN && t <= T_MAX)) t = Math.floor(Date.now() / 1000);
    return '#' + num(lat) + ',' + num(lon) + ',' + t;
  }

  /** 「#…」→ { lat, lon, ms, place（一覧の都市なら その都市、ほかは null） }。読めない・範囲の外なら null */
  function decode(hash, places) {
    var m = RE.exec(String(hash || ''));
    if (!m) return null;
    var lat = Number(m[1]), lon = Number(m[2]), t = Number(m[3]);
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && t >= T_MIN && t <= T_MAX)) return null;
    return { lat: lat, lon: lon, ms: t * 1000, place: findPlace(lat, lon, places) };
  }

  /** 一覧に無い場所の時刻帯: 日本のあたり（北緯 20〜46°・東経 122〜154°）は日本時間、ほかは端末の時刻帯 */
  function tzFor(lat, lon, deviceTz) {
    return lat >= 20 && lat <= 46 && lon >= 122 && lon <= 154 ? 'Asia/Tokyo' : (deviceTz || 'UTC');
  }

  /** 結果の種類: その土地の暦の月（'01'〜'12'） */
  function kind(ms, tz) {
    var mo;
    try { mo = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(new Date(ms))); } catch (e) { mo = new Date(ms).getMonth() + 1; }
    return String(mo).padStart(2, '0');
  }
  var KINDS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

  var api = { encode: encode, decode: decode, tzFor: tzFor, kind: kind, KINDS: KINDS, findPlace: findPlace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SkyShare = api;
})(typeof self !== 'undefined' ? self : this);
