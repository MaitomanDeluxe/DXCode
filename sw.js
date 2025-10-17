const CACHE_NAME = 'dxcode-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/main.js',
    '/manifest.json',
    // Monaco Editorのコアファイルもここにリストアップする
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

// キャッシュ優先のフェッチ戦略
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response; // キャッシュがあれば返す
                }
                return fetch(event.request); // なければネットワークから取得
            })
    );
});
