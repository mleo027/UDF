const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const Bookmark = {
    configPath: '',
    activeThemeId: 0,
    disposables: [],
    bookmarkProvider: null,
    bookmarkTreeView: null,
    decorationType: null,
    fileBookmarkCache: new Map(),
}

function logInfo(message) {
    console.log(`LOGXXXX:${message}`);
}

function handleError(error, context = '', showToUser = true) {
    const errorMessage = `${context}: ${error.message || error}`;

    logInfo(`[Bookmark Error] ${errorMessage}`);

    return null;
}


async function saveBookmarkThemes() {
    try {
        const configData = {
            bookmarkThemes: bookmarkThemes
        };

        // 更新缓存
        Bookmark.fileBookmarkCache.clear();

        const jsonString = JSON.stringify(configData, null, 2);
        fs.writeFileSync(Bookmark.configPath, jsonString, 'utf8');

        return true;
    } catch (error) {
        vscode.window.showErrorMessage(`save bookmark themes failed: ${error.message}`);
        return false;
    }
}

async function updateCurrFileBookmarkPosition(relativePath) {
    let marks = Bookmark.fileBookmarkCache.get(relativePath);
    if (!marks) return;

    marks.forEach(element => {
        checkBookmarkPosition(element);
    });
}

let isDecorationInitialized = false;
function ensureBookmarkDecorationsInitialized() {
    if (isDecorationInitialized && Bookmark.decorationType) {
        return true;
    }

    try {
        if (Bookmark.decorationType) {
            Bookmark.decorationType.dispose();
        }

        Bookmark.decorationType = vscode.window.createTextEditorDecorationType({
            // 整行高亮基础样式
            backgroundColor: 'rgba(255, 193, 7, 0.1)', // 淡黄色背�??
            overviewRulerColor: '#FFC107', // 右侧标尺颜色
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            isWholeLine: true // 支持整行装饰
        });

        Bookmark.disposables.push(Bookmark.decorationType);

        isDecorationInitialized = true;
        return true;
    } catch (error) {
        handleError(error, 'initialize bookmark decorations failed');
        return false;
    }
}


function setCurrFileStyle(editor) {
    if (!editor) {
        editor = vscode.window.activeTextEditor;
        if (!editor) return;
    }

    logInfo("start set curr file style");
    try {

        ensureBookmarkDecorationsInitialized();
        if (!Bookmark.decorationType) return;

        const document = editor.document;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const absolutePath = document.uri.fsPath;
        const relativePath = './' + path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/');


        let fileBookmarks = Bookmark.fileBookmarkCache.get(relativePath);
        if (!fileBookmarks) {
            fileBookmarks = [];
            for (const theme of bookmarkThemes) {
                if (!theme || !theme.bookmarks) continue;
                for (const bookmark of theme.bookmarks) {
                    if (bookmark && bookmark.filePath === relativePath) {
                        bookmark.themeId = theme.id;
                        fileBookmarks.push(bookmark);
                    }
                }
            }
            Bookmark.fileBookmarkCache.set(relativePath, fileBookmarks);
        }

        updateCurrFileBookmarkPosition(relativePath)

        if (fileBookmarks.length === 0) {
            editor.setDecorations(Bookmark.decorationType, []);
            return;
        }

        const decorations = fileBookmarks
            .filter(bookmark => bookmark && typeof bookmark.lineNumber === 'number')
            .map(bookmark => {
                const line = Math.max(0, bookmark.lineNumber - 1);
                const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);

                const hoverMarkdown = new vscode.MarkdownString();
                hoverMarkdown.isTrusted = true;
                hoverMarkdown.supportThemeIcons = true;

                hoverMarkdown.appendMarkdown(`**${bookmark.title || 'no bookmark'}**\n\n`);
                hoverMarkdown.appendMarkdown(`${bookmark.content || 'no content'}\n\n`);
                hoverMarkdown.appendMarkdown(`---\n\n`);
                hoverMarkdown.appendMarkdown(`[$(edit)](command:bookmarkThemeView.editBookmarkFromHover?["${bookmark.themeId}:${bookmark.id}"])`);
                hoverMarkdown.appendMarkdown(`[$(trash)](command:bookmarkThemeView.deleteBookmarkFromHover?["${bookmark.themeId}:${bookmark.id}"])`);

                return {
                    range: range,
                    hoverMessage: hoverMarkdown,
                    renderOptions: {
                        backgroundColor: 'rgba(187, 234, 240, 0.15)', // 金黄色半透明背景
                        after: {
                            contentText: `📝 ${bookmark.title}`, // 显示书签标题
                            margin: '0 0 0 10px',
                            color: '#FFC107',
                            fontStyle: 'italic',
                            opacity: '0.5'
                        }
                    },
                    isWholeLine: true
                };
            });
        editor.setDecorations(Bookmark.decorationType, decorations);

    } catch (error) {
        handleError(error, 'update bookmark decorations failed', false);
    }
}

