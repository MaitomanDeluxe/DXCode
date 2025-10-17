/**
 * 5.1 PWA Service Workerの登録
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => console.log('SW registered:', registration.scope))
            .catch(error => console.error('SW registration failed:', error));
    });
}

// -----------------------------------------------------

let monacoEditor = null;
const virtualFileSystem = new Map(); // key: ファイル名, value: Monaco Model
let activeFile = null;

/**
 * 5.2 ヘルパー関数とファイル操作
 */
function getLanguage(fileName) {
    const ext = fileName.split('.').pop();
    switch (ext) {
        case 'html': return 'html';
        case 'css': return 'css';
        case 'js': return 'javascript';
        case 'xml': return 'xml';
        case 'json': return 'json';
        default: return 'plaintext';
    }
}

function createFile(fileName, content = '') {
    // ファイル名チェック (ここでは簡略化)
    if (virtualFileSystem.has(fileName)) {
        alert(`${fileName} は既に存在します。`);
        return;
    }

    const lang = getLanguage(fileName);
    const model = monaco.editor.createModel(content, lang);
    virtualFileSystem.set(fileName, model);
    
    // モデルに変更が加わるたびに、ファイル名を更新 (拡張子変更に対応するため)
    model.onDidChangeLanguage(() => updateUI());

    setActiveFile(fileName);
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
    
    fileListEl.innerHTML = '';
    tabBarEl.innerHTML = '';

    // ファイルリストとタブの更新
    virtualFileSystem.forEach((model, fileName) => {
        const isActive = fileName === activeFile;

        // ファイルリスト
        const li = document.createElement('li');
        li.textContent = fileName;
        li.className = isActive ? 'active' : '';
        li.onclick = () => setActiveFile(fileName);
        fileListEl.appendChild(li);

        // タブバー
        const tab = document.createElement('div');
        tab.textContent = fileName;
        tab.className = 'tab ' + (isActive ? 'active' : '');
        tab.onclick = () => setActiveFile(fileName);
        tabBarEl.appendChild(tab);
    });
}

/**
 * 5.3 ZIPダウンロード機能
 */
document.getElementById('download-zip-btn').addEventListener('click', () => {
    if (virtualFileSystem.size === 0) {
        alert('プロジェクトが空です。ファイルをいくつか作成してください。');
        return;
    }

    const zip = new JSZip();
    virtualFileSystem.forEach((model, fileName) => {
        // Monaco Modelから現在のコードを取得
        const content = model.getValue();
        zip.file(fileName, content);
    });

    zip.generateAsync({ type: "blob" })
        .then(content => {
            // FileSaver.jsを使ってファイルをダウンロード
            saveAs(content, "DXCode_Project.zip");
        })
        .catch(err => {
            console.error("ZIP生成エラー:", err);
            alert("ZIPファイルの生成に失敗しました。");
        });
});

/**
 * 5.4 Monaco Editorの初期化と起動
 */
require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
    monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
        value: '\n',
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        // Emmetを有効にする設定 (HTML, CSS, JSONなどはデフォルトでサポート)
    });

    // 最初のファイルを作成
    createFile('index.html', `<!DOCTYPE html>\n<html>\n<head>\n  <title>DXCode Test</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello DXCode</h1>\n  <script src="script.js"></script>\n</body>\n</html>`);
    createFile('style.css', 'body {\n  background-color: #2e2e2e;\n  color: #cccccc;\n}');
    createFile('script.js', 'console.log("DXCode is ready!");');
    
    // 新規ファイル作成ボタンのイベントリスナー
    document.getElementById('new-file-btn').addEventListener('click', () => {
        const fileName = prompt("新しいファイル名を入力してください (例: component.js):");
        if (fileName) {
            createFile(fileName.trim());
        }
    });

    // キーボードショートカット (Ctrl+Nで新規ファイル)
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => {
        document.getElementById('new-file-btn').click();
    });
});
