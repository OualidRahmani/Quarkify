const { ipcRenderer } = require('electron');

// 1. Core Framework Injector
function setNativeValue(element, value) {
    if (!element || !value) return;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// 2. Capture Logic (Split-Step Aware)
function captureCredentials() {
    const userInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name="login"], input[id*="user"]');
    const passInputs = document.querySelectorAll('input[type="password"]');

    let foundUser = "";
    let foundPass = "";

    // Search for a visible username
    for (const input of userInputs) {
        if (input.offsetParent !== null && input.value) {
            foundUser = input.value;
            break;
        }
    }

    // Search for a visible password
    for (const input of passInputs) {
        if (input.offsetParent !== null && input.value) {
            foundPass = input.value;
            break;
        }
    }

    // Step 1: Store username temporarily across view changes
    if (foundUser) {
        sessionStorage.setItem('quarkify_pending_user', foundUser);
    }

    // Step 2: Retrieve the username from this view or the previous view
    const finalUser = foundUser || sessionStorage.getItem('quarkify_pending_user');

    // If we have both pieces of the puzzle, trigger the save prompt
    if (finalUser && foundPass) {
        const domain = window.location.hostname;
        ipcRenderer.send('propose-save-credential', { domain, username: finalUser, password: foundPass });

        // Clear the memory to prevent accidental credential mixing
        sessionStorage.removeItem('quarkify_pending_user');
    }
}

// 3. Autofill Logic (Split-Step Aware)
async function attemptAutofill() {
    const currentDomain = window.location.hostname;
    let credentials;

    try {
        credentials = await ipcRenderer.invoke('vault-get-credentials', currentDomain);
    } catch (e) {
        return;
    }

    if (!credentials || credentials.length === 0) return;
    const cred = credentials[0];

    // Independent field filler
    function fillVisibleFields() {
        const userInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name="login"], input[id*="user"]');
        const passInputs = document.querySelectorAll('input[type="password"]');

        for (const input of userInputs) {
            // Only fill if visible and currently empty
            if (input.offsetParent !== null && !input.value) {
                setNativeValue(input, cred.username);
            }
        }

        for (const input of passInputs) {
            if (input.offsetParent !== null && !input.value) {
                setNativeValue(input, cred.password);
            }
        }
    }

    // Execute initial fill
    fillVisibleFields();

    // Attach a MutationObserver to watch the DOM for Step 2 fields rendering dynamically
    const observer = new MutationObserver(() => {
        fillVisibleFields();
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// 4. Initialization and Event Listeners
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', attemptAutofill);
} else {
    attemptAutofill();
}

document.addEventListener('submit', captureCredentials);
document.addEventListener('click', (e) => {
    const target = e.target;
    const isButton = target.tagName === 'BUTTON' || (target.tagName === 'INPUT' && (target.type === 'submit' || target.type === 'button'));

    if (isButton) {
        setTimeout(captureCredentials, 50);
    }
});

window.addEventListener('mousedown', (e) => {
    if (e.button !== 2) {
        ipcRenderer.send('close-context-menu');
    }
});