Bookmark.setActiveTheme = async function (themeId) {
    try {
        if (!themeId) {
            vscode.window.showWarningMessage('no theme id');
            return;
        }

        if (Bookmark.activeThemeId === themeId) {
            return;
        }

        Bookmark.activeThemeId = themeId;
        if (Bookmark.bookmarkProvider) {
            Bookmark.bookmarkProvider.refresh();
        }
        logInfo(`set active theme: ${themeId}`);
    } catch (error) {
        handleError(error, 'set active theme failed');
    }
}

Bookmark.setActiveBMark = async function (bookmark) {
    if(!bookmark || !bookmark.id)
        return null;

    const activeTheme =  bookmarkThemes.find(theme => theme.id === Bookmark.activeThemeId);

    // for loop to get index
    let index = activeTheme.bookmarks?.length || -1;
    for(let i= 0;i<activeTheme.bookmarks.length;i++){
        if(activeTheme.bookmarks[i].id === bookmark.id){
            index = i;
            break;
        }
    }

    Bookmark.activeBMarkId = index;
}

/**
 * load bookmark themes
 */
let bookmarkThemes = [];

Bookmark.loadBookmarkThemes = async function () {
    console.log("LOGXXXX: start load bookmark themes");
    try {
        const config = vscode.workspace.getConfiguration('bookmarkTheme');
        const configPath = config.get('configPath', './bookmark-themes.json');

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return bookmarkThemes;
        }
        Bookmark.configPath = path.resolve(workspaceFolders[0].uri.fsPath, configPath);

        const exists = fs.existsSync(Bookmark.configPath);
        if (exists) {
            const data = fs.readFileSync(Bookmark.configPath, { encoding: 'utf8' });
            if (!data) {
                logInfo("bookmark-themes data not found");
                return bookmarkThemes;
            }

            const rawConfig = JSON.parse(data);
            logInfo("parse bookmark themes success");

            if (rawConfig.bookmarkThemes && Array.isArray(rawConfig.bookmarkThemes)) {
                bookmarkThemes = rawConfig.bookmarkThemes;

                // await Bookmark.updateBookmarkPosition(bookmarkThemes);

                setCurrFileStyle();

                isDecorationInitialized = false;

                Bookmark.activeThemeId = bookmarkThemes[0]?.id || 0;
            } else {
                bookmarkThemes = [];
            }
        } else {
            logInfo('bookmark themes file not found:', Bookmark.configPath);
            bookmarkThemes = [];
        }
    } finally {
        isBookmarkLoading = false;
    }
}

Bookmark.createView = function () {
    Bookmark.bookmarkProvider = new Bookmark.BookmarkThemeProvider();
    Bookmark.bookmarkTreeView = vscode.window.createTreeView('bookmarkThemeView', {
        treeDataProvider: Bookmark.bookmarkProvider,
        showCollapseAll: true
    });
    Bookmark.disposables.push(Bookmark.bookmarkTreeView);
}

