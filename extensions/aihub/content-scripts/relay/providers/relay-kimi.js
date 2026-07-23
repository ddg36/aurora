// Provider driver: Kimi (kimi.com). Todo conocimiento de su DOM vive aquí.
(() => {
  'use strict';

  const SELECTORS = Object.freeze({
    assistant: ['.segment-assistant'],
    user: ['.segment-user'],
    input: ['.chat-input-editor'],
    // No es un <button> real (Vue, div clickeable) — confirmado en vivo:
    // trae la clase "disabled" mientras el composer está vacío y "stop"
    // mientras genera (mismo elemento cambia de rol según estado).
    send: ['.send-button-container'],
    stop: ['.send-button-container.stop'],
    text: ['.segment-container'],
    attachmentPreview: ['[class*="file-card" i]', '[class*="attachment" i]'],
  });

  const first = (selectors, root = document) => selectors.map(s => root.querySelector(s)).find(Boolean) || null;
  const all = (selectors, root = document) => [...root.querySelectorAll(selectors.join(','))];
  const stopControl = (root = document) => {
    const el = first(SELECTORS.stop, root);
    return el?.isConnected ? el : null;
  };
  const sendControl = () => {
    const el = first(SELECTORS.send);
    return el && !el.classList.contains('disabled') && !el.classList.contains('stop') ? el : null;
  };
  // `.chat-content-item` (padre directo de `.segment-user`/`.segment-
  // assistant`) trae `data-archer-id`, un UUID real y distinto para cada
  // turno (usuario Y respuesta, no compartido — confirmado en vivo: dos ids
  // distintos para un mismo intercambio, mismo patrón que Claude/Grok/
  // ChatGPT, a diferencia de Gemini/Perplexity).
  const turnId = turn => turn?.closest?.('.chat-content-item')?.getAttribute('data-archer-id') || '';
  const bestTextNode = turn => {
    let best = turn || null, length = -1;
    for (const node of turn?.querySelectorAll?.(SELECTORS.text.join(',')) || [turn].filter(Boolean)) {
      const current = (node.innerText || '').length;
      if (current > length) { best = node; length = current; }
    }
    return best;
  };

  const observe = Object.freeze({
    getInput: () => first(SELECTORS.input),
    getSendControl: sendControl,
    getStopControl: stopControl,
    getLatestAssistant: () => all(SELECTORS.assistant).at(-1) || null,
    getAssistantTurns: () => all(SELECTORS.assistant),
    getUserTurns: () => all(SELECTORS.user),
    getUserTurnCount: () => all(SELECTORS.user).length,
    getNewUserTurnIds: baseline => all(SELECTORS.user).map(node => turnId(node)).filter(id => id && !baseline?.has(id)),
    findAssistantAfterUserIds(ids, turns = all(SELECTORS.assistant)) {
      const users = all(SELECTORS.user).filter(node => ids?.includes(turnId(node)));
      const user = users.at(-1);
      return user ? turns.filter(turn => user.compareDocumentPosition(turn) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1) || null : null;
    },
    getTextNode: bestTextNode,
    // Kimi marca el lenguaje del bloque con la clase estándar `language-*`
    // en <pre> Y <code> (confirmado en vivo: "language-python" en ambos) —
    // domToMarkdown lo detecta solo, sin necesitar detectLang. Pero el
    // header con la etiqueta ("Python") y el botón "Copy" viven en un
    // `.sticky-release` HERMANO de `<pre>` dentro de `.segment-code` (que
    // no es pre/code, es un div normal) — domToMarkdown lo recorre como
    // prosa antes de llegar al fence real, confirmado en vivo: "Python
    // Copy" quedaba duplicado justo antes de la respuesta correcta.
    readAssistant: turn => {
      const node = bestTextNode(turn);
      const domToMarkdown = globalThis.__auroraRelayV2?.utils?.domToMarkdown;
      const raw = (domToMarkdown ? domToMarkdown(node) : (node?.innerText || '')).trim();
      return raw.replace(/\n?([A-Za-z][\w+#-]*)\s+Copy\s*\n+```([\w+#-]+)\b/g,
        (whole, label, fenceLang) => label.toLowerCase() === fenceLang.toLowerCase() ? '\n```' + fenceLang : whole);
    },
    getTurnId: turnId,
    isGenerating: () => Boolean(stopControl()),
    isComplete: () => false,
    getConversationKey: () => location.pathname,
    getConversationTitle: () => document.title,
    isNewConversationReady(snapshot) {
      const count = all(SELECTORS.assistant).length;
      const routeClean = !/^\/chat\//.test(location.pathname);
      return Boolean(observe.getInput() && !stopControl() && (count === 0 || count < (snapshot?.beforeCount || 0)) && (routeClean || location.href !== snapshot?.beforeUrl));
    },
    getGeneratedImages: () => [], getGeneratedImageSources: () => [], isGeneratedImagePending: () => false,
  });

  const act = Object.freeze({
    insertText(input, text) {
      if (!input) return false;
      input.focus();
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const inserted = document.execCommand('insertText', false, text);
      if (!inserted || !input.innerText?.trim()) {
        input.innerText = text;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
      return true;
    },
    submit(input = observe.getInput()) {
      const button = sendControl();
      if (button) { button.click(); return true; }
      return globalThis.__auroraRelayV2?.utils?.dispatchEnter(input) || false;
    },
    stopGeneration() { const button = stopControl(); if (!button) return false; button.click(); return true; },
    startNewConversation: () => { location.assign('/'); return true; },
  });

  const adapter = Object.freeze({
    id: 'kimi', version: 1,
    matches: loc => /(^|\.)(kimi\.com|kimi\.moonshot\.cn)$/i.test(loc.hostname),
    // images/files en false: el flujo real requiere abrir el menú "Add" del
    // composer (el <input type=file> no existe en el DOM hasta ese click,
    // se desmonta enseguida) — confirmado en vivo que el input se monta,
    // pero asignarle un DataTransfer + "change" después no produjo ningún
    // preview visible en varios intentos. Mismo desenlace que Perplexity:
    // mejor no anunciar una capacidad que falla en silencio.
    capabilities: Object.freeze({ text: true, images: false, files: false, newChat: true, streaming: true }),
    policies: Object.freeze({ authoritativeStop: true, anchorAfterUser: true, sequentialAttachments: false }),
    observe, act,
  });
  globalThis.__auroraRelayV2?.registerProvider(adapter);
  document.documentElement.dataset[typeof chrome !== 'undefined' && chrome.runtime ? 'auroraRelayProviderIsolated' : 'auroraRelayProviderMain'] = `${adapter.id}@${adapter.version}`;
  document.documentElement.dataset.auroraRelayProvider = JSON.stringify({ id: adapter.id, version: adapter.version, capabilities: adapter.capabilities });
})();
