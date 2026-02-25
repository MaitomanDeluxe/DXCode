let monacoEditor = null;
const virtualFileSystem = new Map();
let activeFile = null;

const DB_NAME = 'DXCodeDB';
const STORE_NAME = 'VFS';

// --- 1. IndexedDB Core ---
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
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    virtualFileSystem.forEach((model, fileName) => {
        store.put({ fileName, content: model.getValue() });
    });
    console.log("Project Saved to IndexedDB");
}

async function loadProject() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
        if (request.result.length === 0) {
            createFile('index.html', '<!DOCTYPE html>\n<html>\n<body>\n  <h1>Hello DXCode</h1>\n</body>\n</html>');
        } else {
            request.result.forEach(item => createFile(item.fileName, item.content));
        }
    };
}

// --- 2. File & Editor Management ---
function createFile(name, content = "") {
    if (virtualFileSystem.has(name)) return;
    const extension = name.split('.').pop();
    let lang = 'plaintext';
    if (extension === 'html') lang = 'html';
    if (extension === 'js') lang = 'javascript';
    if (extension === 'css') lang = 'css';

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
        li.innerHTML = `<i class="far fa-file-code" style="margin-right:8px;"></i> ${name}`;
        li.onclick = () => setActiveFile(name);
        list.appendChild(li);
    });
}

function setActiveFile(name) {
    activeFile = name;
    const model = virtualFileSystem.get(name);
    monacoEditor.setModel(model);
    
    // Preview Button Toggle
    document.getElementById('preview-btn').style.display = name.endsWith('.html') ? 'inline-block' : 'none';
    
    updateFileList();
    updateTabs();
}

function updateTabs() {
    const tabBar = document.getElementById('tab-bar');
    tabBar.innerHTML = '';
    if (activeFile) {
        const tab = document.createElement('div');
        tab.className = 'tab active';
        tab.textContent = activeFile;
        tabBar.appendChild(tab);
    }
}

// --- 3. Toolbar & Panels Logic ---
function setupActivityBar() {
    const activityIcons = document.querySelectorAll('.activity-icon');
    const sidebarViews = document.querySelectorAll('.sidebar-view');
    const sidebarHeader = document.getElementById('sidebar-header');

    const titles = {
        'explorer': 'エクスプローラー',
        'search': '検索',
        'source-control': 'ソース管理',
        'run': '実行とデバッグ',
        'extensions': '拡張機能'
    };

    activityIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            activityIcons.forEach(i => i.classList.remove('active'));
            icon.classList.add('active');

            const view = icon.dataset.view;
            sidebarHeader.textContent = titles[view];
            sidebarViews.forEach(v => v.style.display = 'none');
            document.getElementById(`view-${view}`).style.display = 'block';
        });
    });

    // --- Search Feature ---
    document.getElementById('search-btn').onclick = () => {
        const q = document.getElementById('search-input').value.toLowerCase();
        const results = document.getElementById('search-results');
        results.innerHTML = '';
        if (!q) return;

        virtualFileSystem.forEach((model, name) => {
            if (model.getValue().toLowerCase().includes(q)) {
                const li = document.createElement('li');
                li.style.cssText = "padding:5px; cursor:pointer; border-bottom:1px solid #333;";
                li.innerHTML = `<i class="fas fa-file"></i> ${name}`;
                li.onclick = () => setActiveFile(name);
                results.appendChild(li);
            }
        });
    };

    // --- Extension Features ---
    document.getElementById('ext-format-btn').onclick = () => {
        monacoEditor.getAction('editor.action.formatDocument').run();
    };

    let isHC = false;
    document.getElementById('ext-theme-btn').onclick = () => {
        isHC = !isHC;
        monaco.editor.setTheme(isHC ? 'hc-black' : 'vs-dark');
    };
    
    // Source Control
    document.getElementById('force-save-btn').onclick = () => {
        saveProject();
        alert('Saved!');
    };

    // Run Preview
    const runAction = () => {
        const html = virtualFileSystem.get('index.html')?.getValue() || "<h1>No index.html</h1>";
        const win = window.open();
        win.document.write(html);
        win.document.close();
    };
    document.getElementById('preview-btn').onclick = runAction;
    document.getElementById('sidebar-run-btn').onclick = runAction;
}

// --- 4. Initialization ---
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
        setupActivityBar();

        document.getElementById('new-file-btn').onclick = () => {
            const n = prompt("File name (e.g. style.css):");
            if (n) createFile(n);
        };

        // FPS Counter Dummy
        setInterval(() => {
            document.getElementById('fps-counter').textContent = `FPS: ${55 + Math.floor(Math.random() * 6)}`;
        }, 1000);
        
        // Ctrl+S binding
        window.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveProject();
            }
        });
    });
});
