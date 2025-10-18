/**
 * DXCode v1.0 - Full JavaScript Logic
 * Features: Monaco Editor, VFS, IndexedDB Persistence (Cmd+S), VSCode UI Integration, Preview with Virtual Console.
 */

// -----------------------------------------------------
// 1. グローバル変数とPWA Service Worker
// -----------------------------------------------------

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => console.log('SW registered:', registration.scope))
            .catch(error => console.error('SW registration failed:', error));
    });
}

let monacoEditor = null;
const virtualFileSystem = new Map(); // key: ファイル名, value: Monaco Model
let activeFile = null;

const DB_NAME = 'DXCodeDB';
const STORE_NAME = 'VFS';

// -----------------------------------------------------
// 2. IndexedDB (永続化)
// -----------------------------------------------------

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

        store.clear();

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
                    createFile(item.fileName, item.content, false); 
                });
                // ロード後に最初のファイルをアクティブにする
                setActiveFile(virtualFileSystem.keys().next().value);
            } else {
                createInitialFiles();
            }
        };
    } catch (e) {
        createInitialFiles();
    }
}

function createInitialFiles() {
    // 初期ファイルを自動でアクティブ化
    createFile('index.html', `<!DOCTYPE html>\n<html>\n<head>\n  <title>DXCode Test</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello DXCode</h1>\n  <p>Press Cmd/Ctrl + S to save the project!</p>\n  <script src="script.js"></script>\n</body>\n</html>`, true);
    createFile('style.css', 'body {\n  background-color: #2e2e2e;\n  color: #cccccc;\n}');
    createFile('script.js', 'console.log("DXCode is ready!");');
}


// -----------------------------------------------------
// 3. ファイルシステムとUI操作
// -----------------------------------------------------

