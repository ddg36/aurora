// Provider driver: Gemini. Todo conocimiento de su DOM vive aquí.
(() => {
  'use strict';

  const SELECTORS = Object.freeze({
    assistant: ['model-response'], user: ['user-query'],
    input: ['div[contenteditable="true"].ql-editor', 'div[contenteditable="true"][aria-label]', 'div[contenteditable="true"][role="textbox"]', 'rich-textarea div[contenteditable="true"]', 'textarea[placeholder]'],
    send: ['button[aria-label*="Enviar" i]', 'button[aria-label*="Send" i]', 'button[mattooltip*="Enviar" i]'],
    stop: ['button[aria-label*="Detener" i]', 'button[aria-label*="Stop" i]', 'button[aria-label*="Parar" i]'],
    text: ['.markdown', '.pending'], complete: ['.response-footer.complete', 'footer.complete', '[class*="footer"].complete'],
    attachmentPreview: ['.file-preview-container', '[data-testid*="preview" i]', '[class*="attachment" i]', 'button[aria-label^="Quitar archivo" i]'],
  });
  const first = (selectors, root = document) => selectors.map(s => root.querySelector(s)).find(Boolean) || null;
  const all = (selectors, root = document) => [...root.querySelectorAll(selectors.join(','))];
  const bestTextNode = turn => {
    let best = turn || null, length = -1;
    for (const node of turn?.querySelectorAll?.(SELECTORS.text.join(',')) || []) {
      const current = (node.innerText || '').length;
      if (current > length) { best = node; length = current; }
    }
    return best;
  };
  const stopControl = (root = document) => {
    const button = first(SELECTORS.stop, root);
    return button?.isConnected && !button.hidden && button.getAttribute('aria-hidden') !== 'true' ? button : null;
  };
  // `model-response`/`user-query` no traen ID propio: sus únicos atributos son
  // marcadores internos de Angular (_ngcontent-*, _nghost-*) compartidos por
  // TODOS los turnos de la misma plantilla, no por instancia — confirmado en
  // vivo, idéntico en 10 turnos reales de una conversación. El contenedor
  // padre (`.conversation-container`) sí trae un `id` real y único por
  // intercambio (confirmado en vivo: 10 turnos, 10 ids distintos, sin
  // repetir) — usuario y su respuesta comparten el mismo id, porque el par
  // completo vive en un solo contenedor, no cada mensaje por separado.
  const turnId = turn => turn?.closest?.('.conversation-container')?.id || '';
  const observe = Object.freeze({
    getInput: () => first(SELECTORS.input),
    getSendControl: ({ visible = false } = {}) => SELECTORS.send.map(s => document.querySelector(s)).find(b => b && !b.disabled && (!visible || b.offsetParent !== null)) || null,
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
    // Markdown fiel del DOM, no innerText plano — ver relay-chatgpt.js.
    readAssistant: turn => {
      const node = bestTextNode(turn);
      const domToMarkdown = globalThis.__auroraRelayV2?.utils?.domToMarkdown;
      return (domToMarkdown ? domToMarkdown(node) : (node?.innerText || '')).trim();
    },
    getTurnId: turnId,
    isGenerating: () => Boolean(stopControl()),
    isComplete: turn => Boolean(turn && first(SELECTORS.complete, turn)),
    getConversationKey: () => location.pathname,
    getConversationTitle: () => document.title,
    isNewConversationReady(snapshot) {
      const count = all(SELECTORS.assistant).length;
      const routeClean = /^\/app\/?$/.test(location.pathname);
      return Boolean(observe.getInput() && (count === 0 || count < (snapshot?.beforeCount || 0)) && (routeClean || location.href !== snapshot?.beforeUrl));
    },
    getGeneratedImages: () => [], getGeneratedImageSources: () => [], isGeneratedImagePending: () => false,
  });
  const act = Object.freeze({
    insertText(input, text) {
      if (!input) return false;
      input.focus(); document.execCommand('selectAll', false, null);
      const inserted = document.execCommand('insertText', false, text);
      if (!inserted || !input.innerText?.trim()) {
        input.innerText = text;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
      return true;
    },
    submit(input = observe.getInput()) {
      const button = observe.getSendControl();
      if (button) { button.click(); return true; }
      return globalThis.__auroraRelayV2?.utils?.dispatchEnter(input) || false;
    },
    stopGeneration() { const button = stopControl(); if (!button || button.disabled) return false; button.click(); return true; },
    async attachFiles(payload) {
      const utils = globalThis.__auroraRelayV2?.utils;
      const files = await utils.normalizeAttachments(payload);
      if (!files.length) return true;
      const before = all(SELECTORS.attachmentPreview).length;
      utils.pasteFiles(observe.getInput(), files);
      const accepted = await utils.waitFor(() => all(SELECTORS.attachmentPreview).length > before, { timeoutMs: 10000 });
      if (!accepted) return false;
      const uploading = () => all(SELECTORS.attachmentPreview).some(preview =>
        preview.querySelector?.('[role="progressbar"], mat-progress-spinner, .mat-mdc-progress-spinner, mat-progress-bar, [class*="uploading" i], [class*="spinner" i]'));
      const ready = await utils.waitFor(() => !uploading(), { timeoutMs: 20000 });
      if (!ready) return false;
      // El preview aparece antes de que el proveedor asocie el archivo al turno.
      await utils.sleep(1200);
      return all(SELECTORS.attachmentPreview).length > before && !uploading();
    },
    startNewConversation: () => { location.assign('/app'); return true; },
  });
  const adapter = Object.freeze({
    id: 'gemini', version: 2,
    matches: loc => /(^|\.)gemini\.google\.com$/i.test(loc.hostname),
    capabilities: Object.freeze({ text: true, images: true, files: true, newChat: true, streaming: true }),
    policies: Object.freeze({ authoritativeStop: false, anchorAfterUser: true, sequentialAttachments: false, attachmentSettleMs: { image: 800, file: 800 } }),
    observe, act,
  });
  globalThis.__auroraRelayV2?.registerProvider(adapter);
  document.documentElement.dataset[typeof chrome !== 'undefined' && chrome.runtime ? 'auroraRelayProviderIsolated' : 'auroraRelayProviderMain'] = `${adapter.id}@${adapter.version}`;
  document.documentElement.dataset.auroraRelayProvider = JSON.stringify({ id: adapter.id, version: adapter.version, capabilities: adapter.capabilities });
})();