Bookmark.registerCommands = function (context) {

    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            setCurrFileStyle(editor);
        }
    });

    // title
    // refresh bookmark
    const refreshCommand = vscode.commands.registerCommand('bookmarkThemeView.refreshBookmark', async () => {
        if (Bookmark.bookmarkProvider) {
            logInfo("refresh bookmark");
            Bookmark.bookmarkProvider.setSearchText('');
            Bookmark.bookmarkProvider.refresh();
        }
    });
    Bookmark.disposables.push(refreshCommand);
    context.subscriptions.push(refreshCommand);
    // search bookmark
    const bookmarkSearchCommand = vscode.commands.registerCommand('bookmarkThemeView.search', async () => {
        const searchText = await vscode.window.showInputBox({
            prompt: '搜索书签 (主题名称、书签标题或内容)',
            placeholder: '输入关键词进行搜索，留空显示全部'
        });

        if (searchText !== undefined && Bookmark.bookmarkProvider) {
            Bookmark.bookmarkProvider.setSearchText(searchText || '');
        }
    });
    Bookmark.disposables.push(bookmarkSearchCommand);
    context.subscriptions.push(bookmarkSearchCommand);

    // *******************bookmark*******************
    // goto bookmark
    const gotoCommand = vscode.commands.registerCommand('bookmarkThemeView.gotoBookmark', Bookmark.gotoBookmark);
    Bookmark.disposables.push(gotoCommand);
    context.subscriptions.push(gotoCommand);
    // edit bookmark
    const editCommand = vscode.commands.registerCommand('bookmarkThemeView.editBookmark', Bookmark.editBookmark);
    Bookmark.disposables.push(editCommand);
    context.subscriptions.push(editCommand);
    // delete bookmark
    const deleteCommand = vscode.commands.registerCommand('bookmarkThemeView.deleteBookmark', Bookmark.deleteBookmark);
    Bookmark.disposables.push(deleteCommand);
    context.subscriptions.push(deleteCommand);
    // add bookmark here
    const addBookmarkHereCommand = vscode.commands.registerCommand('bookmarkThemeView.addBookmarkHere', Bookmark.addBookmarkHere);
    Bookmark.disposables.push(addBookmarkHereCommand);
    context.subscriptions.push(addBookmarkHereCommand);
    // edit bookmark from hover
    const editBookmarkFromHover = vscode.commands.registerCommand('bookmarkThemeView.editBookmarkFromHover', Bookmark.editBookmarkFromHover);
    Bookmark.disposables.push(editBookmarkFromHover);
    context.subscriptions.push(editBookmarkFromHover);
    // delete bookmark from hover
    const deleteBookmarkFromHover = vscode.commands.registerCommand('bookmarkThemeView.deleteBookmarkFromHover', Bookmark.deleteBookmarkFromHover);
    Bookmark.disposables.push(deleteBookmarkFromHover);
    context.subscriptions.push(deleteBookmarkFromHover);

    // *******************theme*******************
    // add theme
    const addThemeCommand = vscode.commands.registerCommand('bookmarkThemeView.addTheme', Bookmark.addTheme);
    Bookmark.disposables.push(addThemeCommand);
    context.subscriptions.push(addThemeCommand);
    // edit theme
    const editThemeCommand = vscode.commands.registerCommand('bookmarkThemeView.editTheme', Bookmark.editTheme);
    Bookmark.disposables.push(editThemeCommand);
    context.subscriptions.push(editThemeCommand);
    // delete theme
    const deleteThemeCommand = vscode.commands.registerCommand('bookmarkThemeView.deleteTheme', Bookmark.deleteTheme);
    Bookmark.disposables.push(deleteThemeCommand);
    context.subscriptions.push(deleteThemeCommand);
    // set active theme
    const setActiveThemeCommand = vscode.commands.registerCommand('bookmarkThemeView.setActiveTheme', Bookmark.setActiveTheme);
    Bookmark.disposables.push(setActiveThemeCommand);
    context.subscriptions.push(setActiveThemeCommand);
}

