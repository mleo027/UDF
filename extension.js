const Bookmark = require("./bookmark");
const Keyword = require("./keyword");
const utils = require("./utils");
const SqlInCpp = require("./module/SQLInCpp/sqlcheck");
const Jumper = require("./module/Jumper/jumper");
const Debugger = require("./module/SQLDebugger/debugger");
const CmdHandler = require("./module/CmdHandler/cmdhandler");
const Configer = require("./module/Configer/configer");

async function activate(context) {
  try {
    await SqlInCpp.ModuleInit(context);

    await Jumper.ModuleInit(context);

    await Debugger.ModuleInit(context);

    await CmdHandler.ModuleInit(context);

    await Configer.ModuleInit(context);

    Bookmark.loadBookmarkThemes();
    Keyword.loadKeywordConfig();

    Keyword.createView();
    context.subscriptions.push(Keyword.keywordTreeView);
    Keyword.registerCommands(context);

    Bookmark.createView();
    context.subscriptions.push(Bookmark.bookmarkTreeView);
    Bookmark.registerCommands(context);

    utils.showWarnMsg("UDF 插件启用完成 ✅");
  } catch (error) {
    console.error("插件激活时发生错误:", error);
    utils.showErrMsg("⚠️ 配置加载失败，继续初始化基本功能" + error);
  }
}

function deactivate() {
  utils.showWarnMsg("🛑 UDF Tooltip 插件停用");

  try {
    // 清理资源
    Bookmark.close();
    Keyword.close();

    console.log("🧹 插件停用完成，所有资源已清理");
  } catch (error) {
    utils.showErrMsg("插件停用时发生错�?:", error);
  }
}

module.exports = {
  activate,
  deactivate,
};
