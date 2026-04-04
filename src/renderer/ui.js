const { ipcRenderer } = require('electron');
const path = require('node:path');

// =============================================================================
// 1. UI ELEMENTS
// =============================================================================
const urlInput = document.getElementById('url-input');
const webviewContainer = document.getElementById('webview-container');
const quarkContainer = document.getElementById('quark-container');
const newQuarkBtn = document.getElementById('new-quark-btn');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnRefresh = document.getElementById('btn-refresh');
const moleculeDock = document.getElementById('molecule-dock');
const newMoleculeBtn = document.getElementById('new-molecule-btn');
const moleculeTitle = document.getElementById('current-molecule-title');
const molModal = document.getElementById('new-molecule-modal');
const molNameInput = document.getElementById('mol-name-input');
const molThemeInput = document.getElementById('mol-theme-input');
const molCreateBtn = document.getElementById('mol-create-btn');
const molCancelBtn = document.getElementById('mol-cancel-btn');
const settingsBtn = document.getElementById('settings-btn');
const passwordPrompt = document.getElementById('password-prompt');
const promptDomain = document.getElementById('prompt-domain');
const promptSaveBtn = document.getElementById('prompt-save-btn');
const promptCloseBtn = document.getElementById('prompt-close-btn');
const ramTracker = document.getElementById('ram-tracker');
const newAtomBtn = document.getElementById('new-atom-btn');
const atomModal = document.getElementById('new-atom-modal');
const atomNameInput = document.getElementById('atom-name-input');
const atomCreateBtn = document.getElementById('atom-create-btn');
const atomCancelBtn = document.getElementById('atom-cancel-btn');
const contextMenu = document.getElementById('custom-context-menu');
const inspectBtn = document.getElementById('menu-inspect');

// =============================================================================
// 2. CONFIGURATION
// =============================================================================
const DEFAULT_HOME_URL = 'https://duckduckgo.com';
const SEARCH_ENGINE_QUERY_URL = 'https://duckduckgo.com/?q=';
const SETTINGS_QUARK_ID = 'quark-settings';
const SYSTEM_MOLECULE = '__system__';

// =============================================================================
// 3. STATE
// =============================================================================
const activeWebviews = {};
let currentQuarkId = null;
let currentMolecule = 'work';
let quarkCounter = 2;
let moleculeCounter = 2;
let isRestoring = true;
let lawOfConservation = true;
let pendingCredential = null;
let cryoSleepEnabled = false;
let currentAtomId = null;
const atomHistory = {}; // moleculeId -> lastActiveAtomId
const quarkHistory = {}; // atomId -> lastActiveQuarkId
const moleculeHistory = {};

function updateLayout(quarkPos = 'left', atomPos = 'left') {
    document.body.setAttribute('data-quark-pos', quarkPos);
    document.body.setAttribute('data-atom-pos', atomPos);

    const qBar = document.getElementById('quark-bar');
    const aBar = document.getElementById('atom-bar');

    qBar.className = (quarkPos === 'top' || quarkPos === 'bottom') ? 'bar-horizontal' : 'bar-vertical';
    aBar.className = (atomPos === 'top' || atomPos === 'bottom') ? 'bar-horizontal' : 'bar-vertical';

    // Anti-Collision Engine: Put them side-by-side if they share the same wall
    if (quarkPos === atomPos) {
        aBar.style.gridArea = `${atomPos}-bar-1`;
        qBar.style.gridArea = `${quarkPos}-bar-2`;
    } else {
        aBar.style.gridArea = `${atomPos}-bar-1`;
        qBar.style.gridArea = `${quarkPos}-bar-1`;
    }
}

// =============================================================================
// 4. HELPERS
// =============================================================================
function getRandomColor() {
    const letters = '89ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * letters.length)];
    }
    return color;
}

function resolveURL(input) {
    input = input.trim();
    if (input.includes(' ') || (!input.includes('.') && !input.startsWith('localhost'))) {
        return SEARCH_ENGINE_QUERY_URL + encodeURIComponent(input);
    }
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
        return 'https://' + input;
    }
    return input;
}

function safeGetURL(view, fallback) {
    try { return view.getURL() || fallback; }
    catch { return fallback; }
}