function tryDecodeCmp(fullPath, bookmark, encoding) {
    let content
    if (encoding == "gbk") {
        content = fs.readFileSync(fullPath);
        content = iconv.decode(content, "gbk")
    }
    else {
        content = fs.readFileSync(fullPath, 'utf8');
    }
    const lines = content.split('\n');
    const index = bookmark.lineNumber - 1;

    if (index >= 0 && index < lines.length) {
        const currentContent = lines[index].trim()
        const originalContent = bookmark.originalContent.trim();
        if (currentContent === originalContent) {
            return true;
        }
    }
    return false;
}

function tryDecodeQry(fullPath, bookmark, encoding) {
    let content
    if (encoding == "gbk") {
        content = fs.readFileSync(fullPath);
        content = iconv.decode(content, "gbk")
    }
    else {
        content = fs.readFileSync(fullPath, 'utf8');
    }
    const lines = content.split('\n');

    const searchContent = bookmark.originalContent.trim();
    for (let i = 0; i < lines.length; i++) {
        const lineContent = lines[i].trim();
        if (lineContent === searchContent) {
            const newLineNumber = i + 1;
            bookmark.lineNumber = newLineNumber;
            bookmark.lastUpdated = new Date().toLocaleTimeString();
            return true;
        }
    }

    return false;
}


// update bookmark position
async function checkBookmarkPosition(bookmark) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return 'missing';
    }
    const fullPath = path.resolve(workspaceFolders[0].uri.fsPath, bookmark.filePath);
    if (!fs.existsSync(fullPath)) {
        bookmark.status = 'missing';
        console.log(`file not found: ${bookmark.filePath}`);
        return 'missing';
    }

    if (tryDecodeCmp(fullPath, bookmark) || tryDecodeCmp(fullPath, bookmark, "gbk")) {
        bookmark.status = 'valid';
        return 'valid';
    }

    if (tryDecodeQry(fullPath, bookmark) || tryDecodeQry(fullPath, bookmark, "gbk")) {
        bookmark.status = 'valid'
        return 'updated';
    }

    bookmark.status = 'missing';
    logInfo(`bookmark not found: ${bookmark.title} in ${bookmark.filePath} ${bookmark.lineNumber}`);
    return 'missing';
}
Bookmark.updateBookmarkPosition = async function (themes) {
    logInfo("start update bookmark position");
    let updatedCount = 0;
    let missingCount = 0;
    for (const theme of themes) {
        if (!theme || !theme.bookmarks) continue;

        for (const bookmark of theme.bookmarks) {
            const result = await checkBookmarkPosition(bookmark);
            if (result === 'updated') {
                updatedCount++;
            } else if (result === 'missing') {
                missingCount++;
            }
        }
    }

    logInfo(`? bookmark updated: ${updatedCount}, missing: ${missingCount}`);

    if (updatedCount > 0 || missingCount > 0) {
        if (Bookmark.bookmarkProvider) {
            Bookmark.bookmarkProvider.refresh();
        }
        // save bookmark themes
        // await saveBookmarkThemes();
    }
}

