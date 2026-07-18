// TARGET_FILE: content.js
// TARGET_FOLDER: bold_highlighter_ext

// Guard: chrome.runtime no está disponible en todos los contextos.
if (!chrome?.runtime) { /* silent exit */ }
else {

let boldColor = '#2E8B57';

function updateStyles() {
    if (!chrome.runtime?.id) return;
    let styleEl = document.getElementById('bold-dynamic-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'bold-dynamic-style';
        (document.head || document.documentElement).appendChild(styleEl);
    }
    styleEl.textContent = `
        b, strong, .bold, .bionic-bold, [style*="font-weight: 700"] {
            color: ${boldColor} !important;
            transition: color 0.2s ease;
        }
    `;
}

function loadSettings() {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage({ type: 'AURORA_BOLD_GET_CONFIG' }, (reply) => {
        const config = reply?.ok ? reply.config : null;
        if (config?.boldColor) boldColor = config.boldColor;
        updateStyles();
    });
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'update' && msg.settings?.boldColor) {
        boldColor = msg.settings.boldColor;
        updateStyles();
        chrome.runtime.sendMessage({
            type: 'AURORA_BOLD_SET_CONFIG',
            enabled: true,
            config: { boldColor },
        });
    }
});

loadSettings();
}