// =============================================================================
// 5. WEBVIEW & QUARK MANAGEMENT
// =============================================================================
function createWebview(id, url, isLocal = false) {
    const view = document.createElement('webview');

    if (!isLocal) {
        // Find the Molecule this Quark belongs to
        const quarkBtn = document.querySelector(`.quark[data-id="${id}"]`);
        const molId = quarkBtn ? quarkBtn.getAttribute('data-molecule') : currentMolecule;
        const molBtn = document.querySelector(`.molecule[data-molecule="${molId}"]`);
        const pID = molBtn ? molBtn.getAttribute('data-partition') : 'default';

        // 1. Set the partition
        view.setAttribute('partition', `persist:${pID}`);

        // 2. ATTACH THE PRELOAD SCRIPT
        const preloadPath = `file://${path.join(__dirname, 'preload.js')}`;
        view.setAttribute('preload', preloadPath);
    }

    if (isLocal) {
        view.setAttribute('webpreferences', 'nodeIntegration=yes, contextIsolation=no');
    }

    view.src = url;

    Object.assign(view.style, { width: '100%', height: '100%', border: 'none', display: 'none' });

    // Push current lawOfConservation state into the settings webview on load
    view.addEventListener('dom-ready', () => {
        if (id === SETTINGS_QUARK_ID) {
            view.send('init-settings', { lawOfConservation });
        } 
    });

    view.addEventListener('did-navigate', (e) => {
        if (currentQuarkId === id) urlInput.value = e.url;
        preserveState();
    });

    view.addEventListener('page-title-updated', (e) => {
        const btn = document.querySelector(`.quark[data-id="${id}"]`);
        if (btn) btn.innerText = e.title;
    });

    webviewContainer.appendChild(view);
    activeWebviews[id] = view;
}

function createQuark(id, title, molecule, atomId) {
    const btn = document.createElement('div');
    btn.className = 'quark';
    btn.setAttribute('data-id', id);
    btn.setAttribute('data-molecule', molecule);
    btn.setAttribute('data-atom', atomId);
    btn.innerText = title;

    btn.addEventListener('click', () => switchQuark(id));
    btn.addEventListener('auxclick', (e) => { if (e.button === 1) closeQuark(id); });

    quarkContainer.appendChild(btn);
    preserveState();
}