//********************************************* bookmark api functions ******************************************************
// goto bookmark
Bookmark.gotoBookmark = async function (item) {
    try {
        const bookmark = item.data;

        Bookmark.setActiveTheme(bookmark.themeId);
        Bookmark.setActiveBMark(bookmark)

        Bookmark.bookmarkProvider.refresh();

        if (bookmark.status === 'missing') {
            vscode.window.showWarningMessage(`bookmark position not found: ${bookmark.title}`);
            // return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        const fullPath = path.resolve(workspaceFolders[0].uri.fsPath, bookmark.filePath);
        const uri = vscode.Uri.file(fullPath);

        // open file
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        const line = bookmark.lineNumber - 1;
        const position = new vscode.Position(line, 0);

        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

        setCurrFileStyle(editor);

        logInfo(`goto bookmark: ${bookmark.title} at ${bookmark.filePath}:${bookmark.lineNumber}`);

    } catch (error) {
        handleError(error, 'goto bookmark failed');
    }
}
// edit bookmark
Bookmark.editBookmark = async function (item) {
    const bookmark = item.data;
    logInfo(`edit bookmark: ${bookmark.title}`);
    const title = await vscode.window.showInputBox({
        prompt: 'edit bookmark title',
        value: bookmark.title,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'bookmark title cannot be empty';
            }
            return null;
        }
    });

    if (!title) return;

    const content = await vscode.window.showInputBox({
        prompt: 'edit bookmark content',
        value: bookmark.content
    });

    if (title.trim() !== bookmark.title || (content || '').trim() !== bookmark.content) {
        bookmark.title = title.trim();
        bookmark.content = (content || '').trim();
        bookmark.lastUpdated = new Date().toLocaleTimeString();

        const saved = await saveBookmarkThemes();
        if (saved && Bookmark.bookmarkProvider) {
            Bookmark.bookmarkProvider.refresh();
            setCurrFileStyle();
            vscode.window.showInformationMessage(`edit bookmark: ${title.trim()}`);
        }

        Bookmark.bookmarkProvider.refresh();
        vscode.window.showInformationMessage(`edit bookmark: ${title.trim()}`);
    }

    Bookmark.bookmarkProvider.refresh();
    vscode.window.showInformationMessage(`edit bookmark: ${title.trim()}`);
}
// delete bookmark
Bookmark.deleteBookmark = async function (item) {
    const bookmark = item.data;

    const confirmation = await vscode.window.showWarningMessage(
        `confirm delete bookmark "${bookmark.title}" ?`,
        { modal: true },
        'delete'
    );

    if (confirmation === 'delete') {
        // find and delete bookmark
        for (const theme of bookmarkThemes) {
            const index = theme.bookmarks.findIndex(b => b.id === bookmark.id);
            if (index !== -1) {
                theme.bookmarks.splice(index, 1);
                break;
            }
        }

        const saved = await saveBookmarkThemes();
        if (saved && Bookmark.bookmarkProvider) {
            Bookmark.bookmarkProvider.refresh();
            setCurrFileStyle();
            vscode.window.showInformationMessage(`delete bookmark: ${bookmark.title}`);
        }
    }
}
// add bookmark here
Bookmark.addBookmarkHere = async function (item) {
    // get current editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logInfo('no active editor');
        return;
    }

    // get current line number
    const lineNumber = editor.selection.active.line;
    logInfo(`current line number: ${lineNumber}`);
    const document = editor.document;
    const lineContent = document.lineAt(lineNumber).text;

    // check if there is a bookmark
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        logInfo('no workspace folders');
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const absolutePath = document.uri.fsPath;
    const relativePath = './' + path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/');

    //get active theme
    const activeTheme = bookmarkThemes.find(theme => theme.id === Bookmark.activeThemeId);
    if (!activeTheme) {
        vscode.window.showWarningMessage('no active theme found');
        return;
    }

    // bookmark has existed
    if (activeTheme.bookmarks && activeTheme.bookmarks.length > 0) {
        for (const bookmark of activeTheme.bookmarks) {
            if (bookmark.filePath === relativePath && bookmark.lineNumber === lineNumber) {
                logInfo(`existing bookmark: ${bookmark.title}`);
                return;
            }
        }
    }
    logInfo(`current linewwwwwwwwwww number: ${lineNumber}`);

    // input bookmark title
    const title = await vscode.window.showInputBox({
        prompt: 'input bookmark title',
        placeholder: 'example: user login verification logic',
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'bookmark title cannot be empty';
            }
            return null;
        }
    });

    if (!title) return;

    // input bookmark content
    const content = await vscode.window.showInputBox({
        prompt: 'input your idea and note (optional)',
        placeholder: 'example: here handle user login logic, need to pay attention to password encryption and session management',
        value: ''
    });

    // create new bookmark
    const newBookmark = {
        id: `bm_${Date.now()}`,
        title: title.trim(),
        content: (content || '').trim(),
        filePath: relativePath,
        lineNumber: lineNumber + 1,
        originalContent: lineContent.trim(),
        createdAt: new Date().toLocaleTimeString(),
        lastUpdated: new Date().toLocaleTimeString(),
        status: 'valid',
        themeId: Bookmark.activeThemeId
    };

    if (Bookmark.activeBMarkId && Array.isArray(activeTheme.bookmarks))
        activeTheme.bookmarks.splice(Bookmark.activeBMarkId + 1, 0, newBookmark);
    else
        activeTheme.bookmarks.push(newBookmark);

    Bookmark.activeBMarkId = Bookmark.activeBMarkId + 1

    const saved = await saveBookmarkThemes();
    if (saved) {
        if (Bookmark.bookmarkProvider) {
            Bookmark.bookmarkProvider.refresh();
        }

        setCurrFileStyle(editor);

        vscode.window.showInformationMessage(`add bookmark to theme: ${selectedTheme.name}: ${title.trim()}`);
    }

}
// edit bookmark from hover
Bookmark.editBookmarkFromHover = async function (arg) {
    const [themeId, bookmarkId] = arg.split(':');
    const theme = bookmarkThemes.find(theme => theme.id === themeId);
    if (!theme) {
        vscode.window.showWarningMessage(`theme not found: ${themeId}`);
        return;
    }
    const bookmark = theme.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) {
        vscode.window.showWarningMessage(`bookmark not found: ${bookmarkId}`);
        return;
    }

    Bookmark.editBookmark({ data: bookmark });
}
// delete bookmark from hover
Bookmark.deleteBookmarkFromHover = async function (arg) {
    const [themeId, bookmarkId] = arg.split(':');
    const theme = bookmarkThemes.find(theme => theme.id === themeId);
    if (!theme) {
        vscode.window.showWarningMessage(`theme not found: ${themeId}`);
        return;
    }
    const bookmark = theme.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) {
        vscode.window.showWarningMessage(`bookmark not found: ${bookmarkId}`);
        return;
    }

    Bookmark.deleteBookmark({ data: bookmark });
}

