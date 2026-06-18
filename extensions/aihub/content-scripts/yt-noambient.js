(function() {
    'use strict';
    
    const CONFIG_KEY = 'yt-player-ambient-mode';
    const DISABLED_VALUE = '0';
    
    function disableAmbientMode() {
        try {
            const playerConfig = window.ytplayer?.config;
            if (playerConfig && playerConfig.args) {
                playerConfig.args.ambient_mode = 0;
            }
            const currentTime = Date.now();
            const ambientConfig = {
                data: DISABLED_VALUE,
                expiration: currentTime + 2592000000,
                creation: currentTime
            };
            localStorage.setItem(CONFIG_KEY, JSON.stringify(ambientConfig));
            const player = document.querySelector('#movie_player');
            if (player && typeof player.setAmbientMode === 'function') {
                player.setAmbientMode(false);
            }
            document.body?.classList.remove('ytp-ambient-mode-active');
        } catch (error) {
            console.error('[Ambient Mode] Error:', error);
        }
    }


    function removeCinematicElements() {
        const cinematicContainer = document.getElementById('cinematics');
        if (cinematicContainer) cinematicContainer.remove();
        const canvases = document.querySelectorAll('canvas.ytp-cinematic-canvas');
        canvases.forEach(canvas => canvas.remove());
    }
    
    function waitForPlayer(callback, maxRetries = 50) {
        let retries = 0;
        const checkInterval = setInterval(() => {
            const player = document.querySelector('#movie_player');
            if (player || retries >= maxRetries) {
                clearInterval(checkInterval);
                if (player) callback(player);
            }
            retries++;
        }, 100);
    }
    
    function handleNavigation() {
        if (window.location.pathname === '/watch') {
            disableAmbientMode();
            removeCinematicElements();
            waitForPlayer((player) => {
                disableAmbientMode();
                if (player.getAvailableQualityLevels) {
                    const settingsMenu = player.querySelector('.ytp-settings-menu');
                    if (settingsMenu) {
                        player.hideControls();
                        player.showControls();
                    }
                }
            });
        }
    }
    
    function setupPlayerObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.id === 'cinematics' || 
                            (node.classList && node.classList.contains('ytp-cinematic-container'))) {
                            node.remove();
                        }
                    });
                }
                if (mutation.attributeName === 'class' && 
                    document.body?.classList.contains('ytp-ambient-mode-active')) {
                    document.body?.classList.remove('ytp-ambient-mode-active');
                }
            });
        });
        const target = document.body || document.documentElement;
        observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        return observer;
    }
    
    const navigationEvents = ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated'];
    navigationEvents.forEach(eventName => {
        window.addEventListener(eventName, handleNavigation);
    });
    
    function init() {
        const observer = setupPlayerObserver();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', handleNavigation);
        } else {
            handleNavigation();
        }
        setInterval(() => {
            if (window.location.pathname === '/watch') {
                const stored = localStorage.getItem(CONFIG_KEY);
                if (!stored || JSON.parse(stored).data !== DISABLED_VALUE) {
                    disableAmbientMode();
                }
            }
        }, 5000);
        window.addEventListener('beforeunload', () => observer.disconnect());
    }
    
    init();
})();

const style = document.createElement('style');
style.textContent = `
    #cinematics, .ytp-cinematic-container,
    .ytp-ambient-lighting, .ytp-ambient-lighting-effect {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
    }
    .html5-video-player.ytp-ambient-mode-active {
        background: transparent !important;
    }
`;
(document.head || document.documentElement).appendChild(style);
