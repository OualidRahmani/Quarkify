const SEARCH_ENGINE_QUERY_URL = 'https://duckduckgo.com/?q=';

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

module.exports = {
    getRandomColor,
    resolveURL,
    safeGetURL
};