const vscode = require('vscode');
const utils = require('./utils')
const fs = require('fs')
const Shortcuts = {}


function getCache() {
    return Shortcuts.context.globalState.get('sql_symbols');
}

function setCache(str) {
    return Shortcuts.context.globalState.update('sql_symbols',str);
}


async function gotoPos(file, line) {
    const targetDocument = await vscode.workspace.openTextDocument(file);
    const targetEditor = await vscode.window.showTextDocument(targetDocument);

    const position = new vscode.Position(line, 0);
    const range = new vscode.Range(position, position);
    targetEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

async function load_symbols(force) {
    if (!force) {
        const item = getCache();
        if (item) {
           return JSON.parse(item);
        }
    }

    const sqlFiles = await vscode.workspace.findFiles('**/*.sql');
    if (sqlFiles.length === 0) return;

    const symbols = {
        // ["funcname"] = [index1,index2]
    }

    // 遍历所有找到的SQL文件
    for (const file of sqlFiles) {
        try {
            // 打开并读取文件内容
            const fileDocument = await vscode.workspace.openTextDocument(file);
            const fileText = fileDocument.getText();

            if (!fileText.includes('create')) return;

            const lines = fileText.split('\n');
            lines.forEach((line, index) => {
                const match = line.match(/create\s\w+\s(\w+)\S?/);
                if (match && match[1]) {
                    const key = match[1].trim();
                    symbols[key] = `${file}:${index}`
                }
            });
        } catch (error) {
            console.error(`Error processing file ${file.fsPath}: ${error.message}`);
        }
    }

    // 持久化
    setCache(JSON.stringify(symbols))

    Shortcuts.symbos_cache = JSON.stringify(symbols);

    vscode.showInformationMessage("load succ")

    return symbols;
}


async function execJump(params) {
    vscode.window.showInformationMessage('UDF.execJump 命令已执行!');
    const editor = vscode.window.activeTextEditor;
    if (editor) {

        try {
            const document = editor.document;
            const selection = editor.selection;
            const lineText = document.lineAt(selection.start.line).text;

            // 判断当前行是否包含 'exec' 或 'procedure'
            if (!lineText.includes('exec') && !lineText.includes('proc') && !lineText.includes('from')) {
                vscode.window.showInformationMessage('当前选中的行不包含 exec from proc 关键字，搜索已取消。');
                return;
            }

            const text = document.getText(selection).trim();
            if (!text) return;
            vscode.window.showInformationMessage(`选中的文本是: ${text}`);

            if (Shortcuts.symbos_cache && Shortcuts.symbos_cache[text]) {
                const items = Shortcuts.symbos_cache[text].split(':')
                const file = items[0];
                const line = items[1];
                await gotoPos(file, line)
            }
            else {
                load_symbols(true);
            }

        } catch (error) {
            vscode.window.showInformationMessage(`没有在任何SQL文件中找到 "${text}"。`);
        }
    }
}

Shortcuts.registerCommand = async function (context) {
    let disposable = vscode.commands.registerCommand('UDF.execJump', execJump);
    // 将命令的注册添加到订阅中，以便在插件停用时正确释放资源
    context.subscriptions.push(disposable);
}





Shortcuts.init = async function (context) {
    Shortcuts.registerCommand(context);

    Shortcuts.context = context;

    //加载符号定义
    Shortcuts.symbos_cache = await load_symbols(true)
}

module.exports = Shortcuts;
