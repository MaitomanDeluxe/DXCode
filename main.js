let monacoEditor = null;
const virtualFileSystem = new Map();
let activeFile = null;

// --- 1. アイコン・言語設定 ---
function getFileInfo(name) {
    const ext = name.split('.').pop().toLowerCase();
    const map = {
        html: { icon: '<i class="fab fa-html5" style="color:#e34c26"></i>', lang: 'html' },
        css:  { icon: '<i class="fab fa-css3-alt" style="color:#264de4"></i>', lang: 'css' },
        js:   { icon: '<i class="fab fa-js-square" style="color:#f7df1e"></i>', lang: 'javascript' },
        py:   { icon: '<i class="fab fa-python" style="color:#3776ab"></i>', lang: 'python' },
        json: { icon: '<i class="fas fa-code" style="color:#fbc02d"></i>', lang: 'json' }
    };
    return map[ext] || { icon: '<i class="far fa-file"></i>', lang: 'plaintext' };
}

// --- 2. ファイルシステム ---
function createFile(name, content = '', activate = true) {
    if (virtualFileSystem.has(name)) return;
    const info = getFileInfo(name);
    const model = monaco.editor.createModel(content, info.lang);
    virtualFileSystem.set(name, model);
    if (activate) setActiveFile(name);
    renderUI();
}

function setActiveFile(name) {
    activeFile = name;
    monacoEditor.setModel(virtualFileSystem.get(name));
    renderUI();
}

function renderUI() {
    const list = document.getElementById('file-list');
    const tabs = document.getElementById('tab-bar');
    list.innerHTML = ''; tabs.innerHTML = '';
    
    document.getElementById('preview-btn').style.display = activeFile.endsWith('.html') ? 'block' : 'none';

    virtualFileSystem.forEach((model, name) => {
        const isActive = name === activeFile;
        const info = getFileInfo(name);
        
        // Explorer
        const li = document.createElement('li');
        li.className = `file-item ${isActive ? 'active' : ''}`;
        li.innerHTML = `<div class="indent-guide"></div><span class="file-icon">${info.icon}</span>${name}`;
        li.onclick = () => setActiveFile(name);
        list.appendChild(li);

        // Tab
        const tab = document.createElement('div');
        tab.className = `tab ${isActive ? 'active' : ''}`;
        tab.innerHTML = `${info.icon} <span style="margin-left:7px">${name}</span>`;
        tab.onclick = () => setActiveFile(name);
        tabs.appendChild(tab);
    });
}

// --- 3. サイドバー切り替え ---
document.querySelectorAll('.activity-icon').forEach(icon => {
    icon.onclick = () => {
        document.querySelectorAll('.activity-icon').forEach(i => i.classList.remove('active'));
        icon.classList.add('active');
        document.getElementById('sidebar-header').textContent = icon.title.toUpperCase();
        document.querySelectorAll('.sidebar-view').forEach(v => v.style.display = 'none');
        document.getElementById(`view-${icon.dataset.view}`).style.display = 'block';
    };
});

// --- 4. 検索・置換 ---
document.getElementById('replace-all-btn').onclick = () => {
    const s = document.getElementById('search-input').value;
    const r = document.getElementById('replace-input').value;
    if (!s) return;
    virtualFileSystem.forEach(model => {
        const text = model.getValue();
        if (text.includes(s)) model.setValue(text.split(s).join(r));
    });
    alert('一括置換を完了しました');
};

// --- 5. デバッグ機能付きプレビュー ---
function openPreview() {
    const html = virtualFileSystem.get('index.html')?.getValue() || '';
    const css = virtualFileSystem.get('style.css')?.getValue() || '';
    const js = virtualFileSystem.get('script.js')?.getValue() || '';

    const win = window.open('about:blank', '_blank');
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { margin: 0; display: flex; height: 100vh; font-family: sans-serif; }
                #app { flex-grow: 1; padding: 20px; overflow: auto; }
                #dev-tools { width: 350px; background: #202124; color: #bdc1c6; display: flex; flex-direction: column; border-left: 1px solid #333; font-family: monospace; }
                #console { flex-grow: 1; padding: 10px; overflow-y: auto; font-size: 12px; }
                #input { background: #35363a; border: none; color: #fff; padding: 10px; outline: none; border-top: 1px solid #444; }
                .log { border-bottom: 1px solid #333; padding: 2px 0; }
            </style>
        </head>
        <body>
            <div id="app">${html}<style>${css}</style></div>
            <div id="dev-tools">
                <div style="background:#292a2d; padding:8px; font-size:11px; border-bottom:1px solid #333">CONSOLE</div>
                <div id="console"></div>
                <input id="input" placeholder="> 実行するJSを入力...">
            </div>
            <script>
                const con = document.getElementById('console');
                window.console.log = (...args) => {
                    const d = document.createElement('div'); d.className='log';
                    d.textContent = args.join(' '); con.appendChild(d);
                    con.scrollTop = con.scrollHeight;
                };
                document.getElementById('input').onkeydown = (e) => {
                    if(e.key === 'Enter') {
                        console.log('> ' + e.target.value);
                        try { console.log('< ' + eval(e.target.value)); }
                        catch(err) { console.log('Error: ' + err); }
                        e.target.value = '';
                    }
                };
                window.onload = () => { ${js} };
            </script>
        </body>
        </html>
    `);
    win.document.close();
}

// --- 6. 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
            theme: 'vs-dark', automaticLayout: true, fontSize: 14, minimap: { enabled: false }
        });
        
        createFile('index.html', '<h1>Hello!</h1>', false);
        createFile('style.css', 'h1 { color: #007acc; }', false);
        createFile('script.js', 'console.log("Ready.");', true);

        document.getElementById('new-file-btn').onclick = () => {
            const n = prompt("ファイル名:"); if(n) createFile(n);
        };
        document.getElementById('preview-btn').onclick = openPreview;
        document.getElementById('download-zip-btn').onclick = () => {
            const zip = new JSZip();
            virtualFileSystem.forEach((m, f) => zip.file(f, m.getValue()));
            zip.generateAsync({type:"blob"}).then(c => saveAs(c, "project.zip"));
        };
    });
});
