/**
 * 4.1 PWA Service Workerの登録
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => console.log('SW registered:', registration.scope))
            .catch(error => console.error('SW registration failed:', error));
    });
}

// -----------------------------------------------------

let monacoEditor = null;
const virtualFileSystem = new Map(); // key: ファイル名, value: Monaco Model
let activeFile = null;

const DB_NAME = 'DXCodeDB';
const STORE_NAME = 'VFS';

/**
 * 4.2 IndexedDB (永続化)
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME, { keyPath: 'fileName' });
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveProject() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        store.clear(); // 古いデータをクリア

        virtualFileSystem.forEach((model, fileName) => {
            const content = model.getValue();
            store.put({ fileName: fileName, content: content });
        });

        await new Promise(resolve => tx.oncomplete = resolve);
        console.log('Project saved to IndexedDB (Cmd+S).');
    } catch (e) {
        console.error('Save failed:', e);
    }
}

async function loadProject() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            if (request.result.length > 0) {
                request.result.forEach(item => {
                    // IndexedDBからロードしたファイルを作成
                    createFile(item.fileName, item.content, false); 
                });
                setActiveFile(virtualFileSystem.keys().next().value);
            } else {
                // データがなければ初期ファイルを作成
                createInitialFiles();
            }
        };
    } catch (e) {
        // DBアクセスエラー時は初期ファイルを作成
        createInitialFiles();
    }
}

function createInitialFiles() {
    createFile('index.html', `<!DOCTYPE html>\n<html>\n<head>\n  <title>DXCode Test</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello DXCode</h1>\n  <p>Press Cmd/Ctrl + S to save the project!</p>\n  <script src="script.js"></script>\n</body>\n</html>`, false);
    createFile('style.css', 'body {\n  background-color: #2e2e2e;\n  color: #cccccc;\n}');
    createFile('script.js', 'console.log("DXCode is ready!");');
}


/**
 * 4.3 ファイルシステムとUI操作
 */

function getLanguage(fileName) {
    const ext = fileName.split('.').pop();
    switch (ext) {
        case 'html': return 'html';
        case 'css': return 'css';
        case 'js': return 'javascript';
        case 'xml': return 'xml';
        case 'json': return 'json';
        default: return 'plaintext';
    }
}

function createFile(fileName, content = '', activate = true) {
    if (virtualFileSystem.has(fileName)) {
        console.warn(`${fileName} already exists.`);
        return;
    }

    const lang = getLanguage(fileName);
    const model = monaco.editor.createModel(content, lang);
    virtualFileSystem.set(fileName, model);
    
    // モデルに変更が加わるたびに、ファイル名を更新 (拡張子変更に対応するため)
    model.onDidChangeLanguage(() => updateUI());

    if (activate) setActiveFile(fileName);
    
    updateUI();
}

function setActiveFile(fileName) {
    if (!virtualFileSystem.has(fileName) || fileName === activeFile) return;

    activeFile = fileName;
    monacoEditor.setModel(virtualFileSystem.get(fileName));
    updateUI();
}

function updateUI() {
    const fileListEl = document.getElementById('file-list');
    const tabBarEl = document.getElementById('tab-bar');
    const previewBtn = document.getElementById('preview-btn');

    fileListEl.innerHTML = '';
    tabBarEl.innerHTML = '';

    // プレビューボタンの表示制御: HTMLファイルがアクティブな場合のみ表示
    const activeFileExt = activeFile ? activeFile.split('.').pop() : '';
    previewBtn.style.display = (activeFileExt === 'html') ? 'block' : 'none';

    virtualFileSystem.forEach((model, fileName) => {
        const isActive = fileName === activeFile;

        // ファイルリスト
        const li = document.createElement('li');
        li.textContent = fileName;
        li.className = isActive ? 'active' : '';
        li.onclick = () => setActiveFile(fileName);
        fileListEl.appendChild(li);

        // タブバー
        const tab = document.createElement('div');
        tab.textContent = fileName;
        tab.className = 'tab ' + (isActive ? 'active' : '');
        tab.onclick = () => setActiveFile(fileName);
        tabBarEl.appendChild(tab);
    });
}


/**
 * 4.4 プレビューと仮想コンソール
 */

// main.js - openPreview 関数の修正 (抜粋)

