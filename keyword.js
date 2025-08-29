const vscode = require('vscode');
const fs = require('fs');
const iconv = require('iconv-lite');
const path = require('path');


let Keyword = {
    disposables: [],
    keywordProvider: null,
    keywordTreeView: null,
    keywordArray: [],
};

let keywordCache = {
    'k1': ['v1', 'v2', 'v3'],
    'k2': ['v1', 'v2', 'v3'],
    'k3': ['v1', 'v2', 'v3'],
    'k4': ['v1', 'v2', 'v3'],
    'k5': ['v1', 'v2', 'v3'],
    'k6': ['v1', 'v2', 'v3'],
    'k7': ['v1', 'v2', 'v3'],
};


function logInfo(message) {
    console.log(`KEYWORDDD:${message}`);
}

function handleError(error, context = '', showToUser = true) {
    const errorMessage = `${context}: ${error.message || error}`;
    logInfo(errorMessage);
}

class KeywordItem extends vscode.TreeItem {
    constructor(key, comment, collapsibleState) {
        super(key, collapsibleState);
        this.key = key;
        this.comment = comment;

        const firstComment = comment[0] || '';
        const hasMultipleComments = comment.length > 1;

        this.description = hasMultipleComments
            ? `${firstComment} (+${comment.length - 1} more)`
            : firstComment;

        this.tooltip = this.createTooltip(key, comment);

        this.contextValue = 'keywordItem';

        this.iconPath = this.getIconByCommentCount(comment.length);

        this.resourceUri = vscode.Uri.parse(`keyword:${key}`);
    }

    createTooltip(key, comment) {
        const tooltip = new vscode.MarkdownString();
        tooltip.isTrusted = true;
        tooltip.supportThemeIcons = true;

        tooltip.appendMarkdown(`## $(symbol-key) **${key}**\n\n`);

        if (comment.length > 0) {
            comment.forEach((item, index) => {
                tooltip.appendMarkdown(`${index + 1}. ${item}\n`);
            });
        }
        return tooltip;
    }

    getIconByCommentCount(count) {
        if (count === 0) {
            return new vscode.ThemeIcon('symbol-constant', new vscode.ThemeColor('problemsWarningIcon.foreground'));
        } else if (count === 1) {
            return new vscode.ThemeIcon('symbol-string', new vscode.ThemeColor('symbolIcon.stringForeground'));
        } else if (count <= 3) {
            return new vscode.ThemeIcon('symbol-array', new vscode.ThemeColor('symbolIcon.arrayForeground'));
        } else {
            return new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('symbolIcon.namespaceForeground'));
        }
    }
}

Keyword.KeywordProvider = class {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.searchText = '';
        this._isRefreshing = false;
    }

    async refresh() {
        if (this._isRefreshing) return;
        this._isRefreshing = true;

        try {
            this._onDidChangeTreeData.fire();
        } finally {
            this._isRefreshing = false;
        }
    }

    setSearchText(text) {
        const newSearchText = (text || '').toLowerCase();
        if (this.searchText !== newSearchText) {
            this.searchText = newSearchText;
            this.refresh();
        }
    }

    getTreeItem(element) {
        return element;
    }

    searchFilter(items) {
        for (const key in keywordCache) {
            if (key.includes(this.searchText)) {
                items.push(new KeywordItem(key, keywordCache[key], vscode.TreeItemCollapsibleState.None));
            }

            const val = keywordCache[key];
            if (Array.isArray(val)) {
                val.forEach(element => {
                    if (element.includes(this.searchText)) {
                        items.push(new KeywordItem(key, val, vscode.TreeItemCollapsibleState.None));
                    }
                });
            }
        }

        return items;
    }

    getChildren(element) {
        try {
            if (!element) {
                // ���ڵ㣬�������������ʹ��configArray����ԭʼ˳��
                const items = [];

                if (this.searchText) {
                    this.searchFilter(items);
                }
                else {
                    for (const key in keywordCache) {
                        items.push(new KeywordItem(key, keywordCache[key], vscode.TreeItemCollapsibleState.None));
                    }
                }

                return items;
            }
            return [];
        } catch (error) {
            handleError(error, '��ȡUDF����������ʱ����');
            return [];
        }
    }

    dispose() {
        if (this._onDidChangeTreeData) {
            this._onDidChangeTreeData.dispose();
        }
    }

    dragMimeTypes = ['application/vnd.vscode.mybookmarkitem']; // ����������� MIME ����
    dropMimeTypes = ['application/vnd.vscode.mybookmarkitem']; // ����������� MIME ����

    handleDrag(source, dataTransfer, token) {
        const draggedIds = source.map(item => item.id); // �������Ԫ���� id ����
        dataTransfer.set(this.dragMimeTypes[0], new vscode.DataTransferItem(JSON.stringify(draggedIds)));
        console.log("Drag started for:", draggedIds); // �������
    }
}

