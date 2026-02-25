/**
 * DXCode v1.1 - Professional Edition
 * Features: Monaco Editor, VFS, IndexedDB, DevTools, File Icons, and Enhanced Explorer.
 */

// -----------------------------------------------------
// 1. PWA & Service Worker
// -----------------------------------------------------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(e => console.error(e));
    });
}

let monacoEditor = null;
const virtualFileSystem = new Map();
let activeFile = null;

const DB_NAME = 'DXCodeDB';
const STORE_NAME = 'VFS';

// -----------------------------------------------------
// 2. Data Persistence (IndexedDB)
// -----------------------------------------------------
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME, { keyPath: 'fileName' });
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveProject() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    virtualFileSystem.forEach((model, fileName) => {
        store.put({ fileName: fileName, content: model.getValue() });
    });
    console.log('Project Saved');
}

async function loadProject() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
        if (request.result.length > 0) {
            request.result.forEach(item => createFile(item.fileName, item.content, false));
            setActiveFile(virtualFileSystem.keys().next().value);
        } else {
            createInitialFiles();
        }
    };
}

function createInitialFiles() {
    createFile('index.html', `<!DOCTYPE html>\n<html>\n<body>\n  <h1>DXCode IDE</h1>\n  <script src="script.js"></script>\n</body>\n</html>`, true);
    createFile('style.css', 'body { background: #1e1e1e; color: white; }');
    createFile('script.js', 'console.log("System Ready");');
    createFile('main.py', '# Python support added\nprint("Hello World")');
}

// -----------------------------------------------------
// 3. File System & Enhanced Explorer UI
// -----------------------------------------------------

// 拡張子に応じたアイコンを返す
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
        case 'html': return '<i class="fab fa-html5" style="color: #e34c26;"></i>';
        case 'css':  return '<i class="fab fa-css3-alt" style="color: #264de4;"></i>';
        case 'js':   return '<i class="fab fa-js-square" style="color: #f7df1e;"></i>';
        case 'py':   return '<i class="fab fa-python" style="color: #3776ab;"></i>';
        case 'json': return '<i class="fas fa-code" style="color: #fbc02d;"></i>';
        case 'md':   return '<i class="fab fa-markdown" style="color: #03a9f4;"></i>';
        default:     return '<i class="far fa-file" style="color: #ccc;"></i>';
    }
}

function getLanguage(fileName) {
    const ext = fileName.split('.').pop();
    if (ext === 'py') return 'python';
    if (ext === 'js') return 'javascript';
    return ext;
}

function createFile(fileName, content = '', activate = true) {
    if (virtualFileSystem.has(fileName)) return;
    const model = monaco.editor.createModel(content, getLanguage(fileName));
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
    
    const isHtml = activeFile?.endsWith('.html');
    previewBtn.style.display = isHtml ? 'block' : 'none';

    virtualFileSystem.forEach((model, fileName) => {
        const isActive = fileName === activeFile;

        // --- エクスプローラー項目の生成 ---
        const li = document.createElement('li');
        li.className = 'file-item' + (isActive ? ' active' : '');
        li.innerHTML = `
            <div class="indent-guide"></div>
            <span class="file-icon">${getFileIcon(fileName)}</span>
            <span class="file-name">${fileName}</span>
        `;
        li.onclick = () => setActiveFile(fileName);
        fileListEl.appendChild(li);

        // --- タブの生成 ---
        const tab = document.createElement('div');
        tab.className = 'tab' + (isActive ? ' active' : '');
        tab.innerHTML = `${getFileIcon(fileName)} ${fileName}`;
        tab.onclick = () => setActiveFile(fileName);
        tabBarEl.appendChild(tab);
    });
}

