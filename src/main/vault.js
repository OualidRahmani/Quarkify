const { safeStorage } = require('electron');
const { loadConfig, saveConfig } = require('./config');

module.exports = function initVault(ipcMain, getWindow) {
    ipcMain.handle('vault-get-credentials', async () => {
        const config = loadConfig();
        if (!config || !config.vault) return [];

        return config.vault.map(item => ({
            id: item.id,
            domain: item.domain,
            username: item.username,
            password: safeStorage.isEncryptionAvailable() && item.password 
                ? safeStorage.decryptString(Buffer.from(item.password, 'hex')) 
                : ''
        }));
    });

    ipcMain.on('vault-save', (event, item) => {
        const config = loadConfig();
        if (!config) return;
        if (!config.vault) config.vault = [];

        const encryptedPass = safeStorage.isEncryptionAvailable() 
            ? safeStorage.encryptString(item.password).toString('hex') 
            : item.password;

        if (item.id) {
            const existing = config.vault.find(v => v.id === item.id);
            if (existing) {
                existing.domain = item.domain;
                existing.username = item.username;
                existing.password = encryptedPass;
            }
        } else {
            config.vault.push({
                id: Date.now(),
                domain: item.domain,
                username: item.username,
                password: encryptedPass
            });
            console.log(`[VAULT] Saved new credential for: ${item.domain}`);
        }

        saveConfig(config);
        event.reply('vault-updated', config.vault);
    });

    ipcMain.on('vault-save-prompt', (event, { domain, username, password }) => {
        const config = loadConfig();
        const vault = config?.vault || [];
        const cleanDomain = domain.replace('www.', '').trim();

        const alreadySaved = vault.some(item => {
            const savedDomain = item.domain.replace('www.', '').trim();
            const domainMatches = cleanDomain.includes(savedDomain) || savedDomain.includes(cleanDomain);
            return domainMatches && item.username === username;
        });

        if (!alreadySaved) {
            const win = getWindow();
            if (win) win.webContents.send('show-save-password-prompt', { domain, username, password });
        }
    });

    ipcMain.on('vault-delete', (event, idToDelete) => {
        const config = loadConfig();
        if (!config || !config.vault) return;

        config.vault = config.vault.filter(item => item.id !== idToDelete);
        saveConfig(config);
        
        console.log(`[VAULT] Deleted credential ID: ${idToDelete}`);
        event.reply('vault-updated', config.vault); 
    });
};