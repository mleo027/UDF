const Bookmark = require('./bookmark');
const Keyword = require('./keyword');
const sc = require('./sc')
const vscode = require('vscode');
const Completion = require('./completion')

let isActivated = false;

const showErrorMessage = (message) => {
    vscode.window.showErrorMessage(message);
}

async function activate(context) {
    try {
        isActivated = true;

        // 快捷键初始化
        await sc.init(context);

        // await Completion.init(context);

        // 加载书签主题配置
        Bookmark.loadBookmarkThemes();
        Keyword.loadKeywordConfig();

        Keyword.createView();
        context.subscriptions.push(Keyword.keywordTreeView);
        Keyword.registerCommands(context);

        // // 创建书签视图,并注册命�?
        Bookmark.createView();
        context.subscriptions.push(Bookmark.bookmarkTreeView);
        Bookmark.registerCommands(context);

        showErrorMessage('UDF 插件启用完成 ✅');
    } catch (error) {
        console.error('插件激活时发生错误:', error);
        showErrorMessage('⚠️ 配置加载失败，继续初始化基本功能'+error);
    }
}

function deactivate() {
    showErrorMessage('🛑 UDF Tooltip 插件停用');

    try {
        // 设置停用状�?
        isActivated = false;

        // 清理资源
        Bookmark.close();
        Keyword.close();

        console.log('🧹 插件停用完成，所有资源已清理');
    } catch (error) {
        showErrorMessage('插件停用时发生错�?:', error);
    }
}

module.exports = {
    activate,
    deactivate
}; 