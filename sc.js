const vscode = require('vscode');
const fs = require('fs')

// 定义全局的快捷方式对象
const Shortcuts = {};

// 存储在 Shortcuts.context，方便全局访问
let extensionContext;

/**
 * 从全局状态中获取 SQL 符号缓存
 * @returns {Object|null}
 */
async function getSymbolsCache() {
    // Shortcuts.context 必须在 init 中赋值
    const cachedData = extensionContext.globalState.get('sql_symbols');
    if (cachedData) {
        return JSON.parse(cachedData);
    }
    return null;
}

/**
 * 将 SQL 符号缓存写入全局状态
 * @param {Object} symbols
 */
async function setSymbolsCache(symbols) {
    await extensionContext.globalState.update('sql_symbols', JSON.stringify(symbols));
}

/**
 * 跳转到指定文件和行
 * @param {string} filePath
 * @param {number} lineNumber
 */
async function gotoPos(filePath, lineNumber) {
    try {
        const targetDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const targetEditor = await vscode.window.showTextDocument(targetDocument);
        const position = new vscode.Position(parseInt(lineNumber), 0);
        const range = new vscode.Range(position, position);
        targetEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch (error) {
        vscode.window.showErrorMessage(`无法打开文件或跳转: ${error.message}`);
    }
}

async function loadSymbolsFromSqlFiles() {
    // 查找所有 SQL 文件
    const sqlFiles = await vscode.workspace.findFiles('**/*.sql');
    if (sqlFiles.length === 0) {
        vscode.window.showInformationMessage("No SQL files found in the workspace.");
        return {};
    }

    const symbols = {};

    for (const file of sqlFiles) {
        try {
            // 直接读取文件内容，避免创建文档对象
            const fileContent = fs.readFileSync(file.fsPath, 'utf8');

            let lineNumber = 0;
            // 循环遍历每一行
            fileContent.split('\n').forEach((line) => {
                const lineMatch = line.match(/create\s\w+\s(\w+)\S?/);
                if (lineMatch && lineMatch[1]) {
                    const key = lineMatch[1].trim();
                    // 存储更友好的数据结构
                    symbols[key] = {
                        file: file.fsPath,
                        line: lineNumber
                    };
                }
                lineNumber++;
            });

        } catch (error) {
            console.error(`Error processing file ${file.fsPath}: ${error.message}`);
        }
    }

    // 将新生成的符号列表存入缓存
    await setSymbolsCache(symbols);

    return Object.keys(symbols).length;
}


async function parseXmlConfig() {
    // lbmdll\xml\kcbpspd_万亿版.xml
    const xmlFile = await vscode.workspace.findFiles('**/kcbpspd_万亿版.xml');
    if (xmlFile.length === 0) {
        vscode.window.showInformationMessage("No kcbpspd_万亿版.xml file found in the workspace.");
        return {};
    }

    const result = {
        // path1 :[
        //     { funcid, funcname }]
    };

    const content = fs.readFileSync(xmlFile[0].fsPath, 'utf8');

    const lines = content.split('\n');
    if (lines.length === 0) {
        vscode.window.showInformationMessage("kcbpspd_万亿版.xml is empty.");
        return {};

    }

    lines.forEach(element => {
        const keyMatch = element.match(/name="(\d+)"/);
        const valMatch = element.match(/module="(\w+)"/);
        const pathMath = element.match(/path=".*\\(\w+)\.dll"/);

        if (keyMatch && keyMatch[1] && valMatch && valMatch[1] && pathMath && pathMath[1]) {
            const key = keyMatch[1].trim();
            const val = valMatch[1].trim();
            const path = pathMath[1].trim();

            if (!result[path]) result[path] = [];

            result[path].push({ funcid: key, funcname: val });
        }
    });

    return result;
}

async function loadSymbolsFromCppFiles() {

    const result = await parseXmlConfig();
    if (Object.keys(result).length === 0) {
        vscode.window.showInformationMessage("No valid entries found in kcbpspd_万亿版.xml.");
        return {};
    }

    const symbols = {};

    for (const key in result) {
        // 查找可能的路径
        const codeFiles = await vscode.workspace.findFiles(`**/${key}/**/*.{c,cpp,h,hpp,hxx}`);
        if (codeFiles.length === 0) {
            console.log("No C/C++ files found in the workspace." + key);
            return {};
        }

        // 读取文件内容
        try {
            codeFiles.forEach(file => {
                const fileContent = fs.readFileSync(file.fsPath, 'utf8');

                let lineNumber = 0;
                // 循环遍历每一行
                fileContent.split('\n').forEach((line) => {
                    // 851640 => GpzyBusiReqGet => lbm_query=> void CQuery::GpzyBusiReqGet(tagGpzyBusiReqGet &BusParam)
                    const lineMatch = line.match(/void\s+\w+::(\w+)\(/);
                    if (lineMatch && lineMatch[1]) {
                        const funcName = lineMatch[1].trim();
                        // 反向查找功能号
                        for (const item of result[key]) {
                            if (item.funcname === funcName) {
                                // 存储更友好的数据结构
                                symbols[item.funcid] = {
                                    file: file.fsPath,
                                    line: lineNumber
                                };
                                break;
                            }
                        }
                    }
                    lineNumber++;
                });

                // 将新生成的符号列表存入缓存
            });

        } catch (error) {
            console.error(`Error processing file ${codeFiles[0].fsPath}: ${error.message}`);
        }
    }

    // 将新生成的符号列表存入缓存
    const symbolsCache = await getSymbolsCache() || {};

    await setSymbolsCache({ ...symbolsCache, ...symbols });

    return Object.keys(symbols).length;
}


async function parseSysMenu() {
    const sysmenu = await vscode.workspace.findFiles('**/server/tradedb/init/sys_menu.sql');
    if (sysmenu.length === 0) {
        vscode.window.showInformationMessage("No sysmenu.sql file found in the workspace.");
        return {};
    }

    const result = {
        // path1 :[
        //     { menuid1, menuname1 }]
        //     { menuid1, menuname1 }]
        //     { menuid1, menuname1 }]
        // ]
    };

    const content = fs.readFileSync(sysmenu[0].fsPath, 'utf8');
    const lines = content.split('\n');
    if (lines.length === 0) {
        vscode.window.showInformationMessage("sysmenu.sql is empty.");
        return {};
    }

    lines.forEach(line => {
        line = line.trim();
        if (!line.startsWith('exec')) return;

        const idMatch = line.match(/(\d{8})/);
        const pathMatch = line.match(/'(cli_\w+).dll'/i);
        if (idMatch && idMatch[1] && pathMatch && pathMatch[1]) {
            const id = idMatch[1].trim();
            const path = pathMatch[1].trim();

            if (!result[path]) result[path] = [];

            result[path].push({ menuid: id });
        }
    })

    return result;
}

async function loadSymbolsFromPascalFiles() {

    console.log("Loading symbols from Pascal files...");

    const result = await parseSysMenu();
    if (Object.keys(result).length === 0) {
        vscode.window.showInformationMessage("No valid entries found in sysmenu.");
        return {};
    }

    // 处理集中定义的菜单号
    const glbfiles = await vscode.workspace.findFiles('**/*GlbMenu.pas');
    if (glbfiles.length === 0) {
        vscode.window.showInformationMessage("No GlbMenu.pas file found in the workspace.");
        return {};
    }

    // 是否添加了菜单变量
    fs.readFileSync(glbfiles[0].fsPath, 'utf8').split('\n').forEach(line => {
        line = line.trim();

        const match = line.match(/(\w+)\s+=\s+(\d{8})/)
        if (match && match[1] && match[2]) {
            const menuvar = match[1].trim();
            const menuid = match[2].trim();

            for (const key in result) {
                for (const item of result[key]) {
                    if (item.menuid === menuid) {
                        item.menuvar = menuvar;
                    }
                }
            }
        }
    })

    // 查找工程文档
    const pascalFiles = await vscode.workspace.findFiles('**/*.dpr');
    if (pascalFiles.length === 0) {
        vscode.window.showInformationMessage("No Pascal files found in the workspace.");
        return {};
    }

    // find window class for menuid
    pascalFiles.forEach(file => {
        let content = fs.readFileSync(file.fsPath, 'utf8');

        const regex = /^\s*\/\/.*(\n|$)/gm;

        content = content.replace(regex, '');

        const segments = content.split('Create(')

        segments.forEach(seg => {

            let winClass = null;

            // 提取窗体变量
            const winMatch = seg.match(/Result\s?:=\s?(\w+)/);
            if (winMatch && winMatch[1]) {
                winClass = winMatch[1].trim();
            }

            for (const key in result) {
                result[key].forEach(item => {
                    // 遍历每一个segement
                    if (seg.includes(item.menuid) || (item.menuvar && seg.includes(item.menuvar))) {
                        item.class = winClass;
                    }
                })
            }
        })
    })

    // 查找可能的路径
    const codeFiles = await vscode.workspace.findFiles(`**/*.{pas}`);
    if (codeFiles.length === 0) {
        console.log("No Pascal files found in the workspace." + pathKey);
        return;
    }

    const filesContainer = {};
    for (const key in result) {
        // 因为大小写的问题，先查全部路径在进行分类
        const pathKey = key.toLowerCase();

        // 过滤出相关的文件
        const filteredFiles = codeFiles.filter(file => file.fsPath.toLowerCase().includes(`\\${pathKey}\\`));
        if (filteredFiles.length > 0) {
            filesContainer[key] = filteredFiles;
        }
    }

    const symbols = {};

    // 根据路径查找文件，并定位类定义
    for (const key in result) {
        const codeFiles = filesContainer[key];
        if (!codeFiles || codeFiles.length === 0) {
            console.log("No Pascal files found in the workspace." + key);
            continue;
        }

        // 读取文件内容
        try {
            codeFiles.forEach(file => {
                const fileContent = fs.readFileSync(file.fsPath, 'utf8');

                // 必须包含关键字段
                if (fileContent.includes('type') === false || fileContent.includes('class') === false)
                    return;

                let lineNumber = 0;
                // 循环遍历每一行
                fileContent.split('\n').forEach((line) => {
                    // 查找类定义
                    const lineMatch = line.match(/(\w+)\s*=\s*class\(/);
                    if (lineMatch && lineMatch[1]) {
                        const className = lineMatch[1].trim();
                        // 反向查找功能号
                        for (const item of result[key]) {
                            if (item.class === className) {
                                // 存储更友好的数据结构
                                symbols[item.menuid] = {
                                    file: file.fsPath,
                                    line: lineNumber
                                };
                            }
                        }

                        // 一个文件一般只会定义一个类，找到后可以退出
                        return;
                    }
                    lineNumber++;
                });

                // 将新生成的符号列表存入缓存
            });
        } catch (error) {
            console.error(`Error processing file ${codeFiles[0].fsPath}: ${error.message}`);
        }
    }

    const symbolsCache = await getSymbolsCache() || {};

    await setSymbolsCache({ ...symbolsCache, ...symbols });

    return Object.keys(symbols).length;
}

/**
 * 加载并缓存所有 SQL 文件中的符号
 * @param {boolean} force 是否强制重新加载
 * @returns {Promise<Object>}
 */
async function load_symbols(force) {
    if (!force) {
        const symbols = await getSymbolsCache();
        if (symbols) {
            vscode.window.showInformationMessage("Loaded symbols from cache.");
            return symbols;
        }
    }
    let nums = 0;
    let startTime, duration;
    try {
        startTime = Date.now();
        nums = await loadSymbolsFromSqlFiles();
        duration = Date.now() - startTime;
        vscode.window.showInformationMessage(`Loaded ${nums} 'SQL' symbols in ${duration}ms.`);
        console.log(`Loaded ${nums} 'SQL' symbols in ${duration}ms.`);

        startTime = Date.now();
        nums = await loadSymbolsFromCppFiles();
        duration += (Date.now() - startTime);
        vscode.window.showInformationMessage(`Loaded ${nums} 'CPP' symbols in ${duration}ms.`);
        console.log(`Loaded ${nums} 'CPP' symbols in ${duration}ms.`);

        startTime = Date.now();
        nums = await loadSymbolsFromPascalFiles();
        duration += (Date.now() - startTime);
        vscode.window.showInformationMessage(`Loaded ${nums} 'PASCAL' symbols in ${duration}ms.`);
        console.log(`Loaded ${nums} 'PASCAL' symbols in ${duration}ms.`);

    } catch (error) {
        vscode.window.showErrorMessage(`Error loading symbols: ${error.message}`);
    }

    return await getSymbolsCache();
}


async function findField(text) {
    const symbols = await getSymbolsCache();
    if (symbols && symbols[text]) {
        return symbols[text];
    } else {
        // 缓存中没有，重新加载并再次查找
        // vscode.window.showInformationMessage(`"${text}" not found in cache. Rebuilding symbol list...`);

        // 注释后暂时先不重新加载，避免频繁触发
        // 需要时可以手动触发重新加载
        // const newSymbols = await load_symbols(true);
        // if (newSymbols && newSymbols[text]) {
        //     return newSymbols[text];
        // } else {
        //     vscode.window.showInformationMessage(`在工作区中没有找到 "${text}" 的定义。`);
        // }
    }

    return {};
}


async function cmdHandler(cmd) {
    switch (cmd) {
        case '@reloadSymbols':
            load_symbols(true);
            break;

        default:
            break;
    }

    return;
}


/**
 * 处理 SQL 跳转命令
 */
async function execJump() {

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    try {
        const document = editor.document;
        const selection = editor.selection;
        let text = document.getText(selection).trim();

        if (!text) {
            // 查询用户剪切板内容,长度进行限制
            const clipboardText = await vscode.env.clipboard.readText();
            if (clipboardText && clipboardText.length <= 32 && clipboardText.trim()) {
                const t = clipboardText.trim();
                const { file, line } = await findField(t);
                if (file && line !== undefined) {
                    await gotoPos(file, line);
                    return;
                }
            }

            // 剪切板不存在，提示用户输入
            const input = await vscode.window.showInputBox({ prompt: 'Enter the symbol to jump to' });
            if (input && input.trim()) {
                text = input.trim();
            } else {
                vscode.window.showInformationMessage('No symbol entered.');
                return;
            }
        }

        // 处理命令
        if (text.startsWith('@')) {
            return cmdHandler(text);
        }

        // 普通跳转
        const { file, line } = await findField(text);
        if (file && line !== undefined) {
            await gotoPos(file, line);
            return;
        }
        else {
            vscode.window.showInformationMessage(`UDF-JUMPER:在工作区中没有找到 "${text}" 的定义。`);
        }
    } catch (error) {
        console.error(error);
        vscode.window.showErrorMessage('执行命令时发生错误。');
    }
}



// init definition provideri
async function initDefinitionProvider(context) {
    const provider = vscode.languages.registerDefinitionProvider(
        { scheme: 'file', language: '*' }, // 这里指定你要支持的语言
        {
            async provideDefinition(document, position, token) {
                const range = document.getWordRangeAtPosition(position);
                if (!range) return;

                const text = document.getText(range).trim();

                const { file, line } = await findField(text);

                if (file && line !== undefined) {
                    const targetUri = vscode.Uri.file(file);
                    const targetPos = new vscode.Position(line, 0); // 行号从 0 开始
                    return new vscode.Location(targetUri, targetPos);
                }

                return null;
            }
        }
    );
    context.subscriptions.push(provider);
}


/**
 * 注册命令
 * @param {vscode.ExtensionContext} context
 */
Shortcuts.registerCommand = function (context) {
    let disposable


    disposable = vscode.commands.registerCommand('UDF.execJump', execJump);
    context.subscriptions.push(disposable);
};


let boldDecoration;

function highlightSymbols(symbols) {
    console.log("Highlighting symbols...");
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    if (!boldDecoration) {
        boldDecoration = vscode.window.createTextEditorDecorationType({
            fontWeight: 'bold',
            fontStyle: 'italic',
        });
    }

    const text = editor.document.getText();
    const ranges = [];

    const regex = /\b\w+\b/g;
    let match;
    while ((match = regex.exec(text))) {
        const word = match[0];
        if (symbols[word]) {
            const start = editor.document.positionAt(match.index);
            const end = editor.document.positionAt(match.index + word.length);
            const lineText = editor.document.lineAt(start.line).text;

            if (lineText.includes(`@${word}`) || lineText.includes(`#${word}`) || word == 'run') continue;

            let r1 = new RegExp("create\\s+\\w+\\s+" + word);
            let r2 = new RegExp("exec\\s+" + word + "\\s");
            let r3 = new RegExp("execute\\s+" + word + "\\s");
            let r4 = new RegExp("run\\.\\." + word + "\\s");

            if (lineText.match(r2)
                || lineText.match(r3)
                || lineText.includes(`dbo.${word}`)
                || lineText.match(r4)
                || lineText.match(r1)
            ) {
                console.log(`Skipping definition line: ${lineText.trim()}`);
                ranges.push(new vscode.Range(start, end));
            }
        }
    }

    editor.setDecorations(boldDecoration, ranges);
}

async function setSymbolsBold(context) {

    let symbols = await getSymbolsCache();
    if (!symbols) {
        console.log("No symbols found in cache for highlighting.");
        return;
    };

    if (vscode.window.activeTextEditor) {
        highlightSymbols(symbols);
    }

    vscode.window.onDidChangeActiveTextEditor(async editor => {
        symbols = await getSymbolsCache();
        if (editor) {
            highlightSymbols(symbols);
        }
    }, null, context.subscriptions);
}

/**
 * 扩展初始化
 * @param {vscode.ExtensionContext} context
 */
Shortcuts.init = async function (context) {
    // 如果当前工程不存在server目录，则无需初始化
    const serverDir = await vscode.workspace.findFiles('**/server/**');
    if (serverDir.length === 0) {
        return;
    }

    Shortcuts.context = context;

    extensionContext = context; // 存储 context

    Shortcuts.registerCommand(context);

    // 初始化定义跳转：ctrl+click
    initDefinitionProvider(context);

    // 扩展启动时，后台加载符号列表，不阻塞主线程
    load_symbols(false);

    // 符号粗体显示
    setSymbolsBold(context);
};

module.exports = Shortcuts;