function tryToGetComment(word) {
    // sub first char
    if (keywordCache[word.substr(1, word.length).toLowerCase()]) {
        return keywordCache[word.substr(1, word.length).toLowerCase()];
    }
    else if (word.startsWith('p_') && keywordCache[word.substr(2, word.length)]) {
        return keywordCache[word.substr(2, word.length)];
    }
}

Keyword.provideHover = function (document, position, token) {
    const word = document.getText(document.getWordRangeAtPosition(position));
    let comment = keywordCache[word];
    if (!comment || !Array.isArray(comment)) {
        comment = tryToGetComment(word);
        if (!comment || comment.length === 0) {
            return null;
        }
    }

    const hoverMarkdown = new vscode.MarkdownString();
    hoverMarkdown.isTrusted = true;
    hoverMarkdown.supportThemeIcons = true;
    hoverMarkdown.appendMarkdown(`**${word}**\n\n`);
    comment.forEach(function (item, index) {
        hoverMarkdown.appendMarkdown(`${item}\n`);
        // use icon to show edit and delete
        hoverMarkdown.appendMarkdown(`[$(edit)](command:keywordTreeView.editFromHover?["${word}:${index}"])`);
        hoverMarkdown.appendMarkdown(`[$(trash)](command:keywordTreeView.deleteFromHover?["${word}:${index}"])`);
        hoverMarkdown.appendMarkdown(`\n\n`);
    });

    return new vscode.Hover(hoverMarkdown);
}

Keyword.createView = function () {
    Keyword.keywordProvider = new Keyword.KeywordProvider();
    Keyword.keywordTreeView = vscode.window.createTreeView('keywordTreeView', {
        treeDataProvider: Keyword.keywordProvider,
        showCollapseAll: true
    });
    Keyword.disposables.push(Keyword.keywordTreeView);
}

async function saveKeyword() {
    // save to file
    let configPaht = "./keywords.json";
    // get absolute path
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        configPaht = path.resolve(workspaceFolders[0].uri.fsPath, configPaht);
    }
    const content = JSON.stringify(keywordCache);
    fs.writeFileSync(configPaht, content);
}

