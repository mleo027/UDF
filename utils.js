const fs = require("fs");
const path = require("path");
const iconv = require("iconv-lite"); // npm install -D
const sql = require("mssql");
const vscode = require("vscode");
const configer = require("./module/Configer/configer");

const config = {
  user: "sa",
  password: "",
  server: "localhost", // 例如 'localhost' 或 '192.168.1.100'
  database: "run",
  options: {
    encrypt: false, // 如果你使用的是 Azure SQL Database，需要此项
    trustServerCertificate: true, // 如果是本地开发环境，可能需要此项
  },
};

async function runQuery(sSql) {
  config.user = configer.getConfig("SQL.user");
  if (!config.user) {
    showErrMsg("数据库连接用户配置错误");
    return null;
  }

  config.password = configer.getConfig("SQL.password");
  if (!config.password) {
    showErrMsg("数据库连接密码配置错误");
    return null;
  }

  config.database = configer.getConfig("SQL.database");
  if (!config.database) {
    showErrMsg("数据库名称配置错误");
    return null;
  }

  config.server_name = configer.getConfig("SQL.server_name");
  if (!config.server_name) {
    showErrMsg("数据库服务器配置错误1");
    return null;
  }

  const items = config.server_name.split(":");
  if (items.length !== 2) {
    showErrMsg("数据库服务器配置错误2");
    return null;
  }

  config.server = items[0];
  config.port = Number(items[1]) || 1433;

  await sql.connect(config);
  const result = await sql.query(sSql);
  return result.recordset;
}

async function getMenuPos(menuid) {
  const result = await runQuery(
    `select menupos from sysmenu where menuid = ${menuid}`
  );
  if (!result[0]) {
    return null;
  }

  let pos = result[0]["menupos"];

  let detail = "";
  while (pos.length > 0) {
    const r = await runQuery(
      `select menuprompt from sysmenu where menupos = '${pos}'`
    );
    if (!r[0]) break;

    detail = r[0]["menuprompt"] + "-" + detail;

    pos = pos.substring(0, pos.length - 1);
  }

  return `【${detail.substring(0, detail.length - 1)}】`;
}

async function getFuncInfo(funcid) {
  const r = await runQuery(
    `select funcname from sysfunc where funcid = '${funcid}'`
  );

  return `${funcid}:${r[0]["funcname"]}`;
}

function getAllFilesOfDir(dir, filter) {
  const files = fs.readdirSync(dir);
  let allFiles = [];

  files.forEach((file) => {
    const filePath = path.join(dir, file);

    if (filePath.endsWith(".svn") || filePath.endsWith(".svn-base")) return;

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      allFiles = allFiles.concat(getAllFilesOfDir(filePath, filter));
    } else {
      if (filter && filter(filePath)) {
        allFiles.push(filePath);
      } else {
        allFiles.push(filePath);
      }
    }
  });
  return allFiles;
}

function readGBKFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const fileContent = fs.readFileSync(filePath);
  const utf8Content = iconv.decode(fileContent, "gbk");
  return utf8Content;
}

function writeFileSync(filename, content) {
  //try to remove
  if (fs.existsSync(filename)) {
    fs.unlinkSync(filename);
  }

  return fs.writeFileSync(filename, content);
}

function delFileSync(filename) {
  if (fs.existsSync(filename)) {
    fs.unlinkSync(filename);
  }
}

function readUtf8File(filename) {
  if (!fs.existsSync(filename)) {
    return null;
  }
  const utf8Content = fs.readFileSync(filename, "utf-8");
  return utf8Content;
}

function appendFileSync(filename, str) {
  fs.appendFileSync(filename, str);
}

const { format } = require("date-fns");
function basicLog(level, message) {
  const now = new Date();
  const logTime = format(now, "yyyy-MM-dd HH:mm");

  console.log(`[${logTime}][${level}][${message}] `);
}

function logInfo(message) {
  basicLog("info", message);
}

function logWarn(message) {
  basicLog("warn", message);
}

function logError(message) {
  basicLog("error", message);
}

function showWarnMsg(msg) {
  vscode.window.showWarningMessage(msg);
}

function showErrMsg(msg) {
  vscode.window.showErrorMessage(msg);
}

function showInfoMsg(msg) {
  vscode.window.showInformationMessage(msg);
}

// skipNum:跳过的逗号次数
function findCommaOutsideQuotes(str, skipNum) {
  const stack = []; // 使用数组来模拟栈

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    // 处理双引号
    if (char === '"') {
      if (stack.length === 0) {
        // 遇到第一个双引号，推入栈
        stack.push('"');
      } else {
        // 遇到第二个双引号，弹出栈
        stack.pop();
      }
    }

    // 查找逗号
    if (char === ",") {
      // 检查栈是否为空
      // 如果栈为空，表示当前不在双引号内部
      if (stack.length === 0) {
        if (skipNum > 0) {
          skipNum--;
          continue;
        }

        return i; // 返回逗号的索引
      }
    }
  }

  // 如果遍历完字符串都没有找到，返回 -1
  return -1;
}

module.exports = {
  getAllFilesOfDir,
  readGBKFile,
  writeFileSync,
  delFileSync,
  readUtf8File,
  appendFileSync,
  runQuery,
  getMenuPos,
  getFuncInfo,
  logInfo,
  logWarn,
  logError,
  findCommaOutsideQuotes,
  showWarnMsg,
  showErrMsg,
  showInfoMsg,
};
