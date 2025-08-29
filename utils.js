
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite'); // npm install -D 
const sql = require('mssql')


const config = {
    user: 'sa',
    password: 'root',
    server: 'localhost', // 例如 'localhost' 或 '192.168.1.100'
    database: 'run',
    options: {
        encrypt: false, // 如果你使用的是 Azure SQL Database，需要此项
        trustServerCertificate: true // 如果是本地开发环境，可能需要此项
    }
};

async function runQuery(sSql) {
    await sql.connect(config);
    const result = await sql.query(sSql);
    return result.recordset
}

async function getMenuPos(menuid) {
    const result = await runQuery(`select menupos from sysmenu where menuid = ${menuid}`)
    if (!result[0]) {
        return null;
    }

    let pos = result[0]["menupos"]

    let detail = ''
    while (pos.length > 0) {
        const r = await runQuery(`select menuprompt from sysmenu where menupos = '${pos}'`)
        if (!r[0])
            break;

        detail = r[0]["menuprompt"] + '-' + detail;

        pos = pos.substring(0, pos.length - 1)
    }

    return `【${detail.substring(0, detail.length - 1)}】`
}


async function getFuncInfo(funcid) {

    const r = await runQuery(`select funcname from sysfunc where funcid = '${funcid}'`)

    return `${funcid}:${r[0]["funcname"]}`
}

function getAllFilesOfDir(dir, filter) {
    const files = fs.readdirSync(dir);
    let allFiles = [];

    files.forEach(file => {
        const filePath = path.join(dir, file);

        if (filePath.endsWith('.svn') || filePath.endsWith('.svn-base'))
            return;

        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            allFiles = allFiles.concat(getAllFilesOfDir(filePath, filter));
        } else {

            if (filter && filter(filePath)) {
                allFiles.push(filePath);
            }
            else {
                allFiles.push(filePath);

            }
        }
    });
    return allFiles;
}


function readGBKFile(filePath) {

    if (!fs.existsSync(filePath)) {
        return null;
    };

    const fileContent = fs.readFileSync(filePath);
    const utf8Content = iconv.decode(fileContent, 'gbk');
    return utf8Content;
}

function writeFileSync(filename, content) {

    //try to remove
    if (fs.existsSync(filename)) {
        fs.unlinkSync(filename)
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
    };
    const utf8Content = fs.readFileSync(filename, 'utf-8')
    return utf8Content;
}

function appendFileSync(filename, str) {
    fs.appendFileSync(filename, str);
}

async function getSymbolsCache(key) {
    // Shortcuts.context 必须在 init 中赋值
    const cachedData = extensionContext.globalState.get(key);
    if (cachedData) {
        return JSON.parse(cachedData);
    }
    return null;
}


async function setSymbolsCache(key, val) {
    await extensionContext.globalState.update(key, JSON.stringify(symbols));
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
    getFuncInfo
}
