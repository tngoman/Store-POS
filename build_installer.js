const { MSICreator } = require('electron-wix-msi');
const path = require('path');

const APP_DIR = path.resolve(__dirname, './release-builds/POS-win32-x64');
const OUT_DIR = path.resolve(__dirname, './windows_installer');

// 3. Instantiate the MSICreator
const msiCreator = new MSICreator({
    appDirectory: APP_DIR,
    outputDirectory: OUT_DIR,

    // Configure metadata
    description: 'Store Point of Sale is a desktop application developed by Hosting Domain and available for free download at www.storepointofsale.com.',
    exe: 'StorePOS',
    name: 'StorePOS',
    manufacturer: 'Hosting Domain',
    version: '1.0.0',

    // Configure installer User Interface
    ui: {
        chooseDirectory: true
    },
});

// 4. Create a .wxs template file
msiCreator.create().then(function(){

    // Step 5: Compile the template to a .msi file
    msiCreator.compile();
});