function getLanguage(fileName) {
    const ext = fileName.split('.').pop();
    switch (ext) {
        case 'html': return 'html';
        case 'css': return 'css';
        case 'js': return 'javascript';
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
    
    // モデルに言語変更イベントリスナーをセット
    model.onDidChangeLanguage(() => updateUI());

    if (activate) setActiveFile(fileName);
    
    updateUI();
}

function setActiveFile(fileName) {
    if (!virtualFileSystem.has(fileName) || fileName === activeFile) return;

    activeFile = fileName;
    const model = virtualFileSystem.get(fileName);
    
    // Monaco Editorのモデルを切り替え
    monacoEditor.setModel(model);
    
    // 言語モードをMonacoに伝える (ファイル拡張子が変わる可能性を考慮)
    monaco.editor.setModelLanguage(model, getLanguage(fileName));
    
    updateUI();
}

function updateUI() {
    const fileListEl = document.getElementById('file-list');
    const tabBarEl = document.getElementById('tab-bar');
    const previewBtn = document.getElementById('preview-btn');
    const statusFileInfoEl = document.getElementById('status-file-info');

    fileListEl.innerHTML = '';
    tabBarEl.innerHTML = '';

    const activeFileExt = activeFile ? activeFile.split('.').pop() : '';
    
    // プレビューボタンの表示制御
    previewBtn.style.display = (activeFileExt === 'html') ? 'block' : 'none';

    // ステータスバーのファイル情報更新
    statusFileInfoEl.textContent = `${activeFileExt.toUpperCase()} | UTF-8 | CRLF`;

    virtualFileSystem.forEach((model, fileName) => {
        const isActive = fileName === activeFile;

        // ファイルリスト (エクスプローラー)
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


// -----------------------------------------------------
// 4. プレビューと仮想コンソール
// -----------------------------------------------------

function openPreview() {
    const codeData = {
        html: virtualFileSystem.get('index.html')?.getValue() || '<h1>index.html not found</h1>',
        css: virtualFileSystem.get('style.css')?.getValue() || '',
        js: virtualFileSystem.get('script.js')?.getValue() || '',
        fileNames: Array.from(virtualFileSystem.keys()) // コマンド用ファイルリスト
    };

    const previewWindow = window.open('about:blank', 'DXCode_Preview', 'width=800,height=600');
    if (!previewWindow) {
        alert('ポップアップがブロックされました。プレビューを表示できません。');
        return;
    }

    // プレビューウィンドウのHTMLコンテンツを構築
    const previewContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>DXCode Preview</title>
            <style>
                /* コンソール用のスタイル */
                #dxcode-console-wrapper { position: fixed; bottom: 0; left: 0; width: 100%; height: 150px; background: #222; color: #fff; z-index: 99999; display: flex; flex-direction: column; font-family: monospace; border-top: 2px solid #007acc; }
                #dxcode-console { flex-grow: 1; overflow-y: scroll; padding: 5px; }
                #dxcode-prompt { width: 100%; border: none; background: #111; color: #fff; padding: 5px; box-sizing: border-box; }
                .log-item { margin-bottom: 2px; }
                .log-error { color: #f44; } .log-warn { color: #ff0; } .log-info { color: #88f; }
                body { margin-bottom: 150px; } /* コンソール分のスペース確保 */
                
                /* 閉じるボタンのスタイル */
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
                
                // DOM要素
                const consoleEl = document.createElement('div');
                consoleEl.id = 'dxcode-console';
                const promptEl = document.createElement('input');
                promptEl.id = 'dxcode-prompt';
                promptEl.type = 'text';
                promptEl.placeholder = 'Enter command (ls, whoami, clear)...';

                const wrapper = document.createElement('div');
                wrapper.id = 'dxcode-console-wrapper';
                wrapper.appendChild(consoleEl);
                wrapper.appendChild(promptEl);
                
                // 仮想ログ関数
                function virtualLog(type, args) {
                    const item = document.createElement('div');
                    item.className = 'log-item log-' + type;
                    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                    item.textContent = \`[\${type.toUpperCase()}] \${message}\`;
                    consoleEl.appendChild(item);
                    consoleEl.scrollTop = consoleEl.scrollHeight;
                }

                // ログキャプチャ: ユーザーコード実行前に上書き
                window.originalConsole = window.console;
                ['log', 'error', 'warn', 'info'].forEach(type => {
                    const original = window.originalConsole[type];
                    window.console[type] = function(...args) {
                        virtualLog(type, args);
                        original.apply(window.originalConsole, args); 
                    };
                });

                // コマンド実行ロジック
                function runCommand(command) {
                    const outputEl = document.createElement('div');
                    outputEl.className = 'log-item';
                    
                    const parts = command.trim().toLowerCase().split(/\\s+/);
                    const cmd = parts[0];

                    switch (cmd) {
                        case 'ls':
                        case 'dir':
                            outputEl.textContent = VFS_FILE_NAMES.join('   ');
                            break;
                        case 'tree':
                            outputEl.textContent = VFS_FILE_NAMES.map(f => \`|-- \${f}\`).join('\\n');
                            break;
                        case 'whoami':
                            const info = [
                                \`User Agent: \${navigator.userAgent}\`,
                                \`Platform: \${navigator.platform}\`,
                                \`Device Type: \${/iPad|iPhone|iPod/.test(navigator.userAgent) ? 'iOS Device' : 'Desktop/Other'}\`
                            ].join('\\n');
                            outputEl.textContent = info;
                            break;
                        case 'clear':
                            consoleEl.innerHTML = '';
                            return;
                        default:
                            outputEl.textContent = \`Error: Command not found: \${cmd}\`;
                    }
                    consoleEl.appendChild(outputEl);
                    consoleEl.scrollTop = consoleEl.scrollHeight;
                }

                promptEl.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        const command = promptEl.value;
                        virtualLog('info', ['$', command]);
                        runCommand(command);
                        promptEl.value = '';
                    }
                };
                
                // 閉じるボタンの機能
                function setupCloseButton() {
                    const closeBtn = document.createElement('button');
                    closeBtn.id = 'close-btn';
                    closeBtn.innerHTML = '&times;'; // '×'
                    closeBtn.onclick = function() {
                        window.close();
                    };
                    document.body.appendChild(closeBtn);
                }
                
                // ユーザーコード実行ロジック
                window.onload = function() {
                    document.body.appendChild(wrapper); // コンソールをbodyに追加
                    console.log('DXCode Virtual Console initialized.');
                    setupCloseButton(); 
                
                    const jsCode = document.getElementById('user-script').textContent;
                    try {
                        // ユーザーのJavaScriptを実行
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
        </body>
        </html>
    `;

    previewWindow.document.write(previewContent);
    previewWindow.document.close();
}


// -----------------------------------------------------
// 5. ZIPダウンロード機能
// -----------------------------------------------------

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


// -----------------------------------------------------
// 6. Monaco Editorの初期化とUIイベント
// -----------------------------------------------------

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
    monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
    });
    
    // IndexedDBからプロジェクトをロード
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

    // アクティビティバーのイベントリスナー設定
    const activityIcons = document.querySelectorAll('.activity-icon');
    const sidebarContainer = document.getElementById('sidebar-container');
    let isSidebarVisible = true; // 初期状態は表示

    activityIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            activityIcons.forEach(i => i.classList.remove('active'));
            icon.classList.add('active');

            const view = icon.getAttribute('data-view');
            
            if (view === 'explorer') {
                // エクスプローラーがクリックされたらトグルする
                isSidebarVisible = !isSidebarVisible;
                if (!isSidebarVisible) {
                    icon.classList.remove('active'); // 非表示時はアイコンを非アクティブに
                }
            } else {
                // その他のビューは表示し、アラート
                isSidebarVisible = true;
                alert(`「${icon.title}」機能は現在、エクスプローラー以外ダミーです。`);
            }
            
            sidebarContainer.style.display = isSidebarVisible ? 'flex' : 'none';
        });
    });
});
