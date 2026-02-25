/**
 * DXCode v1.5 - Final Integrated Edition
 */

let monacoEditor = null;
const virtualFileSystem = new Map();
let activeFile = null;

// --- 初期ファイル作成 ---
function createInitialFiles() {
    createFile('index.html', `<!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body>\n  <h1>Hello World</h1>\n  <script src="script.js"></script>\n</body>\n</html>`, true);
    createFile('style.css', 'h1 { color: #007acc; font-family: sans-serif; }');
    createFile('script.js', 'console.log("System running...");');
}

// --- アイコン設定 ---
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
        case 'html': return '<i class="fab fa-html5" style="color: #e34c26;"></i>';
        case 'css':  return '<i class="fab fa-css3-alt" style="color: #264de4;"></i>';
        case 'js':   return '<i class="fab fa-js-square" style="color: #f7df1e;"></i>';
        case 'py':   return '<i class="fab fa-python" style="color: #3776ab;"></i>';
        default:     return '<i class="far fa-file" style="color: #888;"></i>';
    }
}

function createFile(fileName, content = '', activate = true) {
    if (virtualFileSystem.has(fileName)) return;
    const lang = fileName.endsWith('.py') ? 'python' : fileName.split('.').pop();
    const model = monaco.editor.createModel(content, lang === 'js' ? 'javascript' : lang);
    virtualFileSystem.set(fileName, model);
    if (activate) setActiveFile(fileName);
    updateUI();
}

function setActiveFile(fileName) {
    activeFile = fileName;
    monacoEditor.setModel(virtualFileSystem.get(fileName));
    updateUI();
}

function updateUI() {
    const list = document.getElementById('file-list');
    const tabs = document.getElementById('tab-bar');
    list.innerHTML = ''; tabs.innerHTML = '';
    
    document.getElementById('preview-btn').style.display = activeFile.endsWith('.html') ? 'block' : 'none';

    virtualFileSystem.forEach((model, name) => {
        const isActive = name === activeFile;
        // Explorer
        const li = document.createElement('li');
        li.className = 'file-item' + (isActive ? ' active' : '');
        li.innerHTML = `<div class="indent-guide"></div><span class="file-icon">${getFileIcon(name)}</span>${name}`;
        li.onclick = () => setActiveFile(name);
        list.appendChild(li);
        // Tabs
        const tab = document.createElement('div');
        tab.className = 'tab' + (isActive ? ' active' : '');
        tab.innerHTML = `${getFileIcon(name)} <span style="margin-left:8px">${name}</span>`;
        tab.onclick = () => setActiveFile(name);
        tabs.appendChild(tab);
    });
}

// --- タブ切り替えロジック ---
document.querySelectorAll('.activity-icon').forEach(icon => {
    icon.onclick = () => {
        document.querySelectorAll('.activity-icon').forEach(i => i.classList.remove('active'));
        icon.classList.add('active');
        document.getElementById('sidebar-header').textContent = icon.title;
        document.querySelectorAll('.sidebar-view').forEach(v => v.style.display = 'none');
        document.getElementById('view-' + icon.dataset.view).style.display = 'block';
    };
});

// --- 検索・置換ロジック ---
document.getElementById('replace-all-btn').onclick = () => {
    const s = document.getElementById('search-input').value;
    const r = document.getElementById('replace-input').value;
    if(!s) return;
    virtualFileSystem.forEach(model => {
        const val = model.getValue();
        if(val.includes(s)) model.setValue(val.split(s).join(r));
    });
    alert('一括置換完了');
};

// --- プレビュー (デベロッパーツール付) ---
function openPreview() {
    const html = virtualFileSystem.get('index.html').getValue();
    const css = virtualFileSystem.get('style.css')?.getValue() || '';
    const js = virtualFileSystem.get('script.js')?.getValue() || '';

    const win = window.open('about:blank', '_blank');
    win.document.write(`
        <html>
        <head>
            <style>
                body { margin: 0; display: flex; transition: 0.3s; background: #fff; }
                #port { flex-grow: 1; overflow: auto; padding: 20px; }
                #dev { position: fixed; right: 0; top: 0; width: 350px; height: 100%; background: #202124; color: #fff; border-left: 1px solid #333; display: flex; flex-direction: column; font-family: monospace; font-size: 12px; }
                #logs { flex-grow: 1; overflow: auto; padding: 10px; border-bottom: 1px solid #333; }
                #in { width: 100%; background: #333; border: none; color: #fff; padding: 10px; outline: none; }
            </style>
        </head>
        <body>
            <div id="port">${html}<style>${css}</style></div>
            <div id="dev"><div id="logs">-- Console --</div><input id="in" placeholder="> code"></div>
            <script>
                const l = document.getElementById('logs');
                window.console.log = (m) => { l.innerHTML += '<div>' + m + '</div>'; };
                document.getElementById('in').onkeydown = (e) => {
                    if(e.key === 'Enter') { 
                        l.innerHTML += '<div style="color:#8ab4f8">> ' + e.target.value + '</div>';
                        try { l.innerHTML += '<div>' + eval(e.target.value) + '</div>'; } 
                        catch(err) { l.innerHTML += '<div style="color:red">' + err + '</div>'; }
                        e.target.value = '';
                    }
                };
                window.onload = () => { ${js} };
            </script>
        </body>
        </html>
    `);
}

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
            theme: 'vs-dark', automaticLayout: true, fontSize: 14
        });
        createInitialFiles();
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
