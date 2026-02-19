/**
 * DXCode v1.0 - Full JavaScript Logic
 * Features: Monaco Editor, VFS, IndexedDB Persistence (Cmd+S), VSCode UI Integration, Menu Bar Actions, Preview with Virtual Console.
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
// グローバルユーティリティ: メニューを隠す (handleMenuAction 等から参照されるためグローバルに)
// -----------------------------------------------------
function hideAllMenus() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.classList.remove('visible');
    });
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
}

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
    createFile('index.html', `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>DXCode Test</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Hello DXCode</h1>
  <p>Press Cmd/Ctrl + S to save, Ctrl+N to create a new file.</p>
</body>
</html>
`, true);

    createFile('style.css', 'body {\n  background-color: #2e2e2e;\n  color: #cccccc;\n}', false);
    createFile('script.js', 'console.log("DXCode is ready!");', false);
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
        alert('ポップアップがブロックされました。プレビューを表示できません。');
        return;
    }

    // 簡潔で安全なプレビューテンプレートに置き換え（元のファイルの途中切れ等を直すため）
    const previewContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>DXCode Preview</title>
            <style>
                #dxcode-console-wrapper { position: fixed; bottom: 0; left: 0; width: 100%; height: 150px; background: #222; color: #fff; z-index: 99999; display: flex; flex-direction: column; font-family: monospace; }
                #dxcode-console { flex-grow: 1; overflow-y: scroll; padding: 5px; }
                #dxcode-prompt { width: 100%; border: none; background: #111; color: #fff; padding: 5px; box-sizing: border-box; }
                .log-item { margin-bottom: 2px; }
                .log-error { color: #f44; } .log-warn { color: #ff0; } .log-info { color: #88f; }
                body { margin-bottom: 150px; }
                #close-btn { position: fixed; top: 10px; right: 10px; background: rgba(0, 0, 0, 0.7); color: white; border: none; border-radius: 50%; width: 30px; height: 30px; line-height: 30px; text-align: center; font-size: 18px; cursor: pointer; z-index: 100000; }
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
                
                // ユーザーコード実行ロジック
                window.onload = function() {
                    document.body.appendChild(wrapper);
                    console.log('DXCode Virtual Console initialized.');
                    setupCloseButton(); 
                
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
            console.error("ZIP生成エラー:", err);
            alert("ZIPファイルの生成に失敗しました。");
        });
});


// -----------------------------------------------------
// 6. メニューバーとUIアクションの実装
// -----------------------------------------------------

/**
 * ドロップダウンメニューの表示/非表示を切り替える
 */
function setupMenuBar() {
    const menuItems = document.querySelectorAll('#menu-bar .menu-item');
    
    // hideAllMenus をグローバルに移動したためここでは参照するだけ

    // メニューバーのイベントリスナー
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const dropdown = item.querySelector('.dropdown-menu');
            const isActive = dropdown.classList.contains('visible');

            hideAllMenus();

            if (!isActive) {
                dropdown.classList.add('visible');
                item.classList.add('active');
            }
        });
    });

    document.body.addEventListener('click', hideAllMenus);
    
    // アクションリスナーを設定
    document.querySelectorAll('.dropdown-menu .menu-option').forEach(option => {
        option.addEventListener('click', handleMenuAction);
    });
}

/**
 * メニューアクションの実行
 */
