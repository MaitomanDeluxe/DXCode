/**
 * DXCode v1.2 - Mobile Optimized & Extensible
 */

let monacoEditor = null;
const virtualFileSystem = new Map();
let activeFile = null;

// --- 1. 初期化 & Monaco設定 ---
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' } });
require(['vs/editor/editor.main'], async () => {
    monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 16, // iPadで見やすいサイズ
        tabSize: 2,
        minimap: { enabled: false }, // モバイルでは非表示推奨
        fixedOverflowWidgets: true
    });

    // カーソル位置の表示更新
    monacoEditor.onDidChangeCursorPosition(e => {
        document.getElementById('status-pos').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    setupAppEvents();
    await loadFromDB(); // IndexedDBから復元
    updateUI();
});

// --- 2. ファイルシステム & UI制御 ---
function createFile(name, content = '', activate = true) {
    if (!name || virtualFileSystem.has(name)) return;
    const ext = name.split('.').pop();
    const lang = { html:'html', js:'javascript', css:'css', xml:'xml' }[ext] || 'plaintext';
    
    const model = monaco.editor.createModel(content, lang);
    virtualFileSystem.set(name, model);
    if (activate) setActiveFile(name);
    updateUI();
}

function deleteFile(name) {
    if (confirm(`${name} を削除しますか？`)) {
        virtualFileSystem.delete(name);
        if (activeFile === name) {
            activeFile = virtualFileSystem.keys().next().value || null;
            if (activeFile) monacoEditor.setModel(virtualFileSystem.get(activeFile));
        }
        updateUI();
        saveToDB();
    }
}

function setActiveFile(name) {
    activeFile = name;
    monacoEditor.setModel(virtualFileSystem.get(name));
    updateUI();
}

function updateUI() {
    const list = document.getElementById('file-list');
    const tabBar = document.getElementById('tab-bar');
    list.innerHTML = '';
    tabBar.innerHTML = '';

    virtualFileSystem.forEach((model, name) => {
        // サイドバーリスト
        const li = document.createElement('li');
        li.className = name === activeFile ? 'active' : '';
        li.innerHTML = `
            <span><i class="far fa-file"></i> ${name}</span>
            <div class="file-ops"><i class="fas fa-trash-alt" onclick="deleteFile('${name}')"></i></div>
        `;
        li.onclick = (e) => { if(e.target.tagName !== 'I') setActiveFile(name); };
        list.appendChild(li);

        // タブ
        const tab = document.createElement('div');
        tab.className = `tab ${name === activeFile ? 'active' : ''}`;
        tab.textContent = name;
        tab.onclick = () => setActiveFile(name);
        tabBar.appendChild(tab);
    });
}

// --- 3. 検索機能 ---
function setupSearch() {
    const searchInput = document.getElementById('global-search');
    const results = document.getElementById('search-results');

    searchInput.oninput = () => {
        const query = searchInput.value.toLowerCase();
        results.innerHTML = '';
        if (!query) return;

        virtualFileSystem.forEach((model, name) => {
            if (model.getValue().toLowerCase().includes(query)) {
                const item = document.createElement('div');
                item.className = 'ext-item'; // スタイル流用
                item.innerHTML = `<i class="fas fa-search"></i> ${name}`;
                item.onclick = () => setActiveFile(name);
                results.appendChild(item);
            }
        });
    };
}

// --- 4. テーマ & XML拡張の土台 ---
function setupExtensions() {
    // 標準テーマ切り替え
    document.querySelectorAll('.theme-opt').forEach(opt => {
        opt.onclick = () => monaco.editor.setTheme(opt.dataset.theme);
    });

    // XMLテーマファイル読み込み
    document.getElementById('theme-loader').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        parseXmlTheme(text);
    };
}

function parseXmlTheme(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    
    // 将来的にここでxmlDocから色情報を抽出し
    // monaco.editor.defineTheme('custom', { ... }) を実行する
    alert("XML解析を開始します: " + xmlDoc.documentElement.nodeName);
}

// --- 5. イベント一括設定 ---
function setupAppEvents() {
    // アクティビティバー切り替え
    document.querySelectorAll('.activity-icon').forEach(icon => {
        icon.onclick = () => {
            document.querySelectorAll('.activity-icon, .sidebar-view').forEach(el => el.classList.remove('active'));
            icon.classList.add('active');
            document.getElementById(`view-${icon.dataset.view}`).classList.add('active');
            document.getElementById('header-title').textContent = icon.title;
        };
    });

    // ファイル追加
    document.getElementById('new-file-icon').onclick = () => {
        const name = prompt("ファイル名を入力:");
        if (name) createFile(name);
    };

    // ZIP保存
    document.getElementById('zip-icon').onclick = async () => {
        const zip = new JSZip();
        virtualFileSystem.forEach((m, n) => zip.file(n, m.getValue()));
        const blob = await zip.generateAsync({type:"blob"});
        saveAs(blob, "project.zip");
    };

    setupSearch();
    setupExtensions();
}

// --- 6. IndexedDB (永続化) ---
async function saveToDB() {
    const request = indexedDB.open("DXCodeDB", 1);
    request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction("VFS", "readwrite");
        const store = tx.objectStore("VFS");
        store.clear();
        virtualFileSystem.forEach((m, n) => store.put({ fileName: n, content: m.getValue() }));
    };
}

async function loadFromDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open("DXCodeDB", 1);
        request.onupgradeneeded = (e) => e.target.result.createObjectStore("VFS", { keyPath: "fileName" });
        request.onsuccess = (e) => {
            const store = e.target.result.transaction("VFS", "readonly").objectStore("VFS");
            store.getAll().onsuccess = (ev) => {
                const files = ev.target.result;
                if (files.length > 0) {
                    files.forEach(f => createFile(f.fileName, f.content, false));
                    setActiveFile(files[0].fileName);
                } else {
                    createFile('index.html', '<h1>Welcome</h1>');
                }
                resolve();
            };
        };
    });
}