function switchQuark(id) {
    // Hide current
    if (currentQuarkId && activeWebviews[currentQuarkId]) {
        activeWebviews[currentQuarkId].style.display = 'none';
    }

    // Show new
    if (activeWebviews[id]) {
        activeWebviews[id].style.display = 'flex';
        currentQuarkId = id;
        if (id !== SETTINGS_QUARK_ID) moleculeHistory[currentMolecule] = id;
        urlInput.value = safeGetURL(activeWebviews[id], activeWebviews[id].src);
    }

    // Update sidebar highlight
    document.querySelectorAll('.quark').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.quark[data-id="${id}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    preserveState();
}

function closeQuark(id) {
    const view = activeWebviews[id];
    const btn = document.querySelector(`.quark[data-id="${id}"]`);
    if (!view || !btn) return;

    view.remove();
    btn.remove();
    delete activeWebviews[id];

    if (currentQuarkId === id) {
        const remaining = document.querySelectorAll('.quark');
        if (remaining.length > 0) {
            switchQuark(remaining[remaining.length - 1].getAttribute('data-id'));
        } else {
            currentQuarkId = null;
            urlInput.value = '';
        }
    }

    preserveState();
}

// =============================================================================
// 5,5. ATOM MANAGEMENT
// =============================================================================

function createAtom(id, name, moleculeId) {
    const btn = document.createElement('div');
    btn.className = 'quark'; 
    btn.innerText = name;
    btn.setAttribute('data-id', id);
    btn.setAttribute('data-molecule', moleculeId);

    btn.addEventListener('click', () => switchAtom(id));
    // NEW: Middle-click to destroy
    btn.addEventListener('auxclick', (e) => { if (e.button === 1) destroyAtom(id); });
    
    document.getElementById('atom-container').appendChild(btn);
    preserveState();
}

function destroyAtom(id) {
    const atomEl = document.querySelector(`#atom-container .quark[data-id="${id}"]`);
    if (!atomEl) return;

    const molId = atomEl.getAttribute('data-molecule');

    // 1. Annihilate all Quarks inside this Atom
    document.querySelectorAll(`.quark[data-atom="${id}"]`).forEach(q => {
        closeQuark(q.getAttribute('data-id'));
    });

    // 2. Remove the Atom from the UI
    atomEl.remove();

    // 3. If we deleted the active Atom, automatically switch to another one
    if (currentAtomId === id) {
        const remainingAtoms = document.querySelectorAll(`#atom-container .quark[data-molecule="${molId}"]`);
        if (remainingAtoms.length > 0) {
            switchAtom(remainingAtoms[0].getAttribute('data-id'));
        } else {
            // If they deleted the last atom in the Workspace, generate a new fallback
            const fallbackId = `atom-${Date.now()}`;
            createAtom(fallbackId, 'General', molId);
            switchAtom(fallbackId);
        }
    }
    preserveState();
}

function switchAtom(id) {
    currentAtomId = id;
    atomHistory[currentMolecule] = id;

    // Highlight active atom
    document.querySelectorAll('#atom-container .quark').forEach(el => el.classList.remove('active'));
    document.querySelector(`#atom-container .quark[data-id="${id}"]`)?.classList.add('active');

    // Filter Quarks: Show only quarks belonging to this Atom
    document.querySelectorAll('#quark-container .quark').forEach(q => {
        const isSettings = q.getAttribute('data-id') === SETTINGS_QUARK_ID;
        const belongs = q.getAttribute('data-atom') === id || isSettings;
        q.style.display = belongs ? 'block' : 'none';
    });

    // Restore last quark in this atom
    const lastQuark = quarkHistory[id];
    if (lastQuark) switchQuark(lastQuark);
}

// =============================================================================
// 6. MOLECULE MANAGEMENT
// =============================================================================
function createMolecule(id, name, themeType = 'random', partitionID = null) {
    const btn = document.createElement('div');
    btn.className = 'molecule';
    btn.setAttribute('data-molecule', id);

    const pID = partitionID || id;
    btn.setAttribute('data-partition', pID);

    btn.title = name; // This creates the native hover tooltip!
    btn.innerText = name.charAt(0).toUpperCase(); // First letter of the name

    // Apply specific themes if requested
    if (themeType === 'work') {
        document.documentElement.style.setProperty(`--theme-${id}`, '#3a86ff');
    } else if (themeType === 'personal') {
        document.documentElement.style.setProperty(`--theme-${id}`, '#ff006e');
    } else if (themeType === 'gaming') {
        document.documentElement.style.setProperty(`--theme-${id}`, '#00f5d4');
    } else if (!document.documentElement.style.getPropertyValue(`--theme-${id}`)) {
        document.documentElement.style.setProperty(`--theme-${id}`, getRandomColor());
    }

    btn.addEventListener('click', () => switchMolecule(id));
    btn.addEventListener('auxclick', (e) => { if (e.button === 1) destroyMolecule(id); });

    newMoleculeBtn.before(btn);
    preserveState();
}
function destroyMolecule(id) {
    const allMolecules = document.querySelectorAll('.molecule');
    if (allMolecules.length <= 1) return;

    document.querySelectorAll(`#quark-container .quark[data-molecule="${id}"]`).forEach(q => {
        closeQuark(q.getAttribute('data-id'));
    });

    document.querySelector(`.molecule[data-molecule="${id}"]`)?.remove();
    delete moleculeHistory[id];

    if (currentMolecule === id) {
        const fallback = document.querySelectorAll('.molecule')[0].getAttribute('data-molecule');
        switchMolecule(fallback);
    }

    preserveState();
}

function switchMolecule(targetMolecule) {
    const targetEl = document.querySelector(`.molecule[data-molecule="${targetMolecule}"]`);
    if (!targetMolecule || !targetEl) return;

    if (cryoSleepEnabled != 'undefined' && cryoSleepEnabled) {
        // Freeze the molecule we are leaving
        if (currentMolecule && currentMolecule !== targetMolecule) {
            freezeMolecule(currentMolecule);
        }
        // Thaw the molecule we are entering
        if (typeof thawMolecule === 'function') {
            thawMolecule(targetMolecule);
        }
    }
    currentMolecule = targetMolecule;
    document.querySelectorAll('#atom-container .quark').forEach(btn => {
        const visible = btn.getAttribute('data-molecule') === targetMolecule;
        btn.style.display = visible ? 'block' : 'none';
    });
    const lastAtomId = atomHistory[targetMolecule];
    const existingAtomsForMol = document.querySelectorAll(`#atom-container .quark[data-molecule="${targetMolecule}"]`);

    if (lastAtomId && document.querySelector(`#atom-container .quark[data-id="${lastAtomId}"]`)) {
        // 1. Load the last used atom
        switchAtom(lastAtomId);
    } else if (existingAtomsForMol.length > 0) {
        // 2. If no history but atoms exist, just grab the first one
        switchAtom(existingAtomsForMol[0].getAttribute('data-id'));
    } else {
        // 3. Only generate a new 'General' atom if the workspace is 100% empty
        const defaultAtomId = `atom-${Date.now()}`;
        createAtom(defaultAtomId, 'General', targetMolecule);
        switchAtom(defaultAtomId);
    }
}

function freezeMolecule(molId) {
    if (molId === SYSTEM_MOLECULE) return;

    document.querySelectorAll(`#quark-container .quark[data-molecule="${molId}"]`).forEach(btn => {
        const id = btn.getAttribute('data-id');
        const view = activeWebviews[id];

        if (view) {
            btn.setAttribute('data-url', safeGetURL(view, DEFAULT_HOME_URL));
            delete activeWebviews[id];
            try { view.stop(); } catch (e) { }
            setTimeout(() => { try { view.remove(); } catch (e) { } }, 50);
            btn.style.opacity = '0.5';
        }
    });
}

function thawMolecule(molId) {
    if (molId === SYSTEM_MOLECULE) return;
    document.querySelectorAll(`#quark-container .quark[data-molecule="${molId}"]`).forEach(btn => {
        const id = btn.getAttribute('data-id');
        if (!activeWebviews[id]) {
            // Read the saved URL and resurrect the webview
            const url = btn.getAttribute('data-url') || DEFAULT_HOME_URL;
            createWebview(id, url);
            btn.style.opacity = '1';
        }
    });
}

// =============================================================================
// 7. STATE PERSISTENCE
// =============================================================================
function preserveState() {
    if (isRestoring) return;

    const state = {
        settings: {
            lawOfConservation,
            cryoSleep: cryoSleepEnabled,
            quarkPos: document.body.getAttribute('data-quark-pos') || 'left',
            atomPos: document.body.getAttribute('data-atom-pos') || 'left'
        },
        currentMolecule,
        moleculeHistory,
        atomHistory,
        atoms: Array.from(document.querySelectorAll('#atom-container .quark')).map(a => ({
            id: a.getAttribute('data-id'),
            name: a.innerText,
            molecule: a.getAttribute('data-molecule')
        })),
        molecules: Array.from(document.querySelectorAll('.molecule:not(#settings-btn):not(#new-molecule-btn)')).map(m => ({
            id: m.getAttribute('data-molecule'),
            partitionID: m.getAttribute('data-partition'),
            name: m.title,
            color: document.documentElement.style.getPropertyValue(`--theme-${m.getAttribute('data-molecule')}`),
        })),
        quarks: lawOfConservation
            ? Array.from(document.querySelectorAll(`#quark-container .quark:not([data-id="${SETTINGS_QUARK_ID}"])`)).map(q => {
                const qId = q.getAttribute('data-id');
                const view = activeWebviews[qId];
                return {
                    id: qId,
                    title: q.innerText,
                    url: view ? safeGetURL(view, DEFAULT_HOME_URL) : (q.getAttribute('data-url') || DEFAULT_HOME_URL),
                    molecule: q.getAttribute('data-molecule'),
                    atom: q.getAttribute('data-atom') 
                };
            })
            : [],
    };

    ipcRenderer.send('save-state', state);
}

setInterval(async () => {
    try {
        const mainRam = await ipcRenderer.invoke('get-memory-usage');

        // Estimate total memory including the active Webviews (Renderer processes)
        // Each active webview takes roughly ~60MB on average depending on the site
        const activeTabsCount = Object.keys(activeWebviews).length;
        const estimatedTotalRam = mainRam + (activeTabsCount * 60);

        ramTracker.innerText = `RAM: ~${estimatedTotalRam} MB`;
    } catch (e) {
        console.error("Failed to fetch RAM:", e);
    }
}, 2000);

// =============================================================================
// 8. BOOT — initialize hardcoded quarks from HTML, then wait for saved state
// =============================================================================
webviewContainer.innerHTML = '';

document.querySelectorAll('.quark').forEach(btn => {
    const id = btn.getAttribute('data-id');
    const url = btn.getAttribute('data-url');
    createWebview(id, url);
    btn.addEventListener('click', () => switchQuark(id));
    btn.addEventListener('auxclick', (e) => { if (e.button === 1) closeQuark(id); });
});

switchQuark('quark-1');

// =============================================================================
// 9. IPC — receive saved state from main process on boot
// =============================================================================
ipcRenderer.on('load-state', (event, savedState) => {
    if (!savedState) {
        isRestoring = false;
        preserveState();
        return;
    }

    if (savedState.settings) {
        lawOfConservation = savedState.settings.lawOfConservation;
        cryoSleepEnabled = savedState.settings.cryoSleep || false;
        // Apply saved layout
        updateLayout(savedState.settings.quarkPos || 'left', savedState.settings.atomPos || 'left');
    }

    isRestoring = true;

    // Clear the board
    moleculeDock.querySelectorAll('.molecule:not(#settings-btn):not(#new-molecule-btn)').forEach(m => m.remove());
    quarkContainer.innerHTML = '';
    document.getElementById('atom-container').innerHTML = ''; // Clear atoms too
    webviewContainer.innerHTML = '';

    // Rebuild molecules
    (savedState.molecules || []).forEach(m => {
        if (!m?.id) return;
        createMolecule(m.id, m.name || 'M', 'saved', m.partitionID);
        if (m.color) document.documentElement.style.setProperty(`--theme-${m.id}`, m.color);
    });

    // Rebuild atoms
    const existingAtoms = savedState.atoms || [];
    existingAtoms.forEach(a => {
        if (!a?.id) return;
        createAtom(a.id, a.name || 'General', a.molecule);
    });

    // Make sure every active molecule has a default Atom to catch old tabs
    (savedState.molecules || []).forEach(m => {
        if (!existingAtoms.some(a => a.molecule === m.id)) {
            createAtom(`atom-${m.id}-default`, 'General', m.id);
        }
    });

    // Rebuild quarks
    (savedState.quarks || []).forEach(q => {
        if (!q?.id) return;
        let url = q.url || DEFAULT_HOME_URL;
        const isLocal = url.startsWith('file://');
        if (!url.startsWith('http') && !isLocal) url = DEFAULT_HOME_URL;

        // Catch orphans and assign them to the default atom!
        let assignedAtom = q.atom;
        if (!assignedAtom) {
            assignedAtom = atomHistory[q.molecule] || `atom-${q.molecule}-default`;
        }

        createQuark(q.id, q.title || 'New Tab', q.molecule || 'work', assignedAtom);
        createWebview(q.id, url, isLocal);

        if (q.id.includes('-')) {
            const num = parseInt(q.id.split('-')[1], 10);
            if (!isNaN(num) && num > quarkCounter) quarkCounter = num;
        }
    });

    // Restore molecule history
    if (savedState.moleculeHistory) Object.assign(moleculeHistory, savedState.moleculeHistory);
    if (savedState.atomHistory) Object.assign(atomHistory, savedState.atomHistory);

    // Switch to the last active molecule
    const targetMol = savedState.currentMolecule || 'work';
    switchMolecule(document.querySelector(`.molecule[data-molecule="${targetMol}"]`) ? targetMol : 'work');

    isRestoring = false;
});

// Receive updated lawOfConservation from the settings quark via ipcMain
ipcRenderer.on('toggle-conservation', (event, value) => {
    lawOfConservation = value;
    preserveState();
});

// =============================================================================
// 10. EVENT LISTENERS
// =============================================================================

// Receive layout updates from settings
ipcRenderer.on('update-layout', (event, { quarkPos, atomPos }) => {
    updateLayout(quarkPos, atomPos);
    preserveState();
});

// Receive Cryo-Sleep toggle from main process
ipcRenderer.on('toggle-cryosleep', (event, value) => {
    cryoSleepEnabled = value;

    if (cryoSleepEnabled) {
        // Instantly freeze all inactive molecules
        document.querySelectorAll('.molecule').forEach(m => {
            const mId = m.getAttribute('data-molecule');
            if (mId !== currentMolecule) freezeMolecule(mId);
        });
    } else {
        // Instantly thaw all inactive molecules
        document.querySelectorAll('.molecule').forEach(m => {
            const mId = m.getAttribute('data-molecule');
            if (mId !== currentMolecule) thawMolecule(mId);
        });
    }
    preserveState();
});

// URL bar
urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && currentQuarkId) {
        activeWebviews[currentQuarkId].loadURL(resolveURL(urlInput.value));
        urlInput.blur();
    }
});

