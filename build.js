const electronInstaller = require('electron-winstaller');
const path = require('path');

const rootPath = path.join('./');

resultPromise = electronInstaller.createWindowsInstaller({
    appDirectory: './release-builds/POS-win32-x64',
    outputDirectory: './installers',
    authors: 'Hosting Domain',
    noMsi: true,
    exe: 'pos.exe',
    setupExe: 'POSInstaller.exe',
    setupIcon: path.join(rootPath, 'assets', 'images', 'icon.ico')
  });

resultPromise.then(() => console.log("It worked!"), (e) => console.log(`No dice: ${e.message}`));