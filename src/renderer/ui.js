// --- 1. GRAB UI ELEMENTS ---
const urlInput = document.getElementById('url-input');
const webviewContainer = document.getElementById('webview-container');
const quarkContainer = document.getElementById('quark-container');
const newQuarkBtn = document.getElementById('new-quark-btn');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnRefresh = document.getElementById('btn-refresh');
const moleculeDock = document.getElementById('molecule-dock');
const newMoleculeBtn = document.getElementById('new-molecule-btn');

// --- 1.5. BROWSER CONFIGURATION ---
// Change these easily in the future to switch to Google, Bing, etc.
const DEFAULT_HOME_URL = 'https://duckduckgo.com';
const SEARCH_ENGINE_QUERY_URL = 'https://duckduckgo.com/?q=';
// Example for Google: 'https://www.google.com/search?q='

// --- 2. THE STATE MANAGER ---
const activeWebviews = {};
let currentQuarkId = null;
let quarkCounter = 2;
let moleculeCounter = 2; // We start with 2 hardcoded ones

let currentMolecule = 'work'; // We start in the 'work' workspace
const moleculeHistory = {
    'work': 'quark-1', // Remembers that 'quark-1' is the active tab here
    'personal': null   // Personal starts empty
};

// --- 3. CORE FUNCTIONS ---
function getRandomColor() {
    const letters = '89ABCDEF'; // Keep them bright so they show up in dark mode
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * letters.length)];
    }
    return color;
}

function createWebview(id, url) {
    const view = document.createElement('webview');
    view.src = url;
    view.style.width = '100%';
    view.style.height = '100%';
    view.style.border = 'none';
    view.style.display = 'none';

    view.addEventListener('did-navigate', (e) => {
        if (currentQuarkId === id) {
            urlInput.value = e.url;
            // Bonus: We'll eventually use this to update the tab title too!
        }
    });

    view.addEventListener('page-title-updated', (e) => {
        const sidebarButton = document.querySelector(`.quark[data-id="${id}"]`);
        if (sidebarButton) {
            // e.title is the actual title of the webpage (e.g., "YouTube")
            sidebarButton.innerText = e.title;
        }
    });

    webviewContainer.appendChild(view);
    activeWebviews[id] = view;
}