function handleMenuAction(e) {
    e.stopPropagation();
    hideAllMenus();
    
    const action = e.currentTarget.getAttribute('data-action');
    const sidebarContainer = document.getElementById('sidebar-container');
    const activityBar = document.getElementById('activity-bar');

    switch (action) {
        // ファイル(F)メニュー
        case 'new-file':
            document.getElementById('new-file-btn').click();
            break;
        case 'save':
            saveProject();
            break;
        case 'download-zip':
            document.getElementById('download-zip-btn').click();
            break;
        case 'close-file':
            if (activeFile && virtualFileSystem.has(activeFile)) {
                virtualFileSystem.get(activeFile).dispose(); // Monaco Modelを解放
                virtualFileSystem.delete(activeFile);
                activeFile = virtualFileSystem.keys().next().value || null;
                if (activeFile) {
                    setActiveFile(activeFile);
                } else {
                    monacoEditor.setModel(null);
                }
                updateUI();
            }
            break;
            
        // 編集(E)メニュー
        case 'undo':
            monacoEditor.trigger('menu-action', 'undo', {});
            break;
        case 'redo':
            monacoEditor.trigger('menu-action', 'redo', {});
            break;
        case 'find':
            monacoEditor.trigger('menu-action', 'actions.find', {});
            break;
            
        // 表示(V)メニュー
        case 'toggle-sidebar':
            sidebarContainer.style.display = sidebarContainer.style.display === 'none' ? 'flex' : 'none';
            break;
        case 'toggle-activitybar':
            activityBar.style.display = activityBar.style.display === 'none' ? 'flex' : 'none';
            break;
            
        // 実行(R)メニュー
        case 'open-preview':
            if (activeFile && activeFile.endsWith('.html')) {
                openPreview();
            } else {
                alert('プレビューを実行するには HTML ファイルを選択してください。');
            }
            break;

        // ヘルプ(H)メニュー
        case 'about':
            alert('DXCode: Visual Studio Code風 PWA エディタ\n\nGitHub PagesとMonaco Editorを使用して構築されています。\n\n開発元: Gemini');
            break;
            
        default:
            alert(`「${e.currentTarget.textContent.trim()}」機能は未実装です。`);
    }
}


// -----------------------------------------------------
// 7. 検索機能 (Search タブ) - 追加部分
// -----------------------------------------------------

// Monaco 上の検索ハイライトデコレーションIDを保存
let searchDecorations = [];

/**
 * 検索パネルをサイドバーに描画する（探索的に挿入）
 */
function renderSearchPanel() {
    const sidebar = document.getElementById('sidebar-container');
    if (!sidebar) return;

    // Explorer と共存するため、パネル部分のみを管理する
    let panel = document.getElementById('search-panel');
    if (panel) return; // 既にある場合は再利用

    panel = document.createElement('div');
    panel.id = 'search-panel';
    panel.style.padding = '8px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.height = '100%';
    panel.style.boxSizing = 'border-box';

    // 入力エリア
    const inputRow = document.createElement('div');
    inputRow.style.display = 'flex';
    inputRow.style.gap = '6px';
    inputRow.style.marginBottom = '8px';

    const input = document.createElement('input');
    input.id = 'search-input';
    input.placeholder = '検索語を入力 (ファイル名 / 内容)';
    input.style.flex = '1';
    input.style.padding = '6px';
    input.style.fontSize = '13px';
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            performSearch(input.value);
        }
    });

    const btn = document.createElement('button');
    btn.id = 'search-btn';
    btn.textContent = '検索';
    btn.style.padding = '6px';
    btn.addEventListener('click', () => performSearch(input.value));

    const clearBtn = document.createElement('button');
    clearBtn.id = 'search-clear-btn';
    clearBtn.textContent = 'クリア';
    clearBtn.style.padding = '6px';
    clearBtn.addEventListener('click', () => {
        input.value = '';
        renderSearchResults([]);
        clearSearchDecorations();
    });

    inputRow.appendChild(input);
    inputRow.appendChild(btn);
    inputRow.appendChild(clearBtn);

    // 結果エリア
    const results = document.createElement('div');
    results.id = 'search-results';
    results.style.flex = '1';
    results.style.overflow = 'auto';
    results.style.fontSize = '13px';
    results.style.whiteSpace = 'pre-wrap';

    panel.appendChild(inputRow);
    panel.appendChild(results);

    // Explorer の直下に挿入しておく（既存の explorer セクションと競合しない）
    const explorerSection = sidebar.querySelector('.explorer-section');
    if (explorerSection) {
        explorerSection.parentNode.insertBefore(panel, explorerSection.nextSibling);
    } else {
        sidebar.appendChild(panel);
    }

    // 検索用スタイル注入（既存の styles.css は変更しない）
    if (!document.getElementById('dxcode-search-style')) {
        const style = document.createElement('style');
        style.id = 'dxcode-search-style';
        style.textContent = `
            .dx-search-result { padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.03); cursor: pointer; }
            .dx-search-result:hover { background: rgba(255,255,255,0.03); }
            .dx-search-file { font-weight: bold; color: var(--text-color); }
            .dx-search-line { color: var(--text-inactive); font-size: 12px; margin-top: 4px; }
            .dx-search-decor { background-color: rgba(255, 205, 43, 0.35); border-bottom: 2px solid rgba(255,205,43,0.7); }
        `;
        document.head.appendChild(style);
    }
}

