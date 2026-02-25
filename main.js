/**
 * DXCode v1.3 - Ultimate Integrated Edition
 * デザイン、安定性、デベロッパーツールを完全統合
 */

// --- 1. PWA Setup ---
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

// --- 2. DB Logic ---
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
    createFile('index.html', `<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>DXCode Preview</title>\n</head>\n<body>\n  <h1>DXCode IDE Ready</h1>\n  <p>Enjoy coding!</p>\n  <script src="script.js"></script>\n</body>\n</html>`, true);
    createFile('style.css', 'body { background: #f4f4f4; font-family: sans-serif; text-align: center; padding-top: 50px; }');
    createFile('script.js', 'console.log("Welcome to DXCode DevTools!");\nconsole.warn("Performance check: stable.");');
    createFile('app.py', 'print("Python Support Demo")');
}

// --- 3. Explorer & File UI ---
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
        case 'html': return '<i class="fab fa-html5" style="color: #e34c26;"></i>';
        case 'css':  return '<i class="fab fa-css3-alt" style="color: #264de4;"></i>';
        case 'js':   return '<i class="fab fa-js-square" style="color: #f7df1e;"></i>';
        case 'py':   return '<i class="fab fa-python" style="color: #3776ab;"></i>';
        case 'json': return '<i class="fas fa-code" style="color: #fbc02d;"></i>';
        default:     return '<i class="far fa-file" style="color: #888;"></i>';
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

        const li = document.createElement('li');
        li.className = 'file-item' + (isActive ? ' active' : '');
        li.innerHTML = `<div class="indent-guide"></div><span class="file-icon">${getFileIcon(fileName)}</span><span class="file-name">${fileName}</span>`;
        li.onclick = () => setActiveFile(fileName);
        fileListEl.appendChild(li);

        const tab = document.createElement('div');
        tab.className = 'tab' + (isActive ? ' active' : '');
        tab.innerHTML = `<span style="margin-right:6px">${getFileIcon(fileName)}</span> ${fileName}`;
        tab.onclick = () => setActiveFile(fileName);
        tabBarEl.appendChild(tab);
    });
}

