const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('node:path');
const fs   = require('node:fs');

let chokidar;
if (!app.isPackaged) chokidar = require('chokidar');

app.disableHardwareAcceleration();
app.name = 'Quarkify';
app.setPath('userData', path.join(app.getPath('appData'), 'quarkify'));

// =============================================================================
// CONFIG FILE
// =============================================================================
function getConfigPath() {
    return path.join(app.getPath('userData'), 'quark_config.json');
}

function saveConfig(data) {
    try { fs.writeFileSync(getConfigPath(), JSON.stringify(data, null, 2)); }
    catch (err) { console.error('Failed to save config:', err); }
}

function loadConfig() {
    const p = getConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    return null;
}

// =============================================================================
// WINDOW
// =============================================================================
let mainWindow;

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

    mainWindow.webContents.on('did-finish-load', () => {
        const savedState = loadConfig();
        if (savedState) mainWindow.webContents.send('load-state', savedState);
    });

    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();

        // Hot-reload user.css in development
        if (chokidar) {
            const userCssPath = path.join(__dirname, '../styles/user.css');
            chokidar.watch(userCssPath).on('change', () => {
                mainWindow.webContents.send('reload-styles');
            });
        }
    }
}

// =============================================================================
// IPC HANDLERS
// =============================================================================

// Persist state from ui.js
ipcMain.on('save-state', (event, stateData) => {
    saveConfig(stateData);
});

// Settings quark requests current settings — reply directly to its webContents
ipcMain.on('request-settings', (event) => {
    const config = loadConfig();
    const lawOfConservation = config?.settings?.lawOfConservation ?? true;
    event.reply('init-settings', { lawOfConservation });
});

// Settings quark toggled — forward the new value to ui.js
ipcMain.on('toggle-conservation', (event, value) => {
    mainWindow.webContents.send('toggle-conservation', value);
});

ipcMain.on('vault-save', (event, { domain, username, password }) => {
    const config = loadConfig() || {};
    if (!config.vault) config.vault = [];

    // Check if encryption is available on this Linux distro (requires secret-service/kwallet)
    if (!safeStorage.isEncryptionAvailable()) {
        console.error("Encryption not available on this system.");
        return;
    }

    // Encrypt the password before saving
    const encryptedPassword = safeStorage.encryptString(password).toString('base64');

    config.vault.push({
        id: Date.now(),
        domain,
        username,
        password: encryptedPassword // Stored as an encrypted base64 string
    });

    saveConfig(config);
    event.reply('vault-updated', config.vault);
});

ipcMain.handle('vault-get-all', async () => {
    const config = loadConfig();
    if (!config || !config.vault) return [];

    // Decrypt passwords for the UI
    return config.vault.map(item => {
        try {
            return {
                ...item,
                password: safeStorage.decryptString(Buffer.from(item.password, 'base64'))
            };
        } catch (e) {
            return { ...item, password: 'ERROR_DECRYPTING' };
        }
    });
});

// =============================================================================
// LIFECYCLE
// =============================================================================
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});