//************************************************* theme api functions *************************************************************
// edit theme
Bookmark.editTheme = async function (item) {
    const theme = item.data;

    const name = await vscode.window.showInputBox({
        prompt: 'edit theme name',
        value: theme.name,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'theme name cannot be empty';
            }
            return null;
        }
    });

    if (!name) return;

    const description = await vscode.window.showInputBox({
        prompt: 'edit theme description',
        value: theme.description
    });

    if (name.trim() !== theme.name || (description || '').trim() !== theme.description) {
        theme.name = name.trim();
        theme.description = (description || '').trim();

        const saved = await saveBookmarkThemes();
        if (saved && Bookmark.bookmarkProvider) {
            Bookmark.bookmarkProvider.refresh();
            vscode.window.showInformationMessage(`edit theme: ${name.trim()}`);
        }
    }
}
// delete theme
Bookmark.deleteTheme = async function (item) {
    const theme = item.data;

    const confirmation = await vscode.window.showWarningMessage(
        `confirm delete theme "${theme.name}" with ${theme.bookmarks.length} bookmarks`,
        { modal: true },
        'delete'
    );

    if (confirmation === 'delete') {
        const index = bookmarkThemes.findIndex(t => t.id === theme.id);
        if (index !== -1) {
            bookmarkThemes.splice(index, 1);
        }

        const saved = await saveBookmarkThemes();
        if (saved && Bookmark.bookmarkProvider) {
            Bookmark.bookmarkProvider.refresh();
            vscode.window.showInformationMessage(`delete theme: ${theme.name}`);
        }
    }
}
// add theme
Bookmark.addTheme = async function () {
    const name = await vscode.window.showInputBox({
        prompt: 'input theme name',
        value: ''
    });

    if (!name) return;

    const description = await vscode.window.showInputBox({
        prompt: 'input theme description',
        value: ''
    });

    const newTheme = {
        id: `theme_${Date.now()}`,
        name: name.trim(),
        description: description?.trim() || '',
        color: '#4CAF50',
        icon: 'folder',
        createdAt: new Date().toLocaleTimeString(),
        bookmarks: []
    };

    bookmarkThemes.push(newTheme);

    const saved = await saveBookmarkThemes();
    if (saved && Bookmark.bookmarkProvider) {
        Bookmark.setActiveTheme(newTheme.id);
        Bookmark.bookmarkProvider.refresh();
        vscode.window.showInformationMessage(`add theme: ${name.trim()}`);
    }

}

