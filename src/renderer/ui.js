const { ipcRenderer } = require('electron');

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
const settingsBtn = document.getElementById('settings-btn');
const moleculeTitle = document.getElementById('current-molecule-title');

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

const moleculeHistory = {
    'work': 'quark-1',
    'personal': null,
};

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
        
        // Grab the partitionID from the Molecule
        const pID = molBtn ? molBtn.getAttribute('data-partition') : 'default';
        
        // 'persist:' prefix ensures cookies stay after restart
        view.setAttribute('partition', `persist:${pID}`);
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

function createQuark(id, title, molecule) {
    const btn = document.createElement('div');
    btn.className = 'quark';
    btn.setAttribute('data-id', id);
    btn.setAttribute('data-molecule', molecule);
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
// 6. MOLECULE MANAGEMENT
// =============================================================================
function createMolecule(id, letter, partitionID = null) {
    const btn = document.createElement('div');
    btn.className = 'molecule';
    btn.setAttribute('data-molecule', id);
    
    // Default partition to the molecule ID if none provided
    const pID = partitionID || id;
    btn.setAttribute('data-partition', pID);
    
    btn.title = id;
    btn.innerText = letter.toUpperCase();

    // Preserve the custom color if it's already in the CSS variables
    if (!document.documentElement.style.getPropertyValue(`--theme-${id}`)) {
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

    document.querySelectorAll(`.quark[data-molecule="${id}"]`).forEach(q => {
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

    currentMolecule = targetMolecule;

    // Update molecule dock highlight
    document.querySelectorAll('.molecule').forEach(m => m.classList.remove('active'));
    targetEl.classList.add('active');
    document.body.setAttribute('data-theme', targetMolecule);

    // Apply accent color
    const customColor = document.documentElement.style.getPropertyValue(`--theme-${targetMolecule}`);
    const defaultColors = { work: '#3a86ff', personal: '#ff006e' };
    document.documentElement.style.setProperty('--accent', customColor || defaultColors[targetMolecule] || '#3a86ff');

    moleculeTitle.innerText = targetMolecule + ' molecule';

    // Show/hide quarks — system quarks are always visible
    let hasQuarks = false;
    document.querySelectorAll('.quark').forEach(btn => {
        const mol = btn.getAttribute('data-molecule');
        if (mol === SYSTEM_MOLECULE) return;
        const visible = mol === targetMolecule;
        btn.style.display = visible ? 'block' : 'none';
        if (visible) hasQuarks = true;
    });

    // Switch to the last active quark in this molecule, or the first available
    const lastId = moleculeHistory[targetMolecule];
    if (lastId && activeWebviews[lastId]) {
        switchQuark(lastId);
    } else if (hasQuarks) {
        const first = document.querySelector(`.quark[data-molecule="${targetMolecule}"]`);
        switchQuark(first.getAttribute('data-id'));
    } else {
        // No quarks in this molecule — open a fresh one
        if (currentQuarkId && activeWebviews[currentQuarkId]) {
            activeWebviews[currentQuarkId].style.display = 'none';
        }
        currentQuarkId = null;
        urlInput.value = '';
        newQuarkBtn.click();
    }
}

// =============================================================================
// 7. STATE PERSISTENCE
// =============================================================================
function preserveState() {
    if (isRestoring) return;

    const state = {
        settings: { lawOfConservation },
        currentMolecule,
        moleculeHistory,
        molecules: Array.from(document.querySelectorAll('.molecule:not(#settings-btn):not(#new-molecule-btn)')).map(m => ({
            id: m.getAttribute('data-molecule'),
            partitionID: m.getAttribute('data-partition'),
            letter: m.innerText,
            color: document.documentElement.style.getPropertyValue(`--theme-${m.getAttribute('data-molecule')}`),
        })),
        // When Law of Conservation is OFF, save empty quarks so nothing restores on next boot
        quarks: lawOfConservation
            ? Array.from(document.querySelectorAll(`.quark:not([data-id="${SETTINGS_QUARK_ID}"])`)).map(q => {
                const qId = q.getAttribute('data-id');
                const view = activeWebviews[qId];
                return {
                    id: qId,
                    title: q.innerText,
                    url: view ? safeGetURL(view, DEFAULT_HOME_URL) : DEFAULT_HOME_URL,
                    molecule: q.getAttribute('data-molecule'),
                };
            })
            : [],
    };

    ipcRenderer.send('save-state', state);
}

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
    }

    isRestoring = true;

    // Clear the board
    moleculeDock.querySelectorAll('.molecule:not(#settings-btn):not(#new-molecule-btn)').forEach(m => m.remove());
    quarkContainer.innerHTML = '';
    webviewContainer.innerHTML = '';

    // Rebuild molecules
    (savedState.molecules || []).forEach(m => {
        if (!m?.id) return;
        createMolecule(m.id, m.letter || 'M', m.partitionID);
        if (m.color) document.documentElement.style.setProperty(`--theme-${m.id}`, m.color);
        if (m.id.includes('-')) {
            const num = parseInt(m.id.split('-')[1], 10);
            if (!isNaN(num) && num > moleculeCounter) moleculeCounter = num;
        }
    });

    // Rebuild quarks
    (savedState.quarks || []).forEach(q => {
        if (!q?.id) return;
        let url = q.url || DEFAULT_HOME_URL;
        const isLocal = url.startsWith('file://');
        if (!url.startsWith('http') && !isLocal) url = DEFAULT_HOME_URL;

        createQuark(q.id, q.title || 'New Tab', q.molecule || 'work');
        createWebview(q.id, url, isLocal);

        if (q.id.includes('-')) {
            const num = parseInt(q.id.split('-')[1], 10);
            if (!isNaN(num) && num > quarkCounter) quarkCounter = num;
        }
    });

    // Restore molecule history
    if (savedState.moleculeHistory) Object.assign(moleculeHistory, savedState.moleculeHistory);

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
    createQuark(newId, 'New Tab', currentMolecule);
    createWebview(newId, DEFAULT_HOME_URL);
    switchQuark(newId);
});

// New molecule
newMoleculeBtn.addEventListener('click', () => {
    moleculeCounter++;
    const newId = `molecule-${moleculeCounter}`;
    createMolecule(newId, 'M');
    switchMolecule(newId);
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

// Hot-reload user.css (Development only)
ipcRenderer.on('reload-styles', () => {
    const link = document.getElementById('custom-css');
    if (link) link.href = '../styles/user.css?v=' + Date.now();
});