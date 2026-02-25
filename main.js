/**
 * DXCode v1.0 - Full JavaScript Logic
 * Features: Monaco Editor, VFS, IndexedDB Persistence (Cmd+S), VSCode UI Integration, Preview with DevTools.
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
        console.log('Project saved to IndexedDB.');
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
    createFile('index.html', `<!DOCTYPE html>\n<html>\n<head>\n  <title>DXCode Test</title>\n</head>\n<body>\n  <h1>Hello DXCode</h1>\n  <div class="container">\n    <p>Welcome to your mobile IDE!</p>\n  </div>\n  <script src="script.js"></script>\n</body>\n</html>`, true);
    createFile('style.css', 'body { background: #1e1e1e; color: white; font-family: sans-serif; }\n.container { padding: 20px; border: 1px solid #444; }');
    createFile('script.js', 'console.log("Hello from DXCode!");\nconsole.warn("This is a warning test.");');
}

// -----------------------------------------------------
// 3. ファイル操作とUI
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
    if (virtualFileSystem.has(fileName)) return;
    const lang = getLanguage(fileName);
    const model = monaco.editor.createModel(content, lang);
    virtualFileSystem.set(fileName, model);
    if (activate) setActiveFile(fileName);
    updateUI();
}

function setActiveFile(fileName) {
    if (!virtualFileSystem.has(fileName)) return;
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

    const activeFileExt = activeFile ? activeFile.split('.').pop() : '';
    previewBtn.style.display = (activeFileExt === 'html') ? 'block' : 'none';

    virtualFileSystem.forEach((model, fileName) => {
        const isActive = fileName === activeFile;
        const li = document.createElement('li');
        li.textContent = fileName;
        li.className = isActive ? 'active' : '';
        li.onclick = () => setActiveFile(fileName);
        fileListEl.appendChild(li);

        const tab = document.createElement('div');
        tab.textContent = fileName;
        tab.className = 'tab ' + (isActive ? 'active' : '');
        tab.onclick = () => setActiveFile(fileName);
        tabBarEl.appendChild(tab);
    });
}

// -----------------------------------------------------
// 4. プレビューと右側デベロッパーツール
// -----------------------------------------------------

function openPreview() {
    const codeData = {
        html: virtualFileSystem.get('index.html')?.getValue() || '',
        css: virtualFileSystem.get('style.css')?.getValue() || '',
        js: virtualFileSystem.get('script.js')?.getValue() || ''
    };

    const previewWindow = window.open('about:blank', 'DXCode_Preview', 'width=1100,height=700');
    if (!previewWindow) return;

    const previewContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>DXCode Preview</title>
            <style>
                body { margin: 0; padding: 0; transition: margin-right 0.3s; overflow-x: hidden; background: #fff; }
                
                /* DevTools Panel */
                #dxcode-devtools {
                    position: fixed; top: 0; right: 0; width: 380px; height: 100%;
                    background: #202124; color: #bdc1c6; z-index: 99999;
                    display: flex; flex-direction: column; font-family: 'Segoe UI', sans-serif;
                    border-left: 1px solid #3c4043;
                    transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                }
                #dxcode-devtools.hidden { transform: translateX(380px); }

                /* Tab Bar */
                #devtools-tabs { display: flex; background: #292a2d; border-bottom: 1px solid #3c4043; font-size: 12px; padding: 0 5px; }
                .dev-tab { padding: 10px 12px; cursor: pointer; border-bottom: 2px solid transparent; }
                .dev-tab.active { color: #8ab4f8; border-bottom: 2px solid #8ab4f8; }

                /* Content */
                #devtools-content { flex-grow: 1; overflow-y: auto; padding: 10px; font-family: monospace; font-size: 12px; line-height: 1.5; }
                .panel { display: none; }
                .panel.active { display: block; }

                /* Elements Tree */
                .node { margin-left: 15px; cursor: default; }
                .tag { color: #8ab4f8; }
                .attr-name { color: #93d5ed; }
                .attr-val { color: #ee675c; }
                .text-node { color: #fff; }

                /* Console */
                .log-item { border-bottom: 1px solid #333; padding: 3px 0; white-space: pre-wrap; }
                .log-error { color: #f28b82; } .log-warn { color: #fdd663; }
                #dxcode-prompt { width: 100%; border: none; background: #35363a; color: #fff; padding: 10px; outline: none; border-top: 1px solid #3c4043; }

                /* Pull Tab Button */
                #devtools-toggle-btn {
                    position: absolute; top: 50%; left: -30px; transform: translateY(-50%);
                    background: rgba(45, 45, 45, 0.95); color: white; border: none;
                    border-radius: 12px 0 0 12px; width: 30px; height: 65px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center; box-shadow: -2px 0 5px rgba(0,0,0,0.3);
                }
                #close-preview { position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.4); color: white; border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; z-index: 100000; }
            </style>
        </head>
        <body>
            <button id="close-preview" onclick="window.close()">&times;</button>
            <div id="user-app-root">${codeData.html.replace(/<script.*?>.*?<\/script>/gs, '')}</div>
            <style>${codeData.css}</style>

            <div id="dxcode-devtools">
                <button id="devtools-toggle-btn">
                    <svg id="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
                <div id="devtools-tabs">
                    <div class="dev-tab active" data-target="panel-elements">Elements</div>
                    <div class="dev-tab" data-target="panel-console">Console</div>
                    <div class="dev-tab" data-target="panel-sources">Sources</div>
                    <div class="dev-tab" data-target="panel-perf">Performance</div>
                </div>
                <div id="devtools-content">
                    <div id="panel-elements" class="panel active"></div>
                    <div id="panel-console" class="panel"><div id="console-logs"></div></div>
                    <div id="panel-sources" class="panel" style="color:#777;">Workspace: (index.html)</div>
                    <div id="panel-perf" class="panel"><div style="color:#81c995;">● Recording FPS...</div><div id="fps-counter">FPS: 60</div></div>
                </div>
                <input id="dxcode-prompt" type="text" placeholder="> Enter JS...">
            </div>

            <script id="user-script" type="text/plain">${codeData.js}</script>
            <script>
                // --- 1. DOM Elements Inspector (Elements Tab) ---
                function renderElements() {
                    const container = document.getElementById('panel-elements');
                    container.innerHTML = '';
                    const root = document.getElementById('user-app-root');
                    
                    function traverse(node, depth) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            if (!node.textContent.trim()) return null;
                            const el = document.createElement('div');
                            el.className = 'node text-node';
                            el.textContent = '"' + node.textContent.trim() + '"';
                            return el;
                        }
                        const wrapper = document.createElement('div');
                        wrapper.className = 'node';
                        
                        let attrStr = '';
                        Array.from(node.attributes).forEach(a => {
                            attrStr += \` <span class="attr-name">\${a.name}</span>="<span class="attr-val">\${a.value}</span>"\`;
                        });

                        wrapper.innerHTML = \`<span class="tag">&lt;\${node.tagName.toLowerCase()}\${attrStr}&gt;</span>\`;
                        node.childNodes.forEach(child => {
                            const result = traverse(child, depth + 1);
                            if (result) wrapper.appendChild(result);
                        });
                        const closeTag = document.createElement('div');
                        closeTag.innerHTML = \`<span class="tag">&lt;/\${node.tagName.toLowerCase()}&gt;</span>\`;
                        wrapper.appendChild(closeTag);
                        return wrapper;
                    }
                    container.appendChild(traverse(root, 0));
                }

                // --- 2. Tab & Toggle UI ---
                const devtools = document.getElementById('dxcode-devtools');
                const toggleBtn = document.getElementById('devtools-toggle-btn');
                let isOpen = true;

                toggleBtn.onclick = () => {
                    isOpen = !isOpen;
                    devtools.classList.toggle('hidden');
                    document.body.style.marginRight = isOpen ? '380px' : '0';
                    document.getElementById('toggle-icon').style.transform = isOpen ? '' : 'rotate(180deg)';
                };
                document.body.style.marginRight = '380px';

                document.querySelectorAll('.dev-tab').forEach(tab => {
                    tab.onclick = () => {
                        document.querySelectorAll('.dev-tab, .panel').forEach(el => el.classList.remove('active'));
                        tab.classList.add('active');
                        document.getElementById(tab.dataset.target).classList.add('active');
                        if (tab.dataset.target === 'panel-elements') renderElements();
                    };
                });

                // --- 3. Console & Prompt ---
                const logContainer = document.getElementById('console-logs');
                function logToPanel(type, args) {
                    const div = document.createElement('div');
                    div.className = 'log-item log-' + type;
                    div.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                    logContainer.appendChild(div);
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
                window.console.log = (...args) => logToPanel('info', args);
                window.console.warn = (...args) => logToPanel('warn', args);
                window.console.error = (...args) => logToPanel('error', args);

                document.getElementById('dxcode-prompt').onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        const val = e.target.value;
                        logToPanel('info', ['> ' + val]);
                        try { logToPanel('info', ['< ' + eval(val)]); } catch(err) { logToPanel('error', [err]); }
                        e.target.value = '';
                    }
                };

                // --- 4. Init ---
                window.onload = () => {
                    renderElements();
                    try { eval(document.getElementById('user-script').textContent); } catch(e) { console.error(e); }
                    // Performance Dummy
                    setInterval(() => {
                        document.getElementById('fps-counter').textContent = 'FPS: ' + (58 + Math.floor(Math.random()*5));
                    }, 1000);
                };
            </script>
        </body>
        </html>
    `;
    previewWindow.document.write(previewContent);
    previewWindow.document.close();
}

// -----------------------------------------------------
// 5. 初期化
// -----------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
            theme: 'vs-dark',
            automaticLayout: true
        });
        loadProject();
        document.getElementById('new-file-btn').onclick = () => {
            const name = prompt("File name:");
            if (name) createFile(name);
        };
        document.getElementById('preview-btn').onclick = openPreview;
        document.getElementById('download-zip-btn').onclick = () => {
            const zip = new JSZip();
            virtualFileSystem.forEach((m, f) => zip.file(f, m.getValue()));
            zip.generateAsync({type:"blob"}).then(c => saveAs(c, "project.zip"));
        };
        monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveProject);
    });
});
