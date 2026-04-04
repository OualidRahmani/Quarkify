const { app, BrowserWindow, ipcMain, safeStorage, Menu, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

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
    let data = null;

    // 1. Try to read existing config
    if (fs.existsSync(p)) {
        try {
            data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        } catch (err) {
            console.error('[CONFIG] Corrupted file. Generating a new one...');
        }
    }

    // 2. If it's missing or completely empty, build the baseline
    if (!data || Object.keys(data).length === 0) {
        const defaultMolId = `molecule-${Date.now()}`;
        const defaultAtomId = `atom-${Date.now()}`;

        data = {
            settings: {
                lawOfConservation: false,
                cryoSleep: false,
                quarkPos: 'left',
                atomPos: 'left'
            },
            currentMolecule: defaultMolId,
            moleculeHistory: {},
            atomHistory: {},
            molecules: [{
                id: defaultMolId,
                name: 'Workspace',
                color: '#3a86ff',
                partitionID: 'default'
            }],
            atoms: [{
                id: defaultAtomId,
                name: 'General',
                molecule: defaultMolId
            }],
            quarks: [],
            vault: []
        };
        saveConfig(data);
        console.log('[CONFIG] Generated fresh default state.');
    }

    return data;
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
    const existingConfig = loadConfig() || {};

    // Protect the Vault! If it exists in the current file, copy it to the new save data
    if (existingConfig.vault) {
        stateData.vault = existingConfig.vault;
    }

    saveConfig(stateData);
});

// Get current memory usage of the main process
ipcMain.handle('get-memory-usage', async () => {
    // process.memoryUsage().rss represents the Resident Set Size (total memory allocated)
    const memory = process.memoryUsage();
    return Math.round(memory.rss / 1024 / 1024);
});

// Settings quark requests current settings
ipcMain.on('request-settings', (event) => {
    const config = loadConfig();
    const lawOfConservation = config?.settings?.lawOfConservation ?? false;
    const cryoSleep = config?.settings?.cryoSleep ?? false;
    const quarkPos = config?.settings?.quarkPos ?? 'left';
    const atomPos = config?.settings?.atomPos ?? 'left';
    
    event.reply('init-settings', { lawOfConservation, cryoSleep, quarkPos, atomPos });
});

// Settings quark toggled — forward the new values to ui.js
ipcMain.on('toggle-conservation', (event, value) => {
    mainWindow.webContents.send('toggle-conservation', value);
});

ipcMain.on('toggle-cryosleep', (event, value) => {
    mainWindow.webContents.send('toggle-cryosleep', value);
});

// Forward layout changes from settings to the main UI
ipcMain.on('update-layout', (event, layoutConfig) => {
    mainWindow.webContents.send('update-layout', layoutConfig);
});

ipcMain.on('vault-save', (event, { id, domain, username, password }) => {
    const config = loadConfig() || {};
    if (!config.vault) config.vault = [];

    if (!safeStorage.isEncryptionAvailable()) {
        console.error("[VAULT] Encryption not available on this system.");
        return;
    }

    const encryptedPassword = safeStorage.encryptString(password).toString('base64');

    if (id) {
        // Find and update existing credential
        const index = config.vault.findIndex(item => item.id === id);
        if (index !== -1) {
            config.vault[index].domain = domain;
            config.vault[index].username = username;
            config.vault[index].password = encryptedPassword;
            console.log(`[VAULT] Updated credential ID: ${id}`);
        }
    } else {
        // Create new credential
        config.vault.push({
            id: Date.now(),
            domain,
            username,
            password: encryptedPassword
        });
        console.log(`[VAULT] Saved new credential for: ${domain}`);
    }

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

// Send specific credentials to the Preload Script
ipcMain.handle('vault-get-credentials', async (event, domain) => {
    console.log(`\n[VAULT]Preload asked for: '${domain}'`);

    const config = loadConfig();
    if (!config || !config.vault) {
        console.log(`[VAULT]Vault is completely empty!`);
        return [];
    }

    const cleanDomain = domain.replace('www.', '').trim();

    // 1. Check if the string matches
    const matches = config.vault.filter(item => {
        const savedDomain = item.domain.replace('www.', '').trim();
        const isMatch = cleanDomain.includes(savedDomain) || savedDomain.includes(cleanDomain);
        if (isMatch) console.log(`[VAULT]Domain Match Found: '${savedDomain}'`);
        return isMatch;
    });

    if (matches.length === 0) {
        console.log(`[VAULT]No domains matched '${cleanDomain}'`);
        return [];
    }

    // 2. Try to decrypt
    const validCredentials = [];
    for (const item of matches) {
        try {
            const decrypted = safeStorage.decryptString(Buffer.from(item.password, 'base64'));
            console.log(`[VAULT]Successfully decrypted password for: ${item.username}`);
            validCredentials.push({ username: item.username, password: decrypted });
        } catch (e) {
            console.error(`[VAULT]DECRYPTION FAILED for ${item.username}! Error:`, e.message);
        }
    }

    console.log(`[VAULT] Sending ${validCredentials.length} credentials to Preload.\n`);
    return validCredentials;
});

ipcMain.on('propose-save-credential', (event, { domain, username, password }) => {
    const config = loadConfig();
    const vault = config?.vault || [];

    const cleanDomain = domain.replace('www.', '').trim();

    // Check if we already have this exact username for this domain
    const alreadySaved = vault.some(item => {
        const savedDomain = item.domain.replace('www.', '').trim();
        const domainMatches = cleanDomain.includes(savedDomain) || savedDomain.includes(cleanDomain);
        return domainMatches && item.username === username;
    });

    if (!alreadySaved) {
        // Tell the UI to show the floating prompt
        mainWindow.webContents.send('show-save-password-prompt', { domain, username, password });
    }
});

// Delete a specific credential from the Vault
ipcMain.on('vault-delete', (event, idToDelete) => {
    const config = loadConfig();
    if (!config || !config.vault) return;

    // Filter out the credential that matches the ID we want to delete
    config.vault = config.vault.filter(item => item.id !== idToDelete);

    saveConfig(config); // Save the newly cleaned array to disk

    console.log(`[VAULT]Deleted credential ID: ${idToDelete}`);

    // Tell the Settings UI to refresh its list!
    event.reply('vault-updated', config.vault);
});

// =============================================================================
// LIFECYCLE
// =============================================================================

// GLOBAL CONTEXT MENU
// This intercepts every new WebContents (including the main UI and all Webviews)
let lastContextMenuParams = null;
let lastWebContentsId = null;

app.on('web-contents-created', (event, contents) => {
    contents.on('context-menu', (event, params) => {
        lastContextMenuParams = params;
        lastWebContentsId = contents.id;

        // Figure out if they clicked the browser UI or a web page
        const isMainWindow = (mainWindow && contents === mainWindow.webContents);

        // Tell the UI to render our custom CSS menu at these exact coordinates
        if (mainWindow) {
            mainWindow.webContents.send('show-custom-menu', {
                x: params.x,
                y: params.y,
                isMainWindow
            });
        }
    });
});

// The UI will send this back if the user clicks "Inspect Element"
ipcMain.on('trigger-inspect', () => {
    if (lastWebContentsId && lastContextMenuParams) {
        const wc = require('electron').webContents.fromId(lastWebContentsId);
        if (wc) wc.inspectElement(lastContextMenuParams.x, lastContextMenuParams.y);
    }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});