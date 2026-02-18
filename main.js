/**
 * DXCode v1.0 Full Logic
 */

let monacoEditor = null;
const virtualFileSystem = new Map(); // Map<fileName, monaco.editor.ITextModel>
let activeFile = null;

const DB_NAME = 'DXCodeDB';
const STORE_NAME = 'VFS';

// --- 1. IndexedDB 制御 ---
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME, { keyPath: 'fileName' });
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveToDB() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.clear();
    for (let [fileName, model] of virtualFileSystem) {
        store.put({ fileName, content: model.getValue() });
    }
}

async function loadFromDB() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const allFiles = await new Promise(res => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result);
    });

    if (allFiles.length > 0) {
        allFiles.forEach(f => createFile(f.fileName, f.content, false));
        setActiveFile(allFiles[0].fileName);
    } else {
        createFile('index.html', '<h1>Hello DXCode</h1>', true);
    }
}

// --- 2. ファイル & エディタ管理 ---
function getLang(file) {
    const ext = file.split('.').pop();
    return { html: 'html', js: 'javascript', css: 'css', json: 'json' }[ext] || 'plaintext';
}

function createFile(name, content = '', activate = true) {
    if (virtualFileSystem.has(name)) return;
    const model = monaco.editor.createModel(content, getLang(name));
    virtualFileSystem.set(name, model);
    updateSidebar();
    if (activate) setActiveFile(name);
}

function setActiveFile(name) {
    activeFile = name;
    monacoEditor.setModel(virtualFileSystem.get(name));
    updateUI();
}

function updateUI() {
    // タブの更新
    const tabBar = document.getElementById('tab-bar');
    tabBar.innerHTML = '';
    virtualFileSystem.forEach((_, name) => {
        const div = document.createElement('div');
        div.className = `tab ${name === activeFile ? 'active' : ''}`;
        div.textContent = name;
        div.onclick = () => setActiveFile(name);
        tabBar.appendChild(div);
    });

    // プレビューボタン表示切替
    document.getElementById('preview-btn').style.display = activeFile.endsWith('.html') ? 'block' : 'none';
    
    // サイドバーのハイライト
    updateSidebar();
}

function updateSidebar() {
    const list = document.getElementById('file-list');
    list.innerHTML = '';
    virtualFileSystem.forEach((_, name) => {
        const li = document.createElement('li');
        li.className = name === activeFile ? 'active' : '';
        li.innerHTML = `<i class="fas fa-file-code"></i> ${name}`;
        li.onclick = () => setActiveFile(name);
        list.appendChild(li);
    });
}

// --- 3. ZIPダウンロード機能 ---
async function downloadAsZip() {
    const zip = new JSZip();
    virtualFileSystem.forEach((model, name) => {
        zip.file(name, model.getValue());
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'dxcode_project.zip');
}

// --- 4. プレビュー実行 (仮想コンソール付き) ---
function runPreview() {
    const html = virtualFileSystem.get('index.html')?.getValue() || '';
    const css = virtualFileSystem.get('style.css')?.getValue() || '';
    const js = virtualFileSystem.get('script.js')?.getValue() || '';

    const previewWin = window.open('', '_blank');
    previewWin.document.write(`
        <html>
            <head><style>${css}</style></head>
            <body>
                ${html}
                <script>
                    console.log = (...args) => {
                        const msg = args.map(a => JSON.stringify(a)).join(' ');
                        const div = document.createElement('div');
                        div.style = "background:#333;color:#0f0;padding:5px;font-family:monospace;border-bottom:1px solid #555";
                        div.textContent = "> " + msg;
                        document.body.appendChild(div);
                    };
                    try { ${js} } catch(e) { console.log("Error: " + e.message); }
                </script>
            </body>
        </html>
    `);
    previewWin.document.close();
}

// --- 5. 初期化 ---
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' } });
require(['vs/editor/editor.main'], async () => {
    monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 14,
        minimap: { enabled: true }
    });

    // キー操作のバインド
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveToDB());
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => document.getElementById('new-file-btn').click());

    await loadFromDB();

    // イベントリスナー設定
    document.getElementById('new-file-btn').onclick = () => {
        const name = prompt("ファイル名を入力してください (例: style.css)");
        if (name) createFile(name);
    };

    document.getElementById('download-zip-btn').onclick = downloadAsZip;
    document.getElementById('preview-btn').onclick = runPreview;

    // メニュー制御
    document.querySelectorAll('.menu-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('visible'));
            item.querySelector('.dropdown-menu').classList.toggle('visible');
        };
    });

    window.onclick = () => document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('visible'));

    // メニュー内アクションの紐付け
    document.querySelectorAll('.menu-option').forEach(opt => {
        opt.onclick = () => {
            const action = opt.dataset.action;
            if (action === 'save') saveToDB();
            if (action === 'download-zip') downloadAsZip();
            if (action === 'open-preview') runPreview();
            if (action === 'new-file') document.getElementById('new-file-btn').click();
        };
    });
});
