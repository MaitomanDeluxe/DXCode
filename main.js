/**
 * DXCode Pro - iPad Optimized Logic
 */

let monacoEditor = null;
const virtualFileSystem = new Map();
let activeFile = null;

// --- 1. Monaco Editor Initialization ---
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' } });
require(['vs/editor/editor.main'], async () => {
    monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 16, // iPad用
        fontFamily: "'Fira Code', 'Cascadia Code', monospace",
        tabSize: 2,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        padding: { top: 10 }
    });

    monacoEditor.onDidChangeCursorPosition(e => {
        document.getElementById('status-pos').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    setupApp();
    await loadProject();
});

// --- 2. Core App Logic ---
function setupApp() {
    // Activity Bar Switching
    document.querySelectorAll('.activity-icon').forEach(icon => {
        icon.addEventListener('click', () => {
            document.querySelectorAll('.activity-icon, .sidebar-view').forEach(el => el.classList.remove('active'));
            icon.classList.add('active');
            const view = document.getElementById(`view-${icon.dataset.view}`);
            if(view) view.classList.add('active');
            document.getElementById('header-title').textContent = icon.title.toUpperCase();
        });
    });

    // Theme Switcher
    document.querySelectorAll('.theme-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.theme-opt').forEach(el => el.classList.remove('active'));
            opt.classList.add('active');
            monaco.editor.setTheme(opt.dataset.theme);
        });
    });

    // File Creation
    document.getElementById('new-file-icon').addEventListener('click', () => {
        const name = prompt("New File Name (e.g. style.css):");
        if(name) createFile(name);
    });

    // XML Theme Loader
    document.getElementById('theme-loader').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const xmlText = await file.text();
        console.log("XML Theme Loaded:", xmlText);
        alert("XML Theme parser triggered! Implementation pending for tags.");
    });
}

function createFile(name, content = '', activate = true) {
    if (virtualFileSystem.has(name)) return;
    const ext = name.split('.').pop();
    const langMap = { 'html': 'html', 'js': 'javascript', 'css': 'css', 'json': 'json', 'xml': 'xml' };
    const model = monaco.editor.createModel(content, langMap[ext] || 'plaintext');
    virtualFileSystem.set(name, model);
    if (activate) setActiveFile(name);
    updateUI();
    saveProject();
}

function setActiveFile(name) {
    activeFile = name;
    monacoEditor.setModel(virtualFileSystem.get(name));
    updateUI();
}

function updateUI() {
    const list = document.getElementById('file-list');
    const tabs = document.getElementById('tab-bar');
    list.innerHTML = '';
    tabs.innerHTML = '';

    virtualFileSystem.forEach((model, name) => {
        // Sidebar list item
        const li = document.createElement('li');
        li.className = (name === activeFile) ? 'active' : '';
        li.innerHTML = `<span><i class="fa-regular fa-file-code"></i> ${name}</span>`;
        li.onclick = () => setActiveFile(name);
        list.appendChild(li);

        // Tab item
        const tab = document.createElement('div');
        tab.className = `tab ${(name === activeFile) ? 'active' : ''}`;
        tab.innerHTML = `<span>${name}</span>`;
        tab.onclick = () => setActiveFile(name);
        tabs.appendChild(tab);
    });
}

// --- 3. Persistence (IndexedDB) ---
async function saveProject() {
    const dbRequest = indexedDB.open("DXCodeDB", 1);
    dbRequest.onupgradeneeded = e => e.target.result.createObjectStore("VFS", { keyPath: "fileName" });
    dbRequest.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction("VFS", "readwrite");
        const store = tx.objectStore("VFS");
        store.clear();
        virtualFileSystem.forEach((model, name) => {
            store.put({ fileName: name, content: model.getValue() });
        });
    };
}

async function loadProject() {
    return new Promise(resolve => {
        const dbRequest = indexedDB.open("DXCodeDB", 1);
        dbRequest.onsuccess = e => {
            const db = e.target.result;
            if(!db.objectStoreNames.contains("VFS")) return resolve();
            const store = db.transaction("VFS", "readonly").objectStore("VFS");
            store.getAll().onsuccess = ev => {
                const files = ev.target.result;
                if(files.length > 0) {
                    files.forEach(f => createFile(f.fileName, f.content, false));
                    setActiveFile(files[0].fileName);
                } else {
                    createFile('index.html', '<!DOCTYPE html>\n<html>\n<body>\n  <h1>DXCode Pro</h1>\n</body>\n</html>');
                }
                resolve();
            };
        };
        dbRequest.onupgradeneeded = e => e.target.result.createObjectStore("VFS", { keyPath: "fileName" });
    });
}