// Navigation controls
btnBack.addEventListener('click', () => {
    if (currentQuarkId && activeWebviews[currentQuarkId].canGoBack()) activeWebviews[currentQuarkId].goBack();
});
btnForward.addEventListener('click', () => {
    if (currentQuarkId && activeWebviews[currentQuarkId].canGoForward()) activeWebviews[currentQuarkId].goForward();
});
btnRefresh.addEventListener('click', () => {
    if (currentQuarkId) activeWebviews[currentQuarkId].reload();
});

// New quark
newQuarkBtn.addEventListener('click', () => {
    quarkCounter++;
    const newId = `quark-${quarkCounter}`;
    createQuark(newId, 'New Tab', currentMolecule, currentAtomId);
    createWebview(newId, DEFAULT_HOME_URL);
    switchQuark(newId);
});

// New molecule
newMoleculeBtn.addEventListener('click', () => {
    molNameInput.value = '';
    molThemeInput.value = 'random';
    molModal.style.display = 'block';
    molNameInput.focus();
});

molCancelBtn.addEventListener('click', () => {
    molModal.style.display = 'none';
});

molCreateBtn.addEventListener('click', () => {
    const name = molNameInput.value.trim() || 'Workspace';
    const theme = molThemeInput.value;

    moleculeCounter++;
    const newId = `molecule-${Date.now()}`; // Unique ID using timestamp

    createMolecule(newId, name, theme);
    switchMolecule(newId);

    molModal.style.display = 'none';
});

