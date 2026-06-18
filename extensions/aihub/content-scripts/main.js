// Aurora Hub — Main Content Script
// Corre en todas las páginas. Relay básico de datos al servidor Aurora.

(function () {
  'use strict';

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'AURORA_PING_CS') {
      sendResponse({ ok: true, url: location.href });
      return true;
    }
    if (msg.action === 'ping') {
      sendResponse({ alive: true });
      return true;
    }
    if (msg.action === 'extractDOM') {
      sendResponse({ innerText: document.body?.innerText || '', url: location.href, title: document.title });
      return true;
    }
  });

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'AURORA_PRODUCTIVITY_PING') {
      e.source?.postMessage({ type: 'AURORA_PRODUCTIVITY_PONG', url: location.href, title: document.title }, '*');
    }
  });

})();
