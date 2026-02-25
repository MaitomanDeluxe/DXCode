/**
 * DXCode v1.2 - Pro DevTools Edition
 * プレビュー内のレイアウト干渉を完全に防ぐ構造にアップデート
 */

// -----------------------------------------------------
// 4. プレビューと右側デベロッパーツール (修正版)
// -----------------------------------------------------

function openPreview() {
    const codeData = {
        html: virtualFileSystem.get('index.html')?.getValue() || '',
        css: virtualFileSystem.get('style.css')?.getValue() || '',
        js: virtualFileSystem.get('script.js')?.getValue() || ''
    };

    const previewWindow = window.open('about:blank', 'DXCode_Preview', 'width=1100,height=700');
    if (!previewWindow) return;

    const previewContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>DXCode DevTools Preview</title>
            <style>
                /* 全体のレイアウト設定 */
                html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #fff; display: flex; }
                
                /* ユーザーコンテンツ表示エリア */
                #user-viewport {
                    flex-grow: 1;
                    height: 100%;
                    overflow: auto;
                    position: relative;
                    transition: margin-right 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                }

                /* デベロッパーツール本体 */
                #dxcode-devtools {
                    position: fixed; top: 0; right: 0; width: 380px; height: 100%;
                    background: #202124; color: #bdc1c6; z-index: 99999;
                    display: flex; flex-direction: column; font-family: 'Segoe UI', sans-serif;
                    border-left: 1px solid #3c4043;
                    transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                    box-shadow: -5px 0 15px rgba(0,0,0,0.3);
                }
                #dxcode-devtools.hidden { transform: translateX(380px); }

                /* タブとコンテンツ */
                #devtools-tabs { display: flex; background: #292a2d; border-bottom: 1px solid #3c4043; font-size: 12px; }
                .dev-tab { padding: 12px; cursor: pointer; border-bottom: 2px solid transparent; color: #9aa0a6; }
                .dev-tab.active { color: #8ab4f8; border-bottom: 2px solid #8ab4f8; background: #35363a; }

                #devtools-content { flex-grow: 1; overflow-y: auto; padding: 10px; font-family: 'Consolas', monospace; font-size: 12px; }
                .panel { display: none; }
                .panel.active { display: block; }

                /* エレメンツツリーの装飾 */
                .node { margin-left: 12px; border-left: 1px solid #3c4043; padding-left: 8px; }
                .tag-color { color: #8ab4f8; }
                .attr-color { color: #93d5ed; }
                .string-color { color: #ee675c; }

                /* コンソールログ */
                .log-item { border-bottom: 1px solid #333; padding: 5px 0; word-break: break-all; }
                .log-warn { color: #fdd663; }
                .log-error { color: #f28b82; }
                #dxcode-prompt { 
                    width: 100%; border: none; background: #35363a; color: #fff; padding: 12px; 
                    outline: none; border-top: 1px solid #3c4043; font-family: monospace;
                }

                /* 引き出しボタン (垂直中央) */
                #devtools-toggle-btn {
                    position: absolute; top: 50%; left: -30px; transform: translateY(-50%);
                    background: #202124; color: #8ab4f8; border: 1px solid #3c4043; border-right: none;
                    border-radius: 8px 0 0 8px; width: 30px; height: 60px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                }
            </style>
        </head>
        <body>
            <div id="user-viewport">
                <div id="user-html-root">${codeData.html}</div>
                <style>${codeData.css}</style>
            </div>

            <div id="dxcode-devtools">
                <button id="devtools-toggle-btn">◀</button>
                <div id="devtools-tabs">
                    <div class="dev-tab active" data-target="panel-elements">Elements</div>
                    <div class="dev-tab" data-target="panel-console">Console</div>
                    <div class="dev-tab" data-target="panel-perf">Performance</div>
                </div>
                <div id="devtools-content">
                    <div id="panel-elements" class="panel active"></div>
                    <div id="panel-console" class="panel"><div id="console-logs"></div></div>
                    <div id="panel-perf" class="panel"><p>FPS: <span id="fps-val">60</span></p><p>Memory: 24MB</p></div>
                </div>
                <input id="dxcode-prompt" type="text" placeholder="> console.log(window)">
            </div>

            <script id="user-js-data" type="text/plain">${codeData.js}</script>

            <script>
                // --- 1. Elements Inspector Logic ---
                function updateElements() {
                    const container = document.getElementById('panel-elements');
                    const root = document.getElementById('user-html-root');
                    container.innerHTML = '';

                    function buildTree(node) {
                        if (node.nodeType === 3) { // Text node
                            const text = node.textContent.trim();
                            if (!text) return null;
                            const d = document.createElement('div');
                            d.className = 'node';
                            d.textContent = '"' + text + '"';
                            return d;
                        }
                        if (node.nodeType !== 1) return null; // Only Elements

                        const wrapper = document.createElement('div');
                        wrapper.className = 'node';
                        
                        let attrs = '';
                        Array.from(node.attributes).forEach(a => {
                            attrs += \` <span class="attr-color">\${a.name}</span>="<span class="string-color">\${a.value}</span>"\`;
                        });

                        const tagOpen = document.createElement('div');
                        tagOpen.innerHTML = \`<span class="tag-color">&lt;\${node.tagName.toLowerCase()}\${attrs}&gt;</span>\`;
                        wrapper.appendChild(tagOpen);

                        node.childNodes.forEach(child => {
                            const result = buildTree(child);
                            if (result) wrapper.appendChild(result);
                        });

                        const tagClose = document.createElement('div');
                        tagClose.innerHTML = \`<span class="tag-color">&lt;/\${node.tagName.toLowerCase()}&gt;</span>\`;
                        wrapper.appendChild(tagClose);
                        
                        return wrapper;
                    }
                    container.appendChild(buildTree(root));
                }

                // --- 2. Console & DevTools UI ---
                const devtools = document.getElementById('dxcode-devtools');
                const toggleBtn = document.getElementById('devtools-toggle-btn');
                const viewport = document.getElementById('user-viewport');
                let isOpen = true;

                toggleBtn.onclick = () => {
                    isOpen = !isOpen;
                    devtools.classList.toggle('hidden');
                    viewport.style.marginRight = isOpen ? '380px' : '0';
                    toggleBtn.textContent = isOpen ? '▶' : '◀';
                };
                viewport.style.marginRight = '380px'; // Initial

                document.querySelectorAll('.dev-tab').forEach(tab => {
                    tab.onclick = () => {
                        document.querySelectorAll('.dev-tab, .panel').forEach(el => el.classList.remove('active'));
                        tab.classList.add('active');
                        const target = document.getElementById(tab.dataset.target);
                        target.classList.add('active');
                        if (tab.dataset.target === 'panel-elements') updateElements();
                    };
                });

                const logBox = document.getElementById('console-logs');
                function pushLog(type, args) {
                    const div = document.createElement('div');
                    div.className = 'log-item log-' + type;
                    div.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                    logBox.appendChild(div);
                    logBox.scrollTop = logBox.scrollHeight;
                }

                // Override Console
                window.console.log = (...a) => pushLog('info', a);
                window.console.warn = (...a) => pushLog('warn', a);
                window.console.error = (...a) => pushLog('error', a);

                document.getElementById('dxcode-prompt').onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        pushLog('info', ['> ' + e.target.value]);
                        try {
                            const res = eval(e.target.value);
                            if (res !== undefined) pushLog('info', ['< ' + res]);
                        } catch(err) { pushLog('error', [err]); }
                        e.target.value = '';
                    }
                };

                // --- 3. Execution ---
                window.onload = () => {
                    updateElements();
                    const userJs = document.getElementById('user-js-data').textContent;
                    try {
                        // ユーザーのJSを実行。
                        // エラーが起きてもDevToolsが死なないようにラップ
                        const script = document.createElement('script');
                        script.textContent = userJs;
                        document.body.appendChild(script);
                    } catch(e) { console.error(e); }

                    // FPS Counter
                    let lastTime = performance.now();
                    function ticker() {
                        const now = performance.now();
                        const fps = Math.round(1000 / (now - lastTime));
                        document.getElementById('fps-val').textContent = fps;
                        lastTime = now;
                        requestAnimationFrame(ticker);
                    }
                    ticker();
                };
            </script>
        </body>
        </html>
    `;
    previewWindow.document.write(previewContent);
    previewWindow.document.close();
}
