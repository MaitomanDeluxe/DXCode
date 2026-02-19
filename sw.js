const CACHE_NAME = 'dxcode-cache-v2';
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './main.js?v=20260219', // キャッシュバスター付き
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs/loader.js',
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    'https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css'
];

self.addEventListener('install', event => {
    // 新しい SW をすぐ有効化
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache).catch(err => {
                console.warn('Some resources failed to cache during install:', err);
            }))
    );
});

self.addEventListener('activate', event => {
    // 古いキャッシュを削除してクライアントを確保
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

// メッセージで SKIP_WAITING を受け付ける（main.js からの指示で早期更新可能）
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// シンプルなフェッチ戦略：主要ページは network-first、それ以外は cache-first fallback network
self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);
    // navigation or important entry assets => network-first
    if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/main.js')) {
        event.respondWith(
            fetch(req).then(resp => {
                // 更新が来たらキャッシュに保存
                const copy = resp.clone();
                caches.open(CACHE_NAME).then(c => c.put(req, copy));
                return resp;
            }).catch(() => caches.match(req).then(r => r || caches.match('./')))
        );
        return;
    }

    // それ以外は cache-first
    event.respondWith(
        caches.match(req).then(cached => {
            if (cached) return cached;
            return fetch(req).then(resp => {
                // キャッシュに追加して返す（非同期）
                const copy = resp.clone();
                caches.open(CACHE_NAME).then(c => c.put(req, copy));
                return resp;
            }).catch(() => {});
        })
    );
});
