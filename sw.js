/**
 * ほしぞらさんぽ - sw.js（Service Worker）
 * キャンプ場や山など電波のない場所でも使えるように、アプリのファイルをブラウザにキャッシュする。
 *
 * - 方針はネットワーク優先: オンラインなら常に最新を取得してキャッシュも更新し、
 *   オフライン（または応答が遅い）ときだけキャッシュを返す。更新のたびに版を上げる必要はない。
 * - yorozu-craft.com の各ツールは同じオリジンでキャッシュ領域を共有するため、
 *   キャッシュ名には必ず "hoshizora-sanpo-" を付け、ほかのツールのキャッシュには触れない。
 * - 広告・アクセス解析など別オリジンへのリクエストは横取りしない。
 */

'use strict';

const CACHE_PREFIX = 'hoshizora-sanpo-';
const CACHE_NAME   = `${CACHE_PREFIX}v4`; // キャッシュする中身の構成を変えたら上げる

/** 初回インストール時に取得しておくファイル（プラネタリウム本体。図鑑は開いたページから順に保存される） */
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './astro.js',
  './data.js',
  './catalog.js',
  './text.js',
  './main.js',
  './manifest.webmanifest',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './pages.css',
  './zukan/',
  './calendar/',
  './about.html',
  // 英語版（本体と天文カレンダーの一覧。ほかの英語ページは開いたものから保存される）
  './en/',
  './en/manifest.webmanifest',
  './en/calendar/',
  // プライバシーポリシーは yorozu-craft 共通ページに移したのでキャッシュしない
];

/** この時間ネットワークが応答しなければ、キャッシュがあればそちらを返す */
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // HTTP キャッシュを経由せず、最新のファイルを取りにいく
      .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 同じオリジンでも、ほかのツールのファイルには手を出さない
  if (!url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;

  const fromNetwork = fetch(request);

  // 取得できたらキャッシュを更新する。
  // clone はページが本文を読み始める前（最初の then）に済ませる必要がある。
  event.waitUntil(
    fromNetwork
      .then((response) => {
        if (!response.ok || response.redirected) return undefined;
        const copy = response.clone();
        return caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      })
      .catch(() => undefined),
  );

  event.respondWith(networkFirst(request, fromNetwork));
});

/** ネットワーク優先。失敗・タイムアウト時はキャッシュ、それもなければネットワークの結果を待つ */
async function networkFirst(request, fromNetwork) {
  try {
    const response = await Promise.race([fromNetwork, delay(NETWORK_TIMEOUT_MS)]);
    if (response) return response;
  } catch {
    // オフライン: 下でキャッシュを探す
  }

  const cached = await matchCache(request);
  if (cached) return cached;
  return fromNetwork;
}

async function matchCache(request) {
  const cache = await caches.open(CACHE_NAME);
  if (request.mode !== 'navigate') return cache.match(request);

  // ページ遷移は ?c=ori などのクエリを無視して探し、無ければトップページ（英語のページなら英語の本体）を返す
  const inEn = new URL(request.url).pathname.startsWith(new URL('./en/', self.registration.scope).pathname);
  return (await cache.match(request, { ignoreSearch: true })) || cache.match(inEn ? './en/' : './');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms, null));
}