// Allow hitting "Enter" in the input field to create it quickly
molNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') molCreateBtn.click();
});

// Hardcoded molecule buttons from HTML
document.querySelectorAll('.molecule').forEach(btn => {
    if (btn.id === 'settings-btn') return;
    btn.addEventListener('click', () => switchMolecule(btn.getAttribute('data-molecule')));
    btn.addEventListener('auxclick', (e) => { if (e.button === 1) destroyMolecule(btn.getAttribute('data-molecule')); });
});

// Settings quark
settingsBtn.addEventListener('click', () => {
    if (!document.querySelector(`.quark[data-id="${SETTINGS_QUARK_ID}"]`)) {
        createQuark(SETTINGS_QUARK_ID, '⚙️ Settings', SYSTEM_MOLECULE);
        createWebview(SETTINGS_QUARK_ID, `${__dirname}/settings.html`, true);
    }
    switchQuark(SETTINGS_QUARK_ID);
});

ipcRenderer.on('show-save-password-prompt', (event, creds) => {
    pendingCredential = creds;
    promptDomain.innerText = creds.domain;
    passwordPrompt.style.display = 'block';
});

promptSaveBtn.addEventListener('click', () => {
    if (pendingCredential) {
        ipcRenderer.send('vault-save', pendingCredential);
    }
    passwordPrompt.style.display = 'none';
    pendingCredential = null;
});