// -----------------------------------------------------
// 4. Preview Window (DevTools)
// -----------------------------------------------------
function openPreview() {
    const codeData = {
        html: virtualFileSystem.get('index.html')?.getValue() || '',
        css: virtualFileSystem.get('style.css')?.getValue() || '',
        js: virtualFileSystem.get('script.js')?.getValue() || ''
    };

    const win = window.open('about:blank', 'DXCode_Preview', 'width=1100,height=700');
    if (!win) return;

    const content = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>DXCode Preview</title>
            <style>
                body { margin: 0; transition: margin-right 0.3s; background: #fff; font-family: sans-serif; }
                #devtools {
                    position: fixed; top: 0; right: 0; width: 380px; height: 100%;
                    background: #202124; color: #bdc1c6; border-left: 1px solid #3c4043;
                    display: flex; flex-direction: column; z-index: 999;
                    transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                }
                #devtools.hidden { transform: translateX(380px); }
                #tabs { display: flex; background: #292a2d; font-size: 12px; border-bottom: 1px solid #3c4043; }
                .tab { padding: 10px 15px; cursor: pointer; }
                .tab.active { color: #8ab4f8; border-bottom: 2px solid #8ab4f8; }
                #content { flex-grow: 1; overflow: auto; padding: 10px; font-family: monospace; font-size: 12px; }
                .panel { display: none; } .panel.active { display: block; }
                #prompt { width: 100%; border: none; background: #35363a; color: #fff; padding: 10px; outline: none; border-top: 1px solid #3c4043; }
                #pull-tab {
                    position: absolute; top: 50%; left: -30px; transform: translateY(-50%);
                    background: #2d2d2d; color: white; border: none; border-radius: 10px 0 0 10px;
                    width: 30px; height: 60px; cursor: pointer; box-shadow: -2px 0 5px rgba(0,0,0,0.3);
                }
                .log { border-bottom: 1px solid #333; padding: 2px 0; }
                .node { margin-left: 15px; color: #8ab4f8; }
            </style>
        </head>
        <body>
            <div id="user-root">${codeData.html.replace(/<script.*?>.*?<\/script>/gs, '')}</div>
            <style>${codeData.css}</style>
            
            <div id="devtools">
                <button id="pull-tab">◀</button>
                <div id="tabs">
                    <div class="tab active" data-id="p-el">Elements</div>
                    <div class="tab" data-id="p-con">Console</div>
                </div>
                <div id="content">
                    <div id="p-el" class="panel active"></div>
                    <div id="p-con" class="panel"></div>
                </div>
                <input id="prompt" placeholder="> console.log('Hi')">
            </div>

            <script id="u-js" type="text/plain">${codeData.js}</script>
            <script>
                const dev = document.getElementById('devtools');
                const pull = document.getElementById('pull-tab');
                let open = true;
                
                pull.onclick = () => {
                    open = !open;
                    dev.classList.toggle('hidden');
                    document.body.style.marginRight = open ? '380px' : '0';
                    pull.textContent = open ? '▶' : '◀';
                };
                document.body.style.marginRight = '380px';

                document.querySelectorAll('.tab').forEach(t => {
                    t.onclick = () => {
                        document.querySelectorAll('.tab, .panel').forEach(el => el.classList.remove('active'));
                        t.classList.add('active');
                        document.getElementById(t.dataset.id).classList.add('active');
                        if(t.dataset.id === 'p-el') renderEl();
                    };
                });

                function renderEl() {
                    const root = document.getElementById('user-root');
                    const container = document.getElementById('p-el');
                    container.innerHTML = 'root<br>';
                    function walk(n, target) {
                        if(n.nodeType === 1) {
                            const d = document.createElement('div');
                            d.className = 'node';
                            d.textContent = '<' + n.tagName.toLowerCase() + '>';
                            target.appendChild(d);
                            n.childNodes.forEach(c => walk(c, d));
                        }
                    }
                    root.childNodes.forEach(c => walk(c, container));
                }

                const con = document.getElementById('p-con');
                function log(m, type='info') {
                    const d = document.createElement('div');
                    d.className = 'log';
                    d.textContent = m;
                    con.appendChild(d);
                    con.scrollTop = con.scrollHeight;
                }
                window.console.log = (m) => log(m);
                
                document.getElementById('prompt').onkeydown = (e) => {
                    if(e.key === 'Enter') {
                        const v = e.target.value;
                        log('> ' + v);
                        try { log('< ' + eval(v)); } catch(err) { log(err, 'error'); }
                        e.target.value = '';
                    }
                };

                window.onload = () => {
                    renderEl();
                    try { eval(document.getElementById('u-js').textContent); } catch(e) { console.error(e); }
                };
            </script>
        </body>
        </html>
    `;
    win.document.write(content);
    win.document.close();
}

// -----------------------------------------------------
// 5. Initialize
// -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            minimap: { enabled: false }
        });
        
        loadProject();
        
        document.getElementById('new-file-btn').onclick = () => {
            const name = prompt("File name (e.g. app.py):");
            if (name) createFile(name);
        };
        
        document.getElementById('preview-btn').onclick = openPreview;
        
        document.getElementById('download-zip-btn').onclick = () => {
            const zip = new JSZip();
            virtualFileSystem.forEach((m, f) => zip.file(f, m.getValue()));
            zip.generateAsync({type:"blob"}).then(c => saveAs(c, "dxcode_project.zip"));
        };

        monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveProject);
    });
});
