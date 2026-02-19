/**
 * DXCode v1.0+ - Extended JavaScript Logic
 * - Monaco Editor, VFS, IndexedDB Persistence (Cmd+S)
 * - Menu Bar Actions, Preview with Virtual Console
 * - Search / Explorer separated tabs with slide animation
 * - Extensions tab: XML import/export, presets, TTF loading, color/font controls
 *
 * Notes:
 * - styles.css is NOT modified; additional UI styles are injected dynamically.
 * - Uses existing JSZip/FileSaver/Monaco CDN as before.
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

// Monaco 上の検索デコレーション保持
let searchDecorations = [];

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
        request.onerror = () => {
            createInitialFiles();
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
// (同じ実装。必要なら別タスクでサンドボックス化を推奨)
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
// 7. サイドバー内のタブ (Explorer / Search / Extensions)
// - 元の styles.css は変更しないため、必要なモダンスタイルは head に注入する
// -----------------------------------------------------

// プリセットテーマ (一部は Monaco テーマ設定と CSS 変数)
const PRESETS = {
    "Light": {
        cssVars: {
            '--bg-main': '#ffffff',
            '--bg-editor': '#ffffff',
            '--bg-secondary': '#f3f3f3',
            '--bg-activity': '#e6e6e6',
            '--bg-status': '#007acc',
            '--bg-menu': '#f3f3f3',
            '--text-color': '#222222',
            '--text-inactive': '#6b6b6b',
            '--accent-color': '#007acc',
            '--active-item-bg': '#dbeeff'
        },
        monacoTheme: {
            base: 'vs',
            inherit: true,
            rules: [],
            colors: {
                'editor.background': '#ffffff',
                'editor.foreground': '#000000'
            }
        },
        font: { family: 'Consolas, "Courier New", monospace', size: 13 }
    },
    "Dark": {
        cssVars: {
            '--bg-main': '#1e1e1e',
            '--bg-editor': '#1e1e1e',
            '--bg-secondary': '#252526',
            '--bg-activity': '#333333',
            '--bg-status': '#007acc',
            '--bg-menu': '#3c3c3c',
            '--text-color': '#cccccc',
            '--text-inactive': '#808080',
            '--accent-color': '#007acc',
            '--active-item-bg': '#006080'
        },
        monacoTheme: {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'editor.background': '#1e1e1e',
                'editor.foreground': '#d4d4d4'
            }
        },
        font: { family: 'Menlo, Monaco, "Courier New", monospace', size: 13 }
    },
    "Solarized": {
        cssVars: {
            '--bg-main': '#fdf6e3',
            '--bg-editor': '#fdf6e3',
            '--bg-secondary': '#eee8d5',
            '--bg-activity': '#b58900',
            '--bg-status': '#268bd2',
            '--bg-menu': '#eee8d5',
            '--text-color': '#586e75',
            '--text-inactive': '#93a1a1',
            '--accent-color': '#268bd2',
            '--active-item-bg': '#fefcf0'
        },
        monacoTheme: {
            base: 'vs',
            inherit: true,
            rules: [],
            colors: { 'editor.background': '#fdf6e3', 'editor.foreground': '#586e75' }
        },
        font: { family: 'Menlo, Monaco, "Courier New", monospace', size: 13 }
    },
    "Dracula": {
        cssVars: {
            '--bg-main': '#282a36',
            '--bg-editor': '#282a36',
            '--bg-secondary': '#44475a',
            '--bg-activity': '#bd93f9',
            '--bg-status': '#6272a4',
            '--bg-menu': '#44475a',
            '--text-color': '#f8f8f2',
            '--text-inactive': '#6272a4',
            '--accent-color': '#ff79c6',
            '--active-item-bg': '#5a4e7a'
        },
        monacoTheme: {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: { 'editor.background': '#282a36', 'editor.foreground': '#f8f8f2' }
        },
        font: { family: '"Fira Code", Menlo, Monaco, monospace', size: 13 }
    },
    "HighContrast": {
        cssVars: {
            '--bg-main': '#000000',
            '--bg-editor': '#000000',
            '--bg-secondary': '#111111',
            '--bg-activity': '#111111',
            '--bg-status': '#ffffff',
            '--bg-menu': '#111111',
            '--text-color': '#ffffff',
            '--text-inactive': '#999999',
            '--accent-color': '#ffffff',
            '--active-item-bg': '#333333'
        },
        monacoTheme: {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: { 'editor.background': '#000000', 'editor.foreground': '#ffffff' }
        },
        font: { family: 'Arial, "Helvetica Neue", sans-serif', size: 14 }
    }
};

/**
 * applyPreset - プリセットを適用
 */
