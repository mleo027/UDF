const vscode = require("vscode");

class Completion {
  static init(context) {
    // 注册传统补全提供者（下拉列表）
    // 移除触发字符参数，让补全在任何输入时都可能被触发
    const provider = vscode.languages.registerCompletionItemProvider(
      "*", // 所有文件类型
      {
        provideCompletionItems(document, position) {
          // 获取光标前的文本
          const lineText = document.lineAt(position.line).text;
          const prefix = lineText.substring(0, position.character);

            vscode.window.showErrorMessage("message");

          // 检查前缀是否以 "abre" 结尾
          if (prefix.endsWith("bre") || true) {
            const completionItem = new vscode.CompletionItem(
              "BusRaiseException",
              vscode.CompletionItemKind.Function // 更合适的类型（函数/标识符）
            );
            completionItem.insertText = "BusRaiseException";
            return [completionItem];
          }

          return [];
        },
      }
      ,
      'a'
      // 移除触发字符参数，避免限制触发时机
    );

    context.subscriptions.push(provider);
    console.log("补全插件已激活");
  }
}

module.exports = Completion;