function openPreview() {
    // 1. 全てのモデルの内容を取得 (VFS内の全コードを取得)
    const codeData = {
        html: virtualFileSystem.get('index.html')?.getValue() || '<h1>index.html not found</h1>',
        css: virtualFileSystem.get('style.css')?.getValue() || '',
        js: virtualFileSystem.get('script.js')?.getValue() || '',
        fileNames: Array.from(virtualFileSystem.keys()) // コマンド用ファイルリスト
    };

    // 2. プレビューウィンドウを開く
    const previewWindow = window.open('about:blank', 'DXCode_Preview', 'width=800,height=600');
    if (!previewWindow) {
        alert('ポップアップがブロックされました。プレビューを表示できません。');
        return;
    }

    // 3. プレビューウィンドウのHTMLコンテンツを構築
    const previewContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>DXCode Preview</title>
            <style>
                /* コンソール用のスタイル (省略 - 変更なし) */
                #dxcode-console-wrapper { position: fixed; bottom: 0; left: 0; width: 100%; height: 150px; background: #222; color: #fff; z-index: 99999; display: flex; flex-direction: column; font-family: monospace; border-top: 2px solid #007acc; }
                #dxcode-console { flex-grow: 1; overflow-y: scroll; padding: 5px; }
                #dxcode-prompt { width: 100%; border: none; background: #111; color: #fff; padding: 5px; box-sizing: border-box; }
                .log-item { margin-bottom: 2px; }
                .log-error { color: #f44; } .log-warn { color: #ff0; } .log-info { color: #88f; }
                body { margin-bottom: 150px; } /* コンソール分のスペース確保 */
                
                /* **【★追加】閉じるボタンのスタイル** */
                #close-btn {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    line-height: 30px;
                    text-align: center;
                    font-size: 18px;
                    cursor: pointer;
                    z-index: 100000;
                }
            </style>
            <script>
                // VFSファイル名をグローバル変数としてセット
                const VFS_FILE_NAMES = ${JSON.stringify(codeData.fileNames)};
                
                // 仮想コンソールロガーとコマンドロジックを定義 (省略 - 変更なし)
                // ...
                
                // 仮想ログ関数 (省略 - 変更なし)
                function virtualLog(type, args) { /* ... */ }

                // ログキャプチャ: ユーザーコード実行前に上書き (省略 - 変更なし)
                // ...

                // コマンド実行ロジック (省略 - 変更なし)
                // ...
                
                // 【★追加】閉じるボタンの機能
                function setupCloseButton() {
                    const closeBtn = document.createElement('button');
                    closeBtn.id = 'close-btn';
                    closeBtn.innerHTML = '&times;'; // '×'
                    closeBtn.onclick = function() {
                        // ウィンドウを閉じる
                        window.close();
                    };
                    document.body.appendChild(closeBtn);
                }
                
                // ユーザーコード実行ロジック
                window.onload = function() {
                    // 【★追加】ボタンをセットアップ
                    setupCloseButton(); 
                
                    // コンソールのセットアップ (前回ロジックから移植)
                    const consoleEl = document.getElementById('dxcode-console');
                    const promptEl = document.getElementById('dxcode-prompt');
                    // ... (コンソール関連のDOM生成とイベント設定) ...
                    
                    // ユーザーコード実行
                    const jsCode = document.getElementById('user-script').textContent;
                    try {
                        eval(jsCode); 
                    } catch(e) {
                        console.error('Uncaught Error in user script:', e);
                    }
                };
            </script>
        </head>
        <body>
            ${codeData.html.replace(/<link[^>]*href=["']style\.css["'][^>]*>/i, `<style>${codeData.css}</style>`)}
            
            <script id="user-script" type="text/plain">${codeData.js}</script> 
            
            <div id="dxcode-console-wrapper">
                <div id="dxcode-console"></div>
                <input type="text" id="dxcode-prompt" placeholder="Enter command (ls, whoami, clear)...">
            </div>
        </body>
        </html>
    `;

    // 4. コンテンツを新しいウィンドウに書き込み、実行
    previewWindow.document.write(previewContent);
    previewWindow.document.close();
}

/**
 * 4.5 ZIPダウンロード機能
 */
document.getElementById('download-zip-btn').addEventListener('click', () => {
    if (virtualFileSystem.size === 0) {
        alert('プロジェクトが空です。');
        return;
    }

    const zip = new JSZip();
    virtualFileSystem.forEach((model, fileName) => {
        const content = model.getValue();
        zip.file(fileName, content);
    });

    zip.generateAsync({ type: "blob" })
        .then(content => {
            saveAs(content, "DXCode_Project.zip");
        })
        .catch(err => {
            console.error("ZIP生成エラー:", err);
            alert("ZIPファイルの生成に失敗しました。");
        });
});


/**
 * 4.6 Monaco Editorの初期化と起動
 */
require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
    monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
    });
    
    // IndexedDBからプロジェクトをロード (存在しない場合は初期ファイルを作成)
    loadProject();

    // イベントリスナー設定
    document.getElementById('new-file-btn').addEventListener('click', () => {
        const fileName = prompt("新しいファイル名を入力してください (例: component.js):");
        if (fileName) {
            createFile(fileName.trim());
        }
    });

    document.getElementById('preview-btn').addEventListener('click', openPreview);

    // キーボードショートカット (Cmd/Ctrl + S で保存)
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveProject();
        return null; // ブラウザのデフォルト保存をキャンセル
    }, 'EditorTextFocus'); 

    // キーボードショートカット (Cmd/Ctrl + N で新規ファイル)
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => {
        document.getElementById('new-file-btn').click();
    });
});