async function refreshKeyword() {
    if (Keyword.keywordProvider) {
        Keyword.keywordProvider.setSearchText('');
        Keyword.keywordProvider.refresh();
    }
}
async function addKeyword() {
    // show input box
    const key = await vscode.window.showInputBox({
        prompt: 'input keyword',
        placeholder: 'input keyword, leave empty to show all'
    });
    if (!key || !key.trim()) {
        logInfo('keyword is empty');
        return;
    }

    // show input box
    const comment = await vscode.window.showInputBox({
        prompt: 'input comment',
        placeholder: 'input comment, leave empty to show all'
    });
    if (!comment || !comment.trim()) {
        logInfo('comment is empty');
        return;
    }

    const item = keywordCache[key];
    if (item && Array.isArray(item)) {
        item.push(comment);
    }
    else {
        keywordCache[key] = [comment];
    }

    // save to file
    saveKeyword();


    // refresh keyword
    refreshKeyword();
}
async function editKeyword(item) {
    const value = item.comment.join('#=#');

    // show input box wite value
    const newComment = await vscode.window.showInputBox({
        prompt: 'input comment',
        value: value
    });

    if (!newComment || !newComment.trim()) {
        logInfo('comment is empty');
        return;
    }

    keywordCache[item.key] = newComment.split('#=#');

    // update keyword
    saveKeyword();

    // refresh keyword
    refreshKeyword();
}
async function deleteKeyword(item) {
    // show warning message
    const confirmation = await vscode.window.showWarningMessage(
        `confirm delete keyword "${item.key}" ?`,
        { modal: true },
        'delete'
    );
    if (confirmation === 'delete') {
        delete keywordCache[item.key];

        // update keyword
        saveKeyword();

        // refresh keyword
        refreshKeyword();
    }
}
async function importKeywordFile() {
    const file = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
    });

    if (!file || file.length === 0) {
        logInfo('no file selected');
        return;
    }

    const filePath = file[0].fsPath;
    let fileContent = fs.readFileSync(filePath);

    // ����ļ�������utf8������Ϊ��gbk
    if (!filePath.endsWith('.utf8')) {
        fileContent = iconv.decode(fileContent, 'gbk', { decodeStrict: false });
    }

    const lines = fileContent.split('\n');
    lines.forEach(line => {
        // space or tab to split
        let [key, comment] = line.split(/[\s\t]+/);
        if (key && comment) {
            if (keywordCache[key] && !keywordCache[key].includes(comment)) {
                // 去重
                const target = keywordCache[key]
                let tmp = comment
                if (tmp.includes("::"))
                    tmp = tmp.split("::")[1]

                if (target.includes(tmp))
                    return;
                keywordCache[key].push(comment);
            }
            else {
                keywordCache[key] = [comment];
            }
        }
    });

    // save keyword
    saveKeyword();

    // refresh keyword
    refreshKeyword();
}
async function addKeywordFromSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logInfo('no active text editor');
        return;
    }
    const selection = editor.selection;
    const key = editor.document.getText(selection);
    if (!key || !key.trim()) {
        logInfo('no keyword selected');
        return;
    }

    // show input box for comment
    const comment = await vscode.window.showInputBox({
        prompt: 'input comment',
        placeholder: 'input comment, leave empty to show all'
    });
    if (!comment || !comment.trim()) {
        logInfo('comment is empty');
        return;
    }

    const item = keywordCache[key];
    if (item && Array.isArray(item)) {
        item.push(comment);
    }
    else {
        keywordCache[key] = [comment];
    }

    // save keyword
    saveKeyword();

    // refresh keyword
    refreshKeyword();
}
async function editKeywordFromHover(data) {
    const [key, editIndex] = data.split(':');
    if (!key || !key.trim()) {
        logInfo('no keyword selected');
        return;
    }

    // get comment from keywordCache
    const comment = keywordCache[key];
    if (!comment || !Array.isArray(comment)) {
        logInfo(`keyword "${key}" not found`);
        return;
    }

    const newComment = await vscode.window.showInputBox({
        prompt: 'input comment',
        value: comment[editIndex]
    });

    if (!newComment || !newComment.trim()) {
        logInfo('comment is empty');
        return;
    }

    comment[editIndex] = newComment;

    // update keyword
    saveKeyword();

    // refresh keyword
    refreshKeyword();
}


async function deleteKeywordFromHover(data) {
    const [key, delIndex] = data.split(':');
    if (!key || !key.trim()) {
        logInfo('no keyword for delete');
        return;
    }

    const comment = keywordCache[key];
    if (!comment || !Array.isArray(comment)) {
        logInfo(`keyword "${key}" not found`);
        return;
    }

    // show warning message
    const confirmation = await vscode.window.showWarningMessage(
        `confirm delete keyword "${key}" ?`,
        { modal: true },
        'delete'
    );
    if (confirmation != 'delete') {
        return;
    }

    comment.splice(Number(delIndex), 1);

    if (comment.length === 0) {
        delete keywordCache[key];
    }

    // save keyword
    saveKeyword();

    // refresh keyword
    refreshKeyword();
}

Keyword.registerCommands = function (context) {
    // ע����ͣ�ṩ����֧��30������
    const languages = ['javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'sql', 'pas', 'markdown', 'xml'];
    languages.forEach(language => {
        const disposable = vscode.languages.registerHoverProvider(language, {
            provideHover: Keyword.provideHover
        });
        Keyword.disposables.push(disposable); // ʹ��ͳһ����Դ����
        context.subscriptions.push(disposable);
    });

    // refresh keyword
    const refreshCommand = vscode.commands.registerCommand('keywordTreeView.refresh', refreshKeyword);
    Keyword.disposables.push(refreshCommand);
    context.subscriptions.push(refreshCommand);

    // search keyword
    const searchCommand = vscode.commands.registerCommand('keywordTreeView.search', async () => {
        const searchText = await vscode.window.showInputBox({
            prompt: 'input keyword',
            placeholder: 'input keyword, leave empty to show all'
        });
        if (searchText !== undefined && Keyword.keywordProvider) {
            Keyword.keywordProvider.setSearchText(searchText || '');
        }
    });
    Keyword.disposables.push(searchCommand);
    context.subscriptions.push(searchCommand);

    //  add keyword
    const addCommand = vscode.commands.registerCommand('keywordTreeView.add', addKeyword);
    Keyword.disposables.push(addCommand);
    context.subscriptions.push(addCommand);
    // edit keyword
    const editCommand = vscode.commands.registerCommand('keywordTreeView.edit', editKeyword);
    Keyword.disposables.push(editCommand);
    context.subscriptions.push(editCommand);
    // delete keyword
    const deleteCommand = vscode.commands.registerCommand('keywordTreeView.delete', deleteKeyword);
    Keyword.disposables.push(deleteCommand);
    context.subscriptions.push(deleteCommand);
    // import keyword file
    const importCommand = vscode.commands.registerCommand('keywordTreeView.import', importKeywordFile);
    Keyword.disposables.push(importCommand);
    context.subscriptions.push(importCommand);
    // add keyword shortcut
    const addFromSelectionCommand = vscode.commands.registerCommand('keywordTreeView.addFromSelection', addKeywordFromSelection);
    Keyword.disposables.push(addFromSelectionCommand);
    context.subscriptions.push(addFromSelectionCommand);
    // edit keyword from hover
    const editFromHoverCommand = vscode.commands.registerCommand('keywordTreeView.editFromHover', editKeywordFromHover);
    Keyword.disposables.push(editFromHoverCommand);
    context.subscriptions.push(editFromHoverCommand);
    // delete keyword from hover
    const deleteFromHoverCommand = vscode.commands.registerCommand('keywordTreeView.deleteFromHover', deleteKeywordFromHover);
    Keyword.disposables.push(deleteFromHoverCommand);
    context.subscriptions.push(deleteFromHoverCommand);
}
Keyword.loadKeywordConfig = function () {
    let configPaht = "./keywords.json";
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        configPaht = path.resolve(workspaceFolders[0].uri.fsPath, configPaht);
    }

    if (!fs.existsSync(configPaht)) {
        logInfo(`keyword config file not found: ${configPaht}`);
        keywordCache = {};
    }
    else {
        const content = fs.readFileSync(configPaht, 'utf8');
        keywordCache = JSON.parse(content);

        // 去重
        for (const key in keywordCache) {
            if (!Array.isArray(keywordCache[key])) continue;

            const seen = {}; // 用于记录已经出现过的注释
            keywordCache[key] = keywordCache[key].reduce((accumulator, currentComment) => {
                let realComment = currentComment;
                if (realComment.includes("::")) {
                    realComment = realComment.split("::")[1];
                }

                // 如果累加器中还没有这个注释，则添加
                if (!seen[realComment]) {
                    seen[realComment] = true; // 标记这个注释已经出现过
                    accumulator.push(currentComment);
                }

                return accumulator;
            }, []);
        }

        saveKeyword();
    }
}

Keyword.close = function () {
    Keyword.keywordTreeView.dispose();
    Keyword.keywordProvider.dispose();
    Keyword.disposables.forEach(disposable => disposable.dispose());
    Keyword.disposables = [];
}

module.exports = Keyword;