function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;

    // CSS 変数を更新
    Object.keys(preset.cssVars).forEach(k => {
        document.documentElement.style.setProperty(k, preset.cssVars[k]);
    });

    // Monaco テーマ定義と適用
    const themeName = `dxcode-${name.toLowerCase()}`;
    if (monaco && monaco.editor) {
        monaco.editor.defineTheme(themeName, preset.monacoTheme);
        monaco.editor.setTheme(themeName);

        // フォント設定
        if (monacoEditor) {
            monacoEditor.updateOptions({
                fontFamily: preset.font.family,
                fontSize: preset.font.size
            });
        }
    }
}

/**
 * injectEnhancementStyles - サイドバータブ・アニメーション・モダンなボタン等のスタイルを注入
 */
function injectEnhancementStyles() {
    if (document.getElementById('dxcode-enhancements-style')) return;

    const style = document.createElement('style');
    style.id = 'dxcode-enhancements-style';
    style.textContent = `
    /* Sidebar tabs header */
    #sidebar-header { display: flex; align-items: center; gap: 8px; justify-content: flex-start; padding: 6px; }
    #sidebar-header .sidebar-tab { padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 12px; background: transparent; color: var(--text-inactive); }
    #sidebar-header .sidebar-tab.active { background: rgba(255,255,255,0.04); color: var(--text-color); box-shadow: 0 1px 0 rgba(255,255,255,0.02) inset; }
    /* panel base */
    #sidebar-container .dx-panel { transform: translateX(-8px); opacity: 0; transition: transform 260ms cubic-bezier(.2,.9,.2,1), opacity 260ms ease; will-change: transform, opacity; }
    #sidebar-container .dx-panel.visible { transform: translateX(0); opacity: 1; }
    /* modern search input/button */
    #search-input { border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); padding: 8px 10px; background: rgba(255,255,255,0.02); color: var(--text-color); outline: none; box-shadow: none; }
    #search-btn, #search-clear-btn { border-radius: 8px; border: none; padding: 8px 10px; background: var(--accent-color); color: white; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.25); }
    #search-clear-btn { background: #666666; margin-left: 6px; }
    /* search result highlight for Monaco inline class */
    .dx-search-decor { background-color: rgba(255, 205, 43, 0.35); border-bottom: 2px solid rgba(255,205,43,0.7); }
    /* extensions tab small controls */
    .dx-extensions-controls { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
    .dx-extensions-controls input[type="file"] { display:inline-block; }
    .dx-extensions-presets button { margin-right:6px; padding:6px 8px; border-radius:6px; background:rgba(255,255,255,0.03); color:var(--text-color); border:none; cursor:pointer; }
    .dx-extensions-subtabs { display:flex; gap:6px; margin-bottom:6px; }
    .dx-subtab { padding:6px 8px; border-radius:6px; background:transparent; color:var(--text-inactive); cursor:pointer; }
    .dx-subtab.active { background:rgba(255,255,255,0.04); color:var(--text-color); }
    .dx-panel .dx-section { padding:8px; border-top:1px solid rgba(255,255,255,0.02); }
    `;
    document.head.appendChild(style);
}

/**
 * renderSidebarTabs - サイドバーのヘッダーにタブボタンを組み込み、各パネルのレンダラを呼ぶ
 */
