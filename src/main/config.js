const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

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

    const defaultMolId = `molecule-${Date.now()}`;
    const defaultAtomId = `atom-${Date.now()}`;
    const DEFAULT_CONFIG = {
        settings: {
            lawOfConservation: false,
            cryoSleep: false,
            deepCryoSleep: false,
            absoluteZero: false,
            absoluteZeroLimit: 5,
            quarkPos: 'left',
            atomPos: 'left'
        },
        currentMolecule: defaultMolId,
        moleculeHistory: {},
        atomHistory: {},
        molecules: [{ id: defaultMolId, name: 'Workspace', color: '#3a86ff', partitionID: 'default' }],
        atoms: [{ id: defaultAtomId, name: 'General', molecule: defaultMolId }],
        quarks: [],
        vault: []
    };

    if (fs.existsSync(p)) {
        try { data = JSON.parse(fs.readFileSync(p, 'utf-8')); } 
        catch (err) { console.error('[CONFIG] Corrupted file. Generating a new one...'); }
    }

    if (!data || Object.keys(data).length === 0) {
        data = DEFAULT_CONFIG;
        saveConfig(data);
        console.log('[CONFIG] Generated fresh default state.');
    } else {
        let needsSave = false;
        if (!data.settings) { data.settings = {}; needsSave = true; }

        for (const key in DEFAULT_CONFIG.settings) {
            if (data.settings[key] === undefined) {
                data.settings[key] = DEFAULT_CONFIG.settings[key];
                needsSave = true;
            }
        }

        ['molecules', 'atoms', 'quarks', 'vault', 'moleculeHistory', 'atomHistory'].forEach(key => {
            if (!data[key]) {
                data[key] = DEFAULT_CONFIG[key];
                needsSave = true;
            }
        });

        if (needsSave) {
            saveConfig(data);
            console.log('[CONFIG] Successfully patched missing features into existing config.');
        }
    }
    return data;
}

module.exports = { getConfigPath, saveConfig, loadConfig };