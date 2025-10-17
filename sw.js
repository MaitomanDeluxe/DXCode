const CACHE_NAME = 'dxcode-cache-v1';
// キャッシュ対象のファイルをリストアップ
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './main.js',
    './manifest.json',
    // Monaco EditorのCDN URLの一部 (正確なリストは開発環境で確認が必要)
    'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs/loader.js',
    // ... Monacoの依存ファイル、JSZip, FileSaver, FontAwesomeなども含める
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache).catch(err => {
                    console.error('Failed to cache some files:', err);
                });
            })
    );
});

// キャッシュ優先戦略: キャッシュから応答し、なければネットワークにフォールバック
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