function renderSidebarTabs() {
    const header = document.getElementById('sidebar-header');
    if (!header) return;

    injectEnhancementStyles();

    // 既にタブがあれば無視
    if (header.querySelector('.sidebar-tab')) return;

    // Create tabs: Explorer / Search / Extensions
    const explorerTab = document.createElement('div');
    explorerTab.className = 'sidebar-tab active';
    explorerTab.textContent = 'Explorer';
    explorerTab.dataset.view = 'explorer';

    const searchTab = document.createElement('div');
    searchTab.className = 'sidebar-tab';
    searchTab.textContent = 'Search';
    searchTab.dataset.view = 'search';

    const extensionsTab = document.createElement('div');
    extensionsTab.className = 'sidebar-tab';
    extensionsTab.textContent = 'Extensions';
    extensionsTab.dataset.view = 'extensions';

    // Remove existing text content and append tabs
    header.innerHTML = '';
    header.appendChild(explorerTab);
    header.appendChild(searchTab);
    header.appendChild(extensionsTab);

    // click handler
    [explorerTab, searchTab, extensionsTab].forEach(t => {
        t.addEventListener('click', () => {
            header.querySelectorAll('.sidebar-tab').forEach(x => x.classList.remove('active'));
            t.classList.add('active');

            const view = t.dataset.view;
            showSidebarPanel(view);
        });
    });

    // initial render explorer
    renderExplorerPanel();
    showSidebarPanel('explorer');
}

/**
 * showSidebarPanel - パネル表示切替
 */
function showSidebarPanel(view) {
    const sidebar = document.getElementById('sidebar-container');
    if (!sidebar) return;

    // Hide all panels then show the requested one
    const panels = sidebar.querySelectorAll('.dx-panel');
    panels.forEach(p => p.classList.remove('visible'));

    if (view === 'explorer') {
        // explorer panel exists in DOM (explorer-section). We'll ensure it's visible
        const explorerPanel = ensureExplorerPanel();
        explorerPanel.classList.add('visible');
    } else if (view === 'search') {
        const panel = ensureSearchPanel();
        panel.classList.add('visible');
    } else if (view === 'extensions') {
        const panel = ensureExtensionsPanel();
        panel.classList.add('visible');
    }
}

/**
 * ensureExplorerPanel - explorer 用のラッパーパネルを返す（存在しなければ作成）
 */
function ensureExplorerPanel() {
    const sidebar = document.getElementById('sidebar-container');
    let p = sidebar.querySelector('.dx-panel.explorer');
    if (p) return p;

    p = document.createElement('div');
    p.className = 'dx-panel explorer';
    p.style.display = 'flex';
    p.style.flexDirection = 'column';
    p.style.height = '100%';
    // move existing explorer-section into this panel
    const explorerSection = sidebar.querySelector('.explorer-section');
    if (explorerSection) {
        p.appendChild(explorerSection);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'dx-section';
        placeholder.textContent = 'No explorer available.';
        p.appendChild(placeholder);
    }
    sidebar.appendChild(p);
    return p;
}

/**
 * ensureSearchPanel - 別パネルとしての検索 UI を返す（作成済みなら再利用）
 */
function ensureSearchPanel() {
    const sidebar = document.getElementById('sidebar-container');
    let panel = sidebar.querySelector('#search-panel-wrapper');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'search-panel-wrapper';
    panel.className = 'dx-panel search';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.height = '100%';
    panel.style.boxSizing = 'border-box';
    panel.style.padding = '8px';

    // modern input row
    const inputRow = document.createElement('div');
    inputRow.style.display = 'flex';
    inputRow.style.gap = '6px';
    inputRow.style.marginBottom = '8px';

    const input = document.createElement('input');
    input.id = 'search-input';
    input.placeholder = 'Search files or contents...';
    input.style.flex = '1';
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch(input.value);
    });

    const btn = document.createElement('button');
    btn.id = 'search-btn';
    btn.textContent = 'Search';
    btn.addEventListener('click', () => performSearch(input.value));

    const clearBtn = document.createElement('button');
    clearBtn.id = 'search-clear-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
        input.value = '';
        renderSearchResults([]);
        clearSearchDecorations();
    });

    inputRow.appendChild(input);
    inputRow.appendChild(btn);
    inputRow.appendChild(clearBtn);

    const results = document.createElement('div');
    results.id = 'search-results';
    results.style.flex = '1';
    results.style.overflow = 'auto';
    results.style.fontSize = '13px';
    results.style.whiteSpace = 'pre-wrap';

    panel.appendChild(inputRow);
    panel.appendChild(results);

    sidebar.appendChild(panel);

    // add small explanatory placeholder if empty
    results.innerHTML = '<div style="padding:8px;color:var(--text-inactive)">Enter query and press Enter or Search.</div>';

    return panel;
}

/**
 * ensureExtensionsPanel - Extensions タブのパネル（サブタブあり）
 */