/**
 * 検索を実行して結果を描画する
 */
function performSearch(query) {
    const trimmed = (query || '').trim();
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    clearSearchDecorations();

    if (!trimmed) {
        resultsEl.innerHTML = '<div style="padding:8px;color:var(--text-inactive)">検索語を入力してください。</div>';
        return;
    }

    const qLower = trimmed.toLowerCase();
    const hits = [];

    virtualFileSystem.forEach((model, fileName) => {
        const content = model.getValue();
        const contentLower = content.toLowerCase();

        // ファイル名ヒット
        if (fileName.toLowerCase().includes(qLower)) {
            hits.push({ fileName, line: null, text: '(ファイル名にヒット)', start: 0, length: 0 });
        }

        // 内容検索（行単位）
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const lineLower = lines[i].toLowerCase();
            const idx = lineLower.indexOf(qLower);
            if (idx !== -1) {
                hits.push({ fileName, line: i, text: lines[i], start: idx, length: trimmed.length });
            }
        }
    });

    renderSearchResults(hits);
}

/**
 * 検索結果を DOM に描画
 */
function renderSearchResults(hits) {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    resultsEl.innerHTML = '';

    if (!hits || hits.length === 0) {
        resultsEl.innerHTML = '<div style="padding:8px;color:var(--text-inactive)">該当する結果はありません。</div>';
        return;
    }

    // グルーピングすると見やすいが、ここでは単純リスト表示
    hits.forEach(hit => {
        const item = document.createElement('div');
        item.className = 'dx-search-result';

        const fileEl = document.createElement('div');
        fileEl.className = 'dx-search-file';
        fileEl.textContent = hit.fileName + (hit.line !== null ? ` : ${hit.line + 1}` : '');

        item.appendChild(fileEl);

        if (hit.line !== null) {
            const lineEl = document.createElement('div');
            lineEl.className = 'dx-search-line';
            lineEl.textContent = hit.text.trim();
            item.appendChild(lineEl);
        } else {
            const note = document.createElement('div');
            note.className = 'dx-search-line';
            note.textContent = hit.text;
            item.appendChild(note);
        }

        item.addEventListener('click', () => {
            // ファイルを開いて該当箇所へフォーカス
            setActiveFile(hit.fileName);
            if (hit.line !== null) {
                const model = virtualFileSystem.get(hit.fileName);
                if (!model) return;

                monacoEditor.setModel(model);

                // Monaco は 1-origin
                const startLineNumber = hit.line + 1;
                const startColumn = hit.start + 1;
                const endColumn = hit.start + hit.length + 1;

                const range = new monaco.Range(startLineNumber, startColumn, startLineNumber, endColumn);
                searchDecorations = monacoEditor.deltaDecorations(searchDecorations, [
                    { range, options: { inlineClassName: 'dx-search-decor' } }
                ]);
                monacoEditor.revealRangeInCenter(range);
                monacoEditor.setSelection(range);
                monacoEditor.focus();
            } else {
                // ファイル名ヒットのときはファイルのみ表示
                const model = virtualFileSystem.get(hit.fileName);
                if (model) {
                    monacoEditor.setModel(model);
                    monacoEditor.focus();
                }
            }
        });

        resultsEl.appendChild(item);
    });
}

/**
 * 検索デコレーションをクリア
 */
function clearSearchDecorations() {
    if (!monacoEditor) return;
    searchDecorations = monacoEditor.deltaDecorations(searchDecorations, []);
}


// -----------------------------------------------------
// 8. Monaco Editorの初期化とUIイベント
// -----------------------------------------------------

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
    monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
        language: 'plaintext',
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

    // キーボードショートカット
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
                sidebarContainer.style.display = isSidebarVisible ? 'flex' : 'none';
            } else if (view === 'search') {
                // 検索パネルを表示してサイドバーを常に表示させる
                renderSearchPanel();
                isSidebarVisible = true;
                sidebarContainer.style.display = 'flex';
                // Explorer を閉じたい場合は explorer-section を折りたたむ等の処理を追加可（今は両方表示）
            } else {
                isSidebarVisible = true;
                sidebarContainer.style.display = 'flex';
                alert(`「${icon.title}」機能は現在、エクスプローラー以外ダミーです。`);
            }
        });
    });
});
