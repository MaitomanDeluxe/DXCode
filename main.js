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
const virtualFileSystem = new Map();
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
    createFile('index.html', `<!DOCTYPE html>\n<html>\n<head>\n  <title>DXCode Test</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello DXCode</h1>\n  <p>Press Cmd/Ctrl + S or use the File menu to save the project!</p>\n  <script src="script.js"></script>\n</body>\n</html>`, true);
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
        alert(`${fileName} は既に存在します。`);
        return;
    }

    const lang = getLanguage(fileName);
    const model = monaco.editor.createModel(content, lang);
    virtualFileSystem.set(fileName, model);
    
    model.onDidChangeLanguage(() => updateUI());

    if (activate) setActiveFile(fileName);
    
    updateUI();
}

function setActiveFile(fileName) {
    if (!virtualFileSystem.has(fileName) || fileName === activeFile) return;

    activeFile = fileName;
    const model = virtualFileSystem.get(fileName);
    
    monacoEditor.setModel(model);
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
    
    previewBtn.style.display = (activeFileExt === 'html') ? 'block' : 'none';

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
    
    // エディタが空の場合にダミーモデルを設定
    if (!activeFile && virtualFileSystem.size === 0) {
        monacoEditor.setModel(null);
    }
}


// -----------------------------------------------------
// 4. プレビューと仮想コンソール
// -----------------------------------------------------

function openPreview() {
    const codeData = {
        html: virtualFileSystem.get('index.html')?.getValue() || '<h1>index.html not found</h1>',
        css: virtualFileSystem.get('style.css')?.getValue() || '',
        js: virtualFileSystem.get('script.js')?.getValue() || '',
        fileNames: Array.from(virtualFileSystem.keys())
    };

    const previewWindow = window.open('about:blank', 'DXCode_Preview', 'width=800,height=600');
    if (!previewWindow) {
        alert('ポップアップがブロックされました。プレビュー���表示できません。');
        return;
    }

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
                body { margin-bottom: 150px; }
                
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

                /* コンソール表示/非表示トグルボタンのスタイル */
                #console-toggle-btn {
                    position: fixed;
                    top: 10px;
                    right: 50px;
                    background: rgba(0,0,0,0.7);
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 4px 8px;
                    cursor: pointer;
                    z-index: 100000;
                }
            </style>
            <script>
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
                
                function virtualLog(type, args) {
                    const item = document.createElement('div');
                    item.className = 'log-item log-' + type;
                    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                    item.textContent = \`[\${type.toUpperCase()}] \${message}\`;
                    consoleEl.appendChild(item);
                    consoleEl.scrollTop = consoleEl.scrollHeight;
                }

                // ログキャプチャ
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
                    closeBtn.innerHTML = '&times;';
                    closeBtn.onclick = function() {
                        window.close();
                    };
                    document.body.appendChild(closeBtn);
                }

                // コンソール表示/非表示トグルボタンの機能（追加）
                function setupConsoleToggle() {
                    const toggleBtn = document.createElement('button');
                    toggleBtn.id = 'console-toggle-btn';
                    toggleBtn.title = '仮想コンソールの表示/非表示';
                    toggleBtn.textContent = 'Hide Console'; // 初期は表示なので「Hide」
                    
                    // 初期表示状���
                    let consoleVisible = true;

                    toggleBtn.onclick = function() {
                        consoleVisible = !consoleVisible;
                        if (consoleVisible) {
                            wrapper.style.display = 'flex';
                            document.body.style.marginBottom = '150px';
                            toggleBtn.textContent = 'Hide Console';
                        } else {
                            wrapper.style.display = 'none';
                            document.body.style.marginBottom = '0';
                            toggleBtn.textContent = 'Show Console';
                        }
                    };
                    document.body.appendChild(toggleBtn);
                }
                
                // ユーザーコード実行ロジック
                window.onload = function() {
                    document.body.appendChild(wrapper);
                    console.log('DXCode Virtual Console initialized.');
                    setupCloseButton(); 
                    setupConsoleToggle(); // 追加したトグルをセットアップ
                
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
            console.error('ZIP generation failed:', err);
            alert('ZIP ファイルの生成に失敗しました。');
        });
});


// -----------------------------------------------------
// 6. 初期化とイベントハンドラ
// -----------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
            value: '',
            language: 'javascript',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: true },
        });
        
        loadProject();

        // ボタンのイベントリスナー
        document.getElementById('new-file-btn').addEventListener('click', () => {
            const fileName = prompt("新しいファイル名を入力してください (例: component.js):");
            if (fileName) {
                createFile(fileName.trim());
            }
        });

        document.getElementById('preview-btn').addEventListener('click', openPreview);

        // キーボードシ��ートカット
        monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            saveProject();
            return null; 
        }, 'EditorTextFocus'); 

        monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => {
            document.getElementById('new-file-btn').click();
        });

        // メニューバーのセットアップ
        setupMenuBar(); 

        // アクティビティバーのイベントリスナー設定
        const activityIcons = document.querySelectorAll('.activity-icon');
        const sidebarContainer = document.getElementById('sidebar-container');
        let isSidebarVisible = true;

        activityIcons.forEach(icon => {
            icon.addEventListener('click', () => {
                activityIcons.forEach(i => i.classList.remove('active'));
                icon.classList.add('active');

                const view = icon.getAttribute('data-view');
                
                if (view === 'explorer') {
                    isSidebarVisible = !isSidebarVisible;
                    if (!isSidebarVisible) {
                        icon.classList.remove('active');
                    }
                } else {
                    isSidebarVisible = true;
                    alert(`「${icon.title}」機能は現在、エクスプローラー以外ダミーです。`);
                }
                
                sidebarContainer.style.display = isSidebarVisible ? 'flex' : 'none';
            });
        });
    });
});