function ensureExtensionsPanel() {
    const sidebar = document.getElementById('sidebar-container');
    let panel = sidebar.querySelector('#extensions-panel-wrapper');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'extensions-panel-wrapper';
    panel.className = 'dx-panel extensions';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.height = '100%';
    panel.style.boxSizing = 'border-box';
    panel.style.padding = '8px';

    // Presets row
    const presetsRow = document.createElement('div');
    presetsRow.className = 'dx-extensions-controls';

    const presetLabel = document.createElement('div');
    presetLabel.textContent = 'Presets:';
    presetLabel.style.marginRight = '6px';
    presetsRow.appendChild(presetLabel);

    const presetContainer = document.createElement('div');
    presetContainer.className = 'dx-extensions-presets';
    Object.keys(PRESETS).forEach(name => {
        const b = document.createElement('button');
        b.textContent = name;
        b.addEventListener('click', () => applyPreset(name));
        presetContainer.appendChild(b);
    });
    presetsRow.appendChild(presetContainer);

    // file input for custom XML
    const xmlLoader = document.createElement('input');
    xmlLoader.type = 'file';
    xmlLoader.accept = '.xml';
    xmlLoader.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                applyConfigFromXML(reader.result);
                alert('Config applied from XML.');
            } catch (err) {
                console.error(err);
                alert('Invalid XML or failed to apply config.');
            }
        };
        reader.readAsText(file);
    });
    presetsRow.appendChild(xmlLoader);

    // Subtabs for Colors / Fonts / Import-Export
    const subtabs = document.createElement('div');
    subtabs.className = 'dx-extensions-subtabs';
    const subNames = ['Colors', 'Fonts', 'Import-Export'];
    subNames.forEach((s, idx) => {
        const t = document.createElement('div');
        t.className = 'dx-subtab';
        if (idx === 0) t.classList.add('active');
        t.textContent = s;
        t.dataset.sub = s.toLowerCase();
        t.addEventListener('click', () => {
            subtabs.querySelectorAll('.dx-subtab').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            showExtensionsSubtab(t.dataset.sub);
        });
        subtabs.appendChild(t);
    });

    // container for subtab content
    const subContainer = document.createElement('div');
    subContainer.id = 'dx-extensions-subcontainer';
    subContainer.style.flex = '1';
    subContainer.style.overflow = 'auto';
    subContainer.style.marginTop = '8px';

    panel.appendChild(presetsRow);
    panel.appendChild(subtabs);
    panel.appendChild(subContainer);

    sidebar.appendChild(panel);

    // render default subtab
    showExtensionsSubtab('colors');

    return panel;
}

/**
 * showExtensionsSubtab - Extensions 内のサブタブを表示
 */
