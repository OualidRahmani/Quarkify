const { loadConfig, saveConfig } = require('./config');

module.exports = function initSettings(ipcMain, getWindow) {
    ipcMain.on('request-settings', (event) => {
        const config = loadConfig();
        const settings = config?.settings || {};
        event.reply('init-settings', {
            lawOfConservation: settings.lawOfConservation ?? false,
            cryoSleep: settings.cryoSleep ?? false,
            deepCryoSleep: settings.deepCryoSleep ?? false,
            absoluteZero: settings.absoluteZero ?? false,
            absoluteZeroLimit: settings.absoluteZeroLimit ?? 5,
            quarkPos: settings.quarkPos ?? 'left',
            atomPos: settings.atomPos ?? 'left'
        });
    });

    ipcMain.on('update-layout', (event, { quarkPos, atomPos }) => {
        const config = loadConfig();
        if (config) {
            if (!config.settings) config.settings = {};
            config.settings.quarkPos = quarkPos;
            config.settings.atomPos = atomPos;
            saveConfig(config);
            
            const win = getWindow();
            if (win) win.webContents.send('layout-updated', { quarkPos, atomPos });
        }
    });

    // Toggle relays
    const toggles = [
        'toggle-conservation', 
        'toggle-cryosleep', 
        'toggle-deepcryosleep', 
        'toggle-absolutezero', 
        'update-absolutezero-limit'
    ];

    toggles.forEach(channel => {
        ipcMain.on(channel, (event, value) => {
            const win = getWindow();
            if (win) win.webContents.send(channel, value);
        });
    });
};