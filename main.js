require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' }});

let monacoEditor = null;
const virtualFileSystem = new Map();
let activeFile = null;

// 言語リソースプリセット
const i18n = {
    ja: { file: "ファイル(F)", edit: "編集(E)", view: "表示(V)", run: "実行(R)", help: "ヘルプ(H)", explorer: "エクスプローラー", settings: "設定" },
    en: { file: "File(F)", edit: "Edit(E)", view: "View(V)", run: "Run(R)", help: "Help(H)", explorer: "EXPLORER", settings: "SETTINGS" },
    zh: { file: "文件(F)", edit: "编辑(E)", view: "视图(V)", run: "运行(R)", help: "帮助(H)", explorer: "资源管理器", settings: "设置" }
};

require(['vs/editor/editor.main'], function() {
    monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
        value: "/* Welcome to DXCode */",
        language: 'javascript',
        theme: 'vs-dark',
        automaticLayout: true
    });

    initializeEditor();
});

function initializeEditor() {
    // アクティビティバー切り替え
    const activityIcons = document.querySelectorAll('.activity-icon');
    activityIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            activityIcons.forEach(i => i.classList.remove('active'));
            icon.classList.add('active');
            
            const view = icon.getAttribute('data-view');
            if (view === 'explorer') {
                document.getElementById('explorer-view').style.display = 'block';
                document.getElementById('extensions-view').style.display = 'none';
            } else if (view === 'extensions') {
                document.getElementById('explorer-view').style.display = 'none';
                document.getElementById('extensions-view').style.display = 'block';
            }
        });
    });

    // 設定変更イベント
    document.getElementById('lang-selector').addEventListener('change', generateAndApplyXML);
    document.getElementById('theme-selector').addEventListener('change', generateAndApplyXML);
}

/**
 * 1. 設定をXMLとして生成
 * 2. そのXMLをパースしてエディタに適用する
 */
function generateAndApplyXML() {
    const lang = document.getElementById('lang-selector').value;
    const theme = document.getElementById('theme-selector').value;

    // XML文字列の生成
    const xmlConfig = `
<?xml version="1.0" encoding="UTF-8"?>
<config>
    <appearance>
        <theme>${theme}</theme>
    </appearance>
    <localization>
        <language>${lang}</language>
    </localization>
</config>`;

    console.log("Applying XML Config:", xmlConfig);
    applySettingsFromXML(xmlConfig);
}

function applySettingsFromXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // テーマの適用
    const theme = xmlDoc.getElementsByTagName("theme")[0]?.textContent;
    if (theme) {
        monaco.editor.setTheme(theme);
        // 背景色の微調整（簡易版）
        document.body.style.backgroundColor = (theme === 'vs-light') ? '#ffffff' : '#1e1e1e';
    }

    // 言語の適用
    const langCode = xmlDoc.getElementsByTagName("language")[0]?.textContent;
    if (langCode && i18n[langCode]) {
        const dict = i18n[langCode];
        document.querySelector('[data-menu="file"]').textContent = dict.file;
        document.querySelector('[data-menu="edit"]').textContent = dict.edit;
        document.querySelector('[data-menu="view"]').textContent = dict.view;
        document.querySelector('[data-menu="run"]').textContent = dict.run;
        document.querySelector('[data-menu="help"]').textContent = dict.help;
        document.getElementById('sidebar-header').textContent = dict.explorer;
        document.getElementById('sidebar-header-ext').textContent = dict.settings;
    }
}

// 既存のファイルシステムロジック (省略せず維持)
function createFile(name) {
    if (!virtualFileSystem.has(name)) {
        virtualFileSystem.set(name, "");
        updateFileList();
    }
}

function updateFileList() {
    const list = document.getElementById('file-list');
    list.innerHTML = "";
    virtualFileSystem.forEach((content, name) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.textContent = name;
        li.onclick = () => {
            activeFile = name;
            monacoEditor.setValue(content);
        };
        list.appendChild(li);
    });
}

document.getElementById('new-file-btn').onclick = () => {
    const name = prompt("ファイル名を入力してください:");
    if (name) createFile(name);
};