function showExtensionsSubtab(name) {
    const sub = document.getElementById('dx-extensions-subcontainer');
    if (!sub) return;
    sub.innerHTML = '';

    if (name === 'colors') {
        const section = document.createElement('div');
        section.className = 'dx-section';
        section.innerHTML = '<div style="margin-bottom:8px;"><strong>Color Overrides</strong></div>';

        // show a few important CSS variables as color pickers
        const keys = ['--bg-main','--bg-editor','--bg-secondary','--accent-color','--text-color'];
        keys.forEach(k => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '8px';
            row.style.marginBottom = '8px';

            const label = document.createElement('div');
            label.style.width = '120px';
            label.textContent = k;

            const input = document.createElement('input');
            input.type = 'color';
            // try to compute current value
            const computed = getComputedStyle(document.documentElement).getPropertyValue(k).trim() || '#000000';
            // If computed is not hex, skip default
            input.value = toHex(computed) || '#000000';
            input.addEventListener('input', () => {
                document.documentElement.style.setProperty(k, input.value);
            });

            row.appendChild(label);
            row.appendChild(input);
            section.appendChild(row);
        });

        sub.appendChild(section);
    } else if (name === 'fonts') {
        const section = document.createElement('div');
        section.className = 'dx-section';
        section.innerHTML = '<div style="margin-bottom:8px;"><strong>Fonts</strong> — Upload a .ttf to load a custom font and set it for the editor.</div>';

        const ttfInput = document.createElement('input');
        ttfInput.type = 'file';
        ttfInput.accept = '.ttf,.otf';
        ttfInput.addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
                // create blob URL
                const blob = new Blob([reader.result], { type: f.type || 'font/ttf' });
                const url = URL.createObjectURL(blob);
                const fontName = `DXCode-Custom-${Date.now()}`;
                const style = document.createElement('style');
                style.id = `dxcode-font-${fontName}`;
                style.textContent = `@font-face { font-family: "${fontName}"; src: url('${url}'); }`;
                document.head.appendChild(style);

                // apply to monaco editor and UI
                if (monacoEditor) {
                    monacoEditor.updateOptions({ fontFamily: `"${fontName}", monospace` });
                }
                document.documentElement.style.setProperty('--font-custom', `"${fontName}"`);
                alert('Custom font loaded and applied to editor.');
            };
            reader.readAsArrayBuffer(f);
        });

        // font size control
        const sizeRow = document.createElement('div');
        sizeRow.style.marginTop = '8px';
        const sizeLabel = document.createElement('div');
        sizeLabel.textContent = 'Editor font size:';
        sizeLabel.style.display = 'inline-block';
        sizeLabel.style.marginRight = '8px';
        const sizeInput = document.createElement('input');
        sizeInput.type = 'number';
        sizeInput.value = monacoEditor ? monacoEditor.getOption(monaco.editor.EditorOption.fontSize) || 13 : 13;
        sizeInput.style.width = '80px';
        const applySizeBtn = document.createElement('button');
        applySizeBtn.textContent = 'Apply';
        applySizeBtn.addEventListener('click', () => {
            const v = parseInt(sizeInput.value, 10) || 13;
            if (monacoEditor) monacoEditor.updateOptions({ fontSize: v });
        });
        sizeRow.appendChild(sizeLabel);
        sizeRow.appendChild(sizeInput);
        sizeRow.appendChild(applySizeBtn);

        section.appendChild(ttfInput);
        section.appendChild(sizeRow);
        sub.appendChild(section);
    } else if (name === 'import-export') {
        const section = document.createElement('div');
        section.className = 'dx-section';
        section.innerHTML = '<div style="margin-bottom:8px;"><strong>Import / Export DXCode XML</strong></div>';

        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export current config (XML)';
        exportBtn.addEventListener('click', () => {
            const xml = exportCurrentConfigXML();
            const blob = new Blob([xml], { type: 'application/xml' });
            saveAs(blob, 'dxcode-config.xml');
        });

        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.xml';
        importInput.addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    applyConfigFromXML(reader.result);
                    alert('Config applied from XML.');
                } catch (err) {
                    console.error(err);
                    alert('Failed to import config.');
                }
            };
            reader.readAsText(f);
        });

        section.appendChild(exportBtn);
        section.appendChild(document.createElement('br'));
        section.appendChild(document.createElement('br'));
        section.appendChild(importInput);

        sub.appendChild(section);
    }
}

/**
 * toHex - computed style string から hex に変換（簡易）
 */
function toHex(colorStr) {
    if (!colorStr) return null;
    colorStr = colorStr.trim();
    if (colorStr.startsWith('#')) return colorStr;
    const m = colorStr.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!m) return null;
    const r = parseInt(m[1]).toString(16).padStart(2,'0');
    const g = parseInt(m[2]).toString(16).padStart(2,'0');
    const b = parseInt(m[3]).toString(16).padStart(2,'0');
    return `#${r}${g}${b}`;
}

/**
 * applyConfigFromXML - 独自 XML を読み込んで適用する（簡易仕様）
 * 期待する構造:
 * <dxcode>
 *   <theme name="Custom">
 *     <var name="--bg-main">#111111</var>
 *     ...
 *   </theme>
 *   <font family="MyFont" size="13" src="data:..."> (src optional)
 *   <preset name="Dark"/>
 * </dxcode>
 */
