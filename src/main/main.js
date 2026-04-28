const { app, BrowserWindow, ipcMain, Menu, nativeTheme } = require('electron');
const path = require('node:path');

// Import our new fragmented modules!
const { loadConfig , saveConfig} = require('./config');
const initSettings = require('./settings');
const initVault = require('./vault');
const initTracker = require('./tracker');

let chokidar;
if (!app.isPackaged) chokidar = require('chokidar');

app.disableHardwareAcceleration();
app.name = 'Quarkify';
app.setPath('userData', path.join(app.getPath('appData'), 'quarkify'));

let mainWindow;
function getWindow() { return mainWindow; }

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        backgroundColor: '#121212',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
            sandbox: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Inject state safely after DOM loads
    mainWindow.webContents.once('did-finish-load', () => {
        const state = loadConfig();
        if (state) mainWindow.webContents.send('load-state', state);
    });

    if (chokidar) {
        chokidar.watch(path.join(__dirname, '../**/*')).on('change', () => {
            if (mainWindow) {
                mainWindow.webContents.send('reload-styles');
                console.log('Styles reloaded visually!');
            }
        });
    }
}

// =============================================================================
// INITIALIZE MODULES
// =============================================================================
initSettings(ipcMain, getWindow);
initVault(ipcMain, getWindow);
initTracker(getWindow);

// =============================================================================
// GLOBAL CONTEXT MENU
// =============================================================================
let lastContextMenuParams = null;
let lastWebContentsId = null;

app.on('web-contents-created', (event, contents) => {
    contents.on('context-menu', (event, params) => {
        lastContextMenuParams = params;
        lastWebContentsId = contents.id;

        const isMainWindow = (mainWindow && contents === mainWindow.webContents);

        if (mainWindow) {
            mainWindow.webContents.send('show-custom-menu', {
                x: params.x, y: params.y,
                canCopy: params.editFlags.canCopy,
                canPaste: params.editFlags.canPaste,
                hasText: params.selectionText.trim().length > 0,
                linkURL: params.linkURL,
                isMainWindow
            });
        }
    });
});

ipcMain.on('trigger-inspect', () => {
    if (lastWebContentsId && lastContextMenuParams) {
        const wc = require('electron').webContents.fromId(lastWebContentsId);
        if (wc) wc.inspectElement(lastContextMenuParams.x, lastContextMenuParams.y);
    }
});

ipcMain.on('close-context-menu', () => {
    if (mainWindow) mainWindow.webContents.send('close-context-menu');
});

ipcMain.on('save-state', (event, state) => {
    // 1. Load the current config to see what the backend knows (like Passwords!)
    const existingConfig = loadConfig();
    
    // 2. Safely merge the Vault into the UI's state before saving
    if (existingConfig && existingConfig.vault) {
        state.vault = existingConfig.vault;
    } else {
        state.vault = [];
    }

    // 3. Now save the complete picture
    saveConfig(state);
});

// =============================================================================
// LIFECYCLE
// =============================================================================
app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});