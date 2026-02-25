let monacoEditor = null;
const virtualFileSystem = new Map();
let activeFile = null;

// --- 1. IndexedDB 連携 ---
const DB_NAME = 'DXCodeDB';
const STORE_NAME = 'VFS';

function openDB() {
    return new Promise((r) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME, { keyPath: 'fileName' });
        req.onsuccess = (e) => r(e.target.result);
    });
}

async function saveProject() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    virtualFileSystem.forEach((model, fileName) => {
        tx.objectStore(STORE_NAME).put({ fileName, content: model.getValue() });
    });
}

async function loadProject() {
    const db = await openDB();
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
        if (req.result.length === 0) {
            createFile('index.html', '<!DOCTYPE html>\n<html>\n<body>\n  <h1>Hello DXCode</h1>\n  <script>\n    console.log("エディタのコンソールに表示されます！");\n    console.error("エラーも取得可能です。");\n  </script>\n</body>\n</html>');
        } else {
            req.result.forEach(f => createFile(f.fileName, f.content));
        }
    };
}

// --- 2. ファイル & エディタ管理 ---
function createFile(name, content = "") {
    if (virtualFileSystem.has(name)) return;
    const ext = name.split('.').pop();
    const lang = ext === 'html' ? 'html' : ext === 'js' ? 'javascript' : ext === 'css' ? 'css' : 'plaintext';
    const model = monaco.editor.createModel(content, lang);
    virtualFileSystem.set(name, model);
    updateFileList();
    setActiveFile(name);
}

function updateFileList() {
    const list = document.getElementById('file-list');
    list.innerHTML = '';
    virtualFileSystem.forEach((_, name) => {
        const li = document.createElement('li');
        li.className = `file-item ${activeFile === name ? 'active' : ''}`;
        li.textContent = name;
        li.onclick = () => setActiveFile(name);
        list.appendChild(li);
    });
}

function setActiveFile(name) {
    activeFile = name;
    monacoEditor.setModel(virtualFileSystem.get(name));
    document.getElementById('preview-btn').style.display = name.endsWith('.html') ? 'inline-block' : 'none';
    updateFileList();
    const tabBar = document.getElementById('tab-bar');
    tabBar.innerHTML = `<div class="tab active">${name}</div>`;
}

// --- 3. プレビュー & コンソール通信 ---
function openPreview() {
    const html = virtualFileSystem.get('index.html')?.getValue() || "";
    // ログを親に転送するスクリプトを注入
    const hook = `
        <script>
            (function(){
                const send = (type, args) => {
                    window.opener.postMessage({
                        type: 'dev-log', logType: type,
                        content: Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
                    }, '*');
                };
                console.log = function(){ send('info', arguments); };
                console.error = function(){ send('error', arguments); };
                console.warn = function(){ send('warn', arguments); };
                window.onerror = function(m, u, l){ send('error', ['Error: ' + m + ' (Line: ' + l + ')']); };
            })();
        </script>
    `;
    const win = window.open();
    win.document.write(hook + html);
    win.document.close();
    // コンソールパネルを表示
    document.getElementById('bottom-panel').style.display = 'flex';
}

window.addEventListener('message', (e) => {
    if (e.data.type === 'dev-log') {
        const out = document.getElementById('console-output');
        const div = document.createElement('div');
        div.className = `log-item log-${e.data.logType}`;
        div.textContent = `[${new Date().toLocaleTimeString()}] ${e.data.content}`;
        out.appendChild(div);
        out.scrollTop = out.scrollHeight;
    }
});

// --- 4. ツールバー機能の初期化 ---
function initToolbar() {
    document.querySelectorAll('.activity-icon').forEach(icon => {
        icon.onclick = () => {
            document.querySelectorAll('.activity-icon').forEach(i => i.classList.remove('active'));
            icon.classList.add('active');
            const view = icon.dataset.view;
            document.getElementById('sidebar-header').textContent = icon.title;
            document.querySelectorAll('.sidebar-view').forEach(v => v.style.display = 'none');
            document.getElementById(`view-${view}`).style.display = 'block';
        };
    });

    document.getElementById('search-btn').onclick = () => {
        const q = document.getElementById('search-input').value.toLowerCase();
        const res = document.getElementById('search-results');
        res.innerHTML = '';
        if (!q) return;
        virtualFileSystem.forEach((m, name) => {
            if (m.getValue().toLowerCase().includes(q)) {
                const li = document.createElement('li');
                li.style.cssText = "padding:5px; cursor:pointer; font-size:12px; border-bottom:1px solid #333;";
                li.textContent = name;
                li.onclick = () => setActiveFile(name);
                res.appendChild(li);
            }
        });
    };

    document.getElementById('ext-format-btn').onclick = () => monacoEditor.getAction('editor.action.formatDocument').run();
    document.getElementById('clear-console-btn').onclick = () => document.getElementById('console-output').innerHTML = '';
    document.getElementById('close-panel-btn').onclick = () => document.getElementById('bottom-panel').style.display = 'none';
    document.getElementById('preview-btn').onclick = openPreview;
    document.getElementById('sidebar-run-btn').onclick = openPreview;
}

// --- 5. メイン初期化 ---
document.addEventListener('DOMContentLoaded', () => {
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
            theme: 'vs-dark', automaticLayout: true, fontSize: 14, minimap: { enabled: false }
        });
        loadProject();
        initToolbar();
        
        document.getElementById('new-file-btn').onclick = () => {
            const n = prompt("File name:");
            if (n) createFile(n);
        };

        document.getElementById('download-zip-btn').onclick = () => {
            const zip = new JSZip();
            virtualFileSystem.forEach((m, f) => zip.file(f, m.getValue()));
            zip.generateAsync({type:"blob"}).then(c => saveAs(c, "dxcode_project.zip"));
        };

        window.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveProject(); }
        });

        setInterval(() => {
            document.getElementById('fps-counter').textContent = `FPS: ${58 + Math.floor(Math.random()*5)}`;
        }, 1000);
    });
});