function applyConfigFromXML(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('XML parse error');

    const theme = doc.querySelector('theme');
    if (theme) {
        theme.querySelectorAll('var').forEach(v => {
            const name = v.getAttribute('name');
            const value = v.textContent.trim();
            if (name) document.documentElement.style.setProperty(name, value);
        });
    }

    const font = doc.querySelector('font');
    if (font) {
        const family = font.getAttribute('family');
        const size = parseInt(font.getAttribute('size'), 10) || undefined;
        const src = font.getAttribute('src'); // could be data:, blob URL, or remote URL

        if (src) {
            const fontName = family || `DXCode-Imported-${Date.now()}`;
            const style = document.createElement('style');
            style.textContent = `@font-face { font-family: "${fontName}"; src: url('${src}'); }`;
            document.head.appendChild(style);
            if (monacoEditor) monacoEditor.updateOptions({ fontFamily: `"${fontName}", monospace` });
        } else if (family) {
            if (monacoEditor) monacoEditor.updateOptions({ fontFamily: family });
        }
        if (size && monacoEditor) monacoEditor.updateOptions({ fontSize: size });
    }

    const preset = doc.querySelector('preset');
    if (preset && preset.getAttribute('name')) {
        const p = preset.getAttribute('name');
        if (PRESETS[p]) applyPreset(p);
    }
}

/**
 * exportCurrentConfigXML - 現在の設定を特殊 XML として出力する
 */
function exportCurrentConfigXML() {
    const vars = ['--bg-main','--bg-editor','--bg-secondary','--accent-color','--text-color'];
    let xml = '<?xml version="1.0" encoding="utf-8"?>\\n<dxcode>\\n  <theme name="exported">\\n';
    vars.forEach(k => {
        const v = getComputedStyle(document.documentElement).getPropertyValue(k).trim() || '';
        xml += `    <var name="${k}">${v}</var>\\n`;
    });
    xml += '  </theme>\\n';
    if (monacoEditor) {
        const fontFamily = monacoEditor.getOption(monaco.editor.EditorOption.fontFamily);
        const fontSize = monacoEditor.getOption(monaco.editor.EditorOption.fontSize);
        xml += `  <font family="${fontFamily || ''}" size="${fontSize || ''}" />\\n`;
    }
    xml += '</dxcode>\\n';
    return xml;
}


// -----------------------------------------------------
// 8. 検索機能 (Search) - 既存の performSearch/renderSearchResults 等を統合
// -----------------------------------------------------

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

    // 単純リスト表示
    hits.forEach(hit => {
        const item = document.createElement('div');
        item.className = 'dx-search-result';
        item.style.padding = '8px';
        item.style.borderBottom = '1px solid rgba(255,255,255,0.03)';

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
// 9. Monaco Editorの初期化とUIイベント
// -----------------------------------------------------

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
    monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 13
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

    // サイドバーのタブを注入（Explorer / Search / Extensions）
    renderSidebarTabs();

    // Activity Bar のイベントを調整（既存のクリック処理を拡張）
    const activityIcons = document.querySelectorAll('.activity-icon');
    const sidebarContainer = document.getElementById('sidebar-container');
    let isSidebarVisible = true;

    activityIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            activityIcons.forEach(i => i.classList.remove('active'));
            icon.classList.add('active');

            const view = icon.getAttribute('data-view');
            
            if (view === 'explorer') {
                // select explorer tab
                const header = document.getElementById('sidebar-header');
                if (header) {
                    header.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
                    const ex = header.querySelector('.sidebar-tab[data-view="explorer"]');
                    if (ex) ex.classList.add('active');
                }
                isSidebarVisible = !isSidebarVisible;
                if (!isSidebarVisible) {
                    icon.classList.remove('active');
                }
                showSidebarPanel('explorer');
                sidebarContainer.style.display = isSidebarVisible ? 'flex' : 'none';
            } else if (view === 'search') {
                // select search tab
                const header = document.getElementById('sidebar-header');
                if (header) {
                    header.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
                    const s = header.querySelector('.sidebar-tab[data-view="search"]');
                    if (s) s.classList.add('active');
                }
                isSidebarVisible = true;
                sidebarContainer.style.display = 'flex';
                showSidebarPanel('search');
            } else if (view === 'extensions') {
                const header = document.getElementById('sidebar-header');
                if (header) {
                    header.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
                    const s = header.querySelector('.sidebar-tab[data-view="extensions"]');
                    if (s) s.classList.add('active');
                }
                isSidebarVisible = true;
                sidebarContainer.style.display = 'flex';
                showSidebarPanel('extensions');
            } else {
                isSidebarVisible = true;
                sidebarContainer.style.display = 'flex';
                alert(`「${icon.title}」機能は現在、エクスプローラー以外ダミーです。`);
            }
        });
    });
});