function switchQuark(id) {
    if (currentQuarkId && activeWebviews[currentQuarkId]) {
        activeWebviews[currentQuarkId].style.display = 'none';
    }

    if (activeWebviews[id]) {
        activeWebviews[id].style.display = 'flex';
        currentQuarkId = id;
        moleculeHistory[currentMolecule] = id;
        try {
            urlInput.value = activeWebviews[id].getURL();
        } catch (error) {
            urlInput.value = activeWebviews[id].src;
        }
    }


    document.querySelectorAll('.quark').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.quark[data-id="${id}"]`).classList.add('active');
}

function createQuark(id, title, molecule) {
    const btn = document.createElement('div');
    btn.className = 'quark';
    btn.setAttribute('data-id', id);
    btn.setAttribute('data-molecule', molecule);
    btn.innerText = title;

    // Attach the click listener to the newly born button
    btn.addEventListener('click', () => {
        switchQuark(id);
    });

    btn.addEventListener('auxclick', (e) => {
        if (e.button === 1) { // button 1 is the Middle Mouse Wheel
            closeQuark(id);
        }
    });

    // Inject it into the HTML container
    quarkContainer.appendChild(btn);
}

function closeQuark(id) {
    const viewToClose = activeWebviews[id];
    const btnToClose = document.querySelector(`.quark[data-id="${id}"]`);

    if (!viewToClose || !btnToClose) return; // Safety check

    // 1. Remove them from the HTML
    webviewContainer.removeChild(viewToClose);
    btnToClose.remove();

    // 2. Delete from our memory dictionary
    delete activeWebviews[id];

    // 3. If we just closed the tab we were looking at, we need to switch to another one
    if (currentQuarkId === id) {
        const remainingTabs = document.querySelectorAll('.quark');
        if (remainingTabs.length > 0) {
            // Switch to the last available tab in the list
            const nextId = remainingTabs[remainingTabs.length - 1].getAttribute('data-id');
            switchQuark(nextId);
        } else {
            // No tabs left! 
            currentQuarkId = null;
            urlInput.value = '';
        }
    }
}

// --- 4. INITIALIZE THE BROWSER ---
webviewContainer.innerHTML = '';

// Load the initial hardcoded tabs
document.querySelectorAll('.quark').forEach(button => {
    const id = button.getAttribute('data-id');
    const url = button.getAttribute('data-url');
    createWebview(id, url);
    button.addEventListener('click', () => switchQuark(id));
    button.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
            closeQuark(id);
        }
    });
});

switchQuark('quark-1');

// --- 5. THE SPAWNER LOGIC (NEW) ---
newQuarkBtn.addEventListener('click', () => {
    quarkCounter++;
    const newId = `quark-${quarkCounter}`;

    createQuark(newId, 'New Tab', currentMolecule);

    createWebview(newId, DEFAULT_HOME_URL);

    switchQuark(newId);
});

// --- 6. URL BAR LOGIC ---
urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && currentQuarkId) {
        let input = urlInput.value.trim();
        let finalUrl = '';

        // 1. Is it a search query? (Has spaces, or lacks a dot)
        // Note: We also check for 'localhost' so developer links still work!
        if (input.includes(' ') || (!input.includes('.') && !input.startsWith('localhost'))) {
            // It's a search. Format it for DuckDuckGo.
            finalUrl = SEARCH_ENGINE_QUERY_URL + encodeURIComponent(input);
            if (!input.startsWith('http://') && !input.startsWith('https://')) {
                finalUrl = 'https://' + input;
            } else {
                finalUrl = input;
            }
        }

        // Load the smart URL and remove focus from the input bar
        activeWebviews[currentQuarkId].loadURL(finalUrl);
        urlInput.blur();
    }
});

// --- 7. NAVIGATION CONTROLS ---
btnBack.addEventListener('click', () => {
    // Safety check: Make sure a tab is open, AND that it has history to go back to
    if (currentQuarkId && activeWebviews[currentQuarkId].canGoBack()) {
        activeWebviews[currentQuarkId].goBack();
    }
});

btnForward.addEventListener('click', () => {
    if (currentQuarkId && activeWebviews[currentQuarkId].canGoForward()) {
        activeWebviews[currentQuarkId].goForward();
    }
});

btnRefresh.addEventListener('click', () => {
    if (currentQuarkId) {
        activeWebviews[currentQuarkId].reload();
    }
});

// --- 8. THE MOLECULE ROUTER ---
const moleculeButtons = document.querySelectorAll('.molecule');
const moleculeTitle = document.getElementById('current-molecule-title');

function createMolecule(id, letter) {
    const newBtn = document.createElement('div');
    newBtn.className = 'molecule';
    newBtn.setAttribute('data-molecule', id);
    newBtn.title = id;
    newBtn.innerText = letter.toUpperCase();

    // 1. Generate a custom theme variable just for this molecule
    const randomColor = getRandomColor();
    document.documentElement.style.setProperty(`--theme-${id}`, randomColor);

    // 2. Attach Click Listener (Switch to it)
    newBtn.addEventListener('click', () => {
        switchMolecule(id);
    });

    // 3. Attach Middle-Click Listener (Destroy it)
    newBtn.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
            destroyMolecule(id);
        }
    });

    // Inject it into the dock right ABOVE the + button
    moleculeDock.insertBefore(newBtn, newMoleculeBtn);
}

function destroyMolecule(id) {
    // Safety check: Don't let them delete the last molecule!
    const allMolecules = document.querySelectorAll('.molecule');
    if (allMolecules.length <= 1) return;

    // 1. Destroy all Quarks inside this Molecule to free up RAM
    const quarksToKill = document.querySelectorAll(`.quark[data-molecule="${id}"]`);
    quarksToKill.forEach(q => {
        const quarkId = q.getAttribute('data-id');
        closeQuark(quarkId);
    });

    // 2. Remove the UI Button
    const btnToRemove = document.querySelector(`.molecule[data-molecule="${id}"]`);
    if (btnToRemove) btnToRemove.remove();

    // 3. Clean up our memory history
    delete moleculeHistory[id];

    // 4. If we just deleted the molecule we were currently looking at, switch to a safe one
    if (currentMolecule === id) {
        const remainingMolecules = document.querySelectorAll('.molecule');
        const fallbackMoleculeId = remainingMolecules[0].getAttribute('data-molecule');
        switchMolecule(fallbackMoleculeId);
    }
}

function switchMolecule(targetMolecule) {
    currentMolecule = targetMolecule;

    // 1. Update UI Theme & Title
    document.querySelectorAll('.molecule').forEach(m => m.classList.remove('active'));
    document.querySelector(`.molecule[data-molecule="${targetMolecule}"]`).classList.add('active');
    document.body.setAttribute('data-theme', targetMolecule);

    const customColor = document.documentElement.style.getPropertyValue(`--theme-${targetMolecule}`);
    if (customColor) {
        document.documentElement.style.setProperty('--accent', customColor);
    } else {
        // Fallbacks for our hardcoded Work/Personal
        if (targetMolecule === 'work') document.documentElement.style.setProperty('--accent', '#3a86ff');
        if (targetMolecule === 'personal') document.documentElement.style.setProperty('--accent', '#ff006e');
    }

    moleculeTitle.innerText = targetMolecule + " molecule";

    // 2. Filter the Sidebar Tabs (Hide others, show ours)
    let hasQuarks = false;
    document.querySelectorAll('.quark').forEach(btn => {
        if (btn.getAttribute('data-molecule') === targetMolecule) {
            btn.style.display = 'block'; // Show it!
            hasQuarks = true;
        } else {
            btn.style.display = 'none'; // Hide it!
        }
    });

    // 3. Restore the Main View (Webview)
    const lastActiveQuarkId = moleculeHistory[targetMolecule];

    if (lastActiveQuarkId && activeWebviews[lastActiveQuarkId]) {
        // If we have history, load the exact tab we were looking at last
        switchQuark(lastActiveQuarkId);
    } else if (hasQuarks) {
        // If no history, but tabs exist, just pick the first one we find
        const firstAvailable = document.querySelector(`.quark[data-molecule="${targetMolecule}"]`);
        switchQuark(firstAvailable.getAttribute('data-id'));
    } else {
        // The Workspace is completely empty! 
        if (currentQuarkId && activeWebviews[currentQuarkId]) {
            activeWebviews[currentQuarkId].style.display = 'none';
        }
        currentQuarkId = null;
        urlInput.value = '';

        // Automatically spawn a new tab for them so they aren't staring at a blank screen
        document.getElementById('new-quark-btn').click();
    }
}

// Attach click listeners to the physical buttons
newMoleculeBtn.addEventListener('click', () => {
    moleculeCounter++;
    const newId = `molecule-${moleculeCounter}`;

    // Use 'M' as the default letter, or prompt the user later!
    createMolecule(newId, 'M');

    // Switch to it immediately
    switchMolecule(newId);
});

// Attach listeners to the initial hardcoded buttons
const initialMoleculeButtons = document.querySelectorAll('.molecule');
initialMoleculeButtons.forEach(btn => {
    const id = btn.getAttribute('data-molecule');
    btn.addEventListener('click', () => switchMolecule(id));

    // Allow deleting the starting ones too!
    btn.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
            destroyMolecule(id);
        }
    });
});