promptCloseBtn.addEventListener('click', () => {
    passwordPrompt.style.display = 'none';
    pendingCredential = null;
});

// Hot-reload user.css (Development only)
ipcRenderer.on('reload-styles', () => {
    const link = document.getElementById('custom-css');
    if (link) link.href = '../styles/user.css?v=' + Date.now();
});

// ATOM MODAL LOGIC
newAtomBtn.addEventListener('click', () => {
    atomNameInput.value = '';
    atomModal.style.display = 'block';
    atomNameInput.focus();
});

atomCancelBtn.addEventListener('click', () => {
    atomModal.style.display = 'none';
});

atomCreateBtn.addEventListener('click', () => {
    const name = atomNameInput.value.trim() || 'New Group';
    const newId = `atom-${Date.now()}`;
    
    createAtom(newId, name, currentMolecule);
    switchAtom(newId);
    
    atomModal.style.display = 'none';
});

atomNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') atomCreateBtn.click();
});

ipcRenderer.on('show-custom-menu', (event, { x, y }) => {    
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'flex';
});

// Hide the menu if the user clicks anywhere else on the screen
window.addEventListener('click', (e) => {
    if (e.target !== inspectBtn) {
        contextMenu.style.display = 'none';
    }
});

// Trigger the Inspector
inspectBtn.addEventListener('click', () => {
    ipcRenderer.send('trigger-inspect');
    contextMenu.style.display = 'none';
});