//**************************************************************************************************************

// bookmark theme provider
class BookmarkThemeItem extends vscode.TreeItem {
    constructor(type, data, collapsibleState) {
        super(data.name || data.title, collapsibleState);

        this.type = type;
        this.data = data;

        if (type === 'theme') {
            const isActive = data.id === Bookmark.activeThemeId;
            this.contextValue = 'themeItem';

            // 美化主题图标和样�??
            if (isActive) {
                this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('list.activeSelectionForeground'));
                this.label = `${data.name}`;
            } else {
                this.iconPath = new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('list.inactiveSelectionForeground'));
                this.label = data.name;
            }

            // 丰富描述信息
            const bookmarkCount = data.bookmarks?.length || 0;
            const bookmarkText = bookmarkCount === 1 ? 'bookmark' : 'bookmarks';
            this.description = `${bookmarkCount} ${bookmarkText}`;

            // 增强悬停提示
            const createdDate = data.createdAt ? new Date(data.createdAt).toLocaleDateString() : 'Unknown';
            this.tooltip = new vscode.MarkdownString();
            this.tooltip.isTrusted = true;
            this.tooltip.supportThemeIcons = true;
            this.tooltip.appendMarkdown(`**$(folder) ${data.name}**${isActive ? ' *(Active)*' : ''}\n\n`);
            if (data.description) {
                this.tooltip.appendMarkdown(`*${data.description}*\n\n`);
            }
            this.tooltip.appendMarkdown(`$(bookmark) **${bookmarkCount}** ${bookmarkText}\n\n`);
            this.tooltip.appendMarkdown(`$(calendar) Created: ${createdDate}\n`);
            if (isActive) {
                this.tooltip.appendMarkdown(`$(check) Currently active theme`);
            } else {
                this.tooltip.appendMarkdown(`$(circle-outline) Click to activate`);
            }

