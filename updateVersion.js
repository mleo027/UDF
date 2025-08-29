const fs = require('fs');
const path = require('path');


const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const version = packageJson.version;
const [maininfo,timeStamp] = version.split('-');
const [major, minor, patch] = maininfo.split('.');
const newVersion = `${major}.${minor}.${patch}-${Date.now()}`;

packageJson.version = newVersion;

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