// --- 4. Robust Preview with DevTools ---
function openPreview() {
    const html = virtualFileSystem.get('index.html')?.getValue() || '';
    const css = virtualFileSystem.get('style.css')?.getValue() || '';
    const js = virtualFileSystem.get('script.js')?.getValue() || '';

    const win = window.open('about:blank', 'DXCode_Preview', 'width=1100,height=700');
    if (!win) { alert("Pop-up blocked!"); return; }

    const content = `
        <!DOCTYPE html>
        <html>
        <head>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
            <style>
                html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; display: flex; background: #fff; }
                #viewport { flex-grow: 1; height: 100%; overflow: auto; transition: margin-right 0.3s; position: relative; }
                #devtools {
                    position: fixed; top: 0; right: 0; width: 380px; height: 100%;
                    background: #202124; color: #bdc1c6; border-left: 1px solid #3c4043;
                    display: flex; flex-direction: column; z-index: 10000;
                    transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                    font-family: 'Segoe UI', sans-serif;
                }
                #devtools.hidden { transform: translateX(380px); }
                #tabs { display: flex; background: #292a2d; font-size: 12px; border-bottom: 1px solid #3c4043; }
                .tab { padding: 12px 15px; cursor: pointer; color: #9aa0a6; }
                .tab.active { color: #8ab4f8; border-bottom: 2px solid #8ab4f8; background: #35363a; }
                #panels { flex-grow: 1; overflow: auto; padding: 10px; font-family: monospace; font-size: 12px; }
                .panel { display: none; } .panel.active { display: block; }
                #prompt { width: 100%; border: none; background: #35363a; color: #fff; padding: 12px; outline: none; border-top: 1px solid #3c4043; font-family: monospace; }
                #toggle {
                    position: absolute; top: 50%; left: -30px; transform: translateY(-50%);
                    background: #202124; color: #8ab4f8; border: 1px solid #3c4043; border-right: none;
                    width: 30px; height: 60px; cursor: pointer; border-radius: 8px 0 0 8px;
                }
                .log { border-bottom: 1px solid #333; padding: 4px 0; word-break: break-all; }
                .log-warn { color: #fdd663; } .log-error { color: #f28b82; }
                .node { margin-left: 12px; border-left: 1px dotted #444; padding-left: 8px; }
            </style>
        </head>
        <body>
            <div id="viewport">
                <div id="user-html">${html}</div>
                <style>${css}</style>
            </div>
            <div id="devtools">
                <button id="toggle">◀</button>
                <div id="tabs">
                    <div class="tab active" data-id="el">Elements</div>
                    <div class="tab" data-id="con">Console</div>
                </div>
                <div id="panels">
                    <div id="el" class="panel active"></div>
                    <div id="con" class="panel"></div>
                </div>
                <input id="prompt" placeholder="> console.log('Hello')">
            </div>
            <script>
                const dev = document.getElementById('devtools');
                const port = document.getElementById('viewport');
                const tog = document.getElementById('toggle');
                let open = true;
                tog.onclick = () => {
                    open = !open;
                    dev.classList.toggle('hidden');
                    port.style.marginRight = open ? '380px' : '0';
                    tog.textContent = open ? '▶' : '◀';
                };
                port.style.marginRight = '380px';

                document.querySelectorAll('.tab').forEach(t => {
                    t.onclick = () => {
                        document.querySelectorAll('.tab, .panel').forEach(e => e.classList.remove('active'));
                        t.classList.add('active');
                        document.getElementById(t.dataset.id).classList.add('active');
                        if(t.dataset.id === 'el') drawEl();
                    };
                });

                function drawEl() {
                    const out = document.getElementById('el'); out.innerHTML = '';
                    function walk(n) {
                        if(n.nodeType === 3 && n.textContent.trim()) {
                            const d = document.createElement('div'); d.className='node';
                            d.textContent = n.textContent.trim(); return d;
                        }
                        if(n.nodeType !== 1) return null;
                        const w = document.createElement('div'); w.className='node';
                        w.innerHTML = '<span style="color:#8ab4f8">&lt;' + n.tagName.toLowerCase() + '&gt;</span>';
                        n.childNodes.forEach(c => { const r = walk(c); if(r) w.appendChild(r); });
                        const cl = document.createElement('div');
                        cl.innerHTML = '<span style="color:#8ab4f8">&lt;/' + n.tagName.toLowerCase() + '&gt;</span>';
                        w.appendChild(cl); return w;
                    }
                    out.appendChild(walk(document.getElementById('user-html')));
                }

                const conOut = document.getElementById('con');
                function log(m, type='info') {
                    const d = document.createElement('div'); d.className = 'log log-'+type;
                    d.textContent = (typeof m === 'object') ? JSON.stringify(m) : m;
                    conOut.appendChild(d); conOut.scrollTop = conOut.scrollHeight;
                }
                window.console.log = (m) => log(m);
                window.console.warn = (m) => log(m, 'warn');
                window.console.error = (m) => log(m, 'error');

                document.getElementById('prompt').onkeydown = (e) => {
                    if(e.key === 'Enter') {
                        const v = e.target.value; log('> ' + v);
                        try { const r = eval(v); if(r!==undefined) log('< ' + r); }
                        catch(err) { log(err, 'error'); }
                        e.target.value = '';
                    }
                };
                window.onload = () => {
                    drawEl();
                    try {
                        const s = document.createElement('script');
                        s.textContent = \`${js.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
                        document.body.appendChild(s);
                    } catch(err) { console.error(err); }
                };
            </script>
        </body>
        </html>
    `;
    win.document.write(content); win.document.close();
}

// --- 5. Init ---
document.addEventListener('DOMContentLoaded', () => {
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
            theme: 'vs-dark', automaticLayout: true, fontSize: 14, minimap: { enabled: false }
        });
        loadProject();
        document.getElementById('new-file-btn').onclick = () => {
            const n = prompt("File name:"); if(n) createFile(n);
        };
        document.getElementById('preview-btn').onclick = openPreview;
        document.getElementById('download-zip-btn').onclick = () => {
            const z = new JSZip(); virtualFileSystem.forEach((m, f) => z.file(f, m.getValue()));
            z.generateAsync({type:"blob"}).then(c => saveAs(c, "project.zip"));
        };
        monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveProject);
    });
});