            this.command = {
                command: 'bookmarkThemeView.gotoBookmark',
                title: 'goto first bookmark',
                arguments: [{"data":data?.bookmarks?.[0]}]
            };
        } else if (type === 'bookmark') {
            this.contextValue = 'bookmarkItem';

            // 根据书签状态选择图标和颜�??
            if (data.status === 'missing') {
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
                this.label = `⚠️ ${data.title}`;
            } else {
                this.iconPath = new vscode.ThemeIcon('bookmark', new vscode.ThemeColor('list.highlightForeground'));
                this.label = data.title;
            }

            // 美化描述信息
            const fileName = path.basename(data.filePath || '');
            this.description = `${fileName}:${data.lineNumber}`;

            // 增强悬停提示
            this.tooltip = new vscode.MarkdownString();
            this.tooltip.isTrusted = true;
            this.tooltip.supportThemeIcons = true;

            if (data.status === 'missing') {
                this.tooltip.appendMarkdown(`**$(warning) ${data.title}** *(Missing)*\n\n`);
                this.tooltip.appendMarkdown(`$(error) File not found or line changed\n\n`);
            } else {
                this.tooltip.appendMarkdown(`**$(bookmark) ${data.title}**\n\n`);
            }

            if (data.content && data.content.trim()) {
                this.tooltip.appendMarkdown(`*${data.content}*\n\n`);
            }

            this.tooltip.appendMarkdown(`---\n\n`);
            this.tooltip.appendMarkdown(`$(file) **File:** \`${data.filePath}\`\n`);
            this.tooltip.appendMarkdown(`$(debug-line-by-line) **Line:** ${data.lineNumber}\n\n`);

            if (data.status !== 'missing') {
                this.tooltip.appendMarkdown(`$(arrow-right) Click to navigate to bookmark`);
            }

            this.command = {
                command: 'bookmarkThemeView.gotoBookmark',
                title: 'goto bookmark',
                arguments: [this]
            };
        }
    }
}
Bookmark.BookmarkThemeProvider = class {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.searchText = '';
        this.searchCache = new Map(); // search cache
        this._isRefreshing = false; // prevent refresh
        this._selectedItem = null;
    }


    // refresh bookmark theme
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
            this.searchCache.clear(); // clear search cache
            this.refresh();
        }
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        try {
            if (!element) {
                // root node, search
                if (this.searchText) {
                    // use search
                    const cacheKey = this.searchText;
                    if (this.searchCache.has(cacheKey)) {
                        return this.searchCache.get(cacheKey);
                    }

                    const filteredThemes = bookmarkThemes.filter(theme => {
                        if (!theme || !theme.name) return false;

                        const themeText = `${theme.name} ${theme.description || ''}`.toLowerCase();
                        if (themeText.includes(this.searchText)) {
                            return true;
                        }
                        // check bookmark
                        return (theme.bookmarks || []).some(bookmark => {
                            if (!bookmark) return false;
                            const bookmarkText = `${bookmark.title || ''} ${bookmark.content || ''}`.toLowerCase();
                            return bookmarkText.includes(this.searchText);
                        });
                    });

                    const result = filteredThemes.map(theme => new BookmarkThemeItem('theme', theme, vscode.TreeItemCollapsibleState.Expanded));
                    this.searchCache.set(cacheKey, result);
                    return result;
                }
                return bookmarkThemes.map(theme => new BookmarkThemeItem('theme', theme, vscode.TreeItemCollapsibleState.Expanded));
            } else if (element.type === 'theme') {
                const theme = element.data;
                if (!theme || !theme.bookmarks) return [];

                if (this.searchText) {
                    return theme.bookmarks
                        .filter(bookmark => {
                            if (!bookmark) return false;
                            const bookmarkText = `${bookmark.title || ''} ${bookmark.content || ''}`.toLowerCase();
                            return bookmarkText.includes(this.searchText);
                        })
                        .map(bookmark => new BookmarkThemeItem('bookmark', bookmark, vscode.TreeItemCollapsibleState.None));
                }
                return theme.bookmarks.map(bookmark => new BookmarkThemeItem('bookmark', bookmark, vscode.TreeItemCollapsibleState.None));
            }
            return [];
        } catch (error) {
            handleError(error, 'get bookmark theme failed');
            return [];
        }
    }

    dispose() {
        if (this._onDidChangeTreeData) {
            this._onDidChangeTreeData.dispose();
        }
        this.searchCache.clear();
    }
}

Bookmark.close = function () {
    Bookmark.bookmarkTreeView.dispose();
    Bookmark.bookmarkProvider.dispose();
    Bookmark.decorationType.dispose();
    Bookmark.fileBookmarkCache.clear();
    Bookmark.disposables.forEach(disposable => disposable.dispose());
    Bookmark.disposables = [];
}


module.exports = Bookmark;