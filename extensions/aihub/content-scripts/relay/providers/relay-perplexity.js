// Provider driver: Perplexity (perplexity.ai). Todo conocimiento de su DOM
// vive aquí.
(() => {
  'use strict';

  const SELECTORS = Object.freeze({
    assistant: ['[id^="markdown-content-"]'],
    // La burbuja de la pregunta no trae id propio (a diferencia de la
    // respuesta) — su único ancla estable confirmada en vivo es esta clase
    // Tailwind ("group/title"), hermana del bloque de botones Edit/Copy
    // query. Emparejamiento real por posición, ver turnId más abajo.
    user: ['.group\\/title'],
    input: ['#ask-input'],
    send: ['button[aria-label="Submit"]'],
    stop: ['button[aria-label="Stop response (Esc)"]'],
    text: [],
    fileInput: ['input[type="file"]'],
    attachmentPreview: ['[data-testid="file-type-icon"]'],
  });

  const first = (selectors, root = document) => selectors.map(s => root.querySelector(s)).find(Boolean) || null;
  const all = (selectors, root = document) => [...root.querySelectorAll(selectors.join(','))];
  const stopControl = (root = document) => {
    const button = first(SELECTORS.stop, root);
    return button?.isConnected && !button.hidden && button.getAttribute('aria-hidden') !== 'true' ? button : null;
  };
  // Solo la respuesta trae id real (`markdown-content-<índice>`, secuencial
  // y estable — confirmado en vivo: 0, 1, 2 en orden al mandar 3 mensajes
  // seguidos). La pregunta no tiene id propio, así que se le asigna el
  // MISMO id que su respuesta por posición (índice N-ésimo de .group/title
  // ↔ N-ésimo markdown-content) — mismo principio que Gemini (par
  // pregunta+respuesta comparte un solo id), pero acá derivado por orden en
  // vez de por contenedor común.
  const turnId = turn => {
    if (!turn) return '';
    if (turn.id?.startsWith('markdown-content-')) return turn.id;
    const closestAssistant = turn.closest?.('[id^="markdown-content-"]');
    if (closestAssistant) return closestAssistant.id;
    const users = all(SELECTORS.user);
    const userNode = turn.closest?.('.group\\/title') || (users.includes(turn) ? turn : null);
    if (!userNode) return '';
    const idx = users.indexOf(userNode);
    return idx >= 0 ? `markdown-content-${idx}` : '';
  };
  const bestTextNode = turn => turn || null;
  // El badge de lenguaje vive FUERA de <code> (confirmado en vivo:
  // code.contains(indicador) === false), así que domToMarkdown nunca lo
  // captura como texto del fence — no hace falta recortar duplicado, a
  // diferencia de Claude/Grok.
  const perplexityLangLabel = preEl => (preEl.querySelector('[data-testid="code-language-indicator"]')?.innerText || '').trim().toLowerCase();

  const observe = Object.freeze({
    getInput: () => first(SELECTORS.input),
    getSendControl: () => { const b = first(SELECTORS.send); return b && !b.disabled ? b : null; },
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
    readAssistant: turn => {
      const node = bestTextNode(turn);
      const domToMarkdown = globalThis.__auroraRelayV2?.utils?.domToMarkdown;
      return (domToMarkdown ? domToMarkdown(node, { detectLang: perplexityLangLabel }) : (node?.innerText || '')).trim();
    },
    getTurnId: turnId,
    isGenerating: () => Boolean(stopControl()),
    // Sin señal de "completo" propia observada en vivo — igual que
    // ChatGPT/Grok, la ausencia de Stop es la única fuente de verdad real.
    isComplete: () => false,
    getConversationKey: () => location.pathname,
    getConversationTitle: () => document.title,
    isNewConversationReady(snapshot) {
      const count = all(SELECTORS.assistant).length;
      const routeClean = /^\/(search\/new\/[^/]+)?$/.test(location.pathname) || location.pathname === '/';
      return Boolean(observe.getInput() && !stopControl() && (count === 0 || count < (snapshot?.beforeCount || 0)) && (routeClean || location.href !== snapshot?.beforeUrl));
    },
    getGeneratedImages: () => [], getGeneratedImageSources: () => [], isGeneratedImagePending: () => false,
    detectCodeLang: perplexityLangLabel,
  });

  const act = Object.freeze({
    // El composer es un editor Lexical: .focus() + execCommand('insertText')
    // sin una Selection/Range real dentro del nodo a veces no se aplica
    // (confirmado en vivo: quedó vacío varias veces) — construir el Range
    // explícito antes de insertar lo hizo confiable en todas las pruebas.
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
      const button = observe.getSendControl();
      if (button) { button.click(); return true; }
      return globalThis.__auroraRelayV2?.utils?.dispatchEnter(input) || false;
    },
    stopGeneration() { const button = stopControl(); if (!button || button.disabled) return false; button.click(); return true; },
    // Input de archivo real: único <input type="file" multiple accept="..."
    // sin data-testid propio> (confirmado en vivo) — mismo mecanismo que
    // Claude/Grok: DataTransfer + evento "change".
    async attachFiles(payload) {
      const utils = globalThis.__auroraRelayV2?.utils;
      const files = await utils.normalizeAttachments(payload);
      if (!files.length) return true;
      const input = first(SELECTORS.fileInput);
      if (!input) return false;
      const before = all(SELECTORS.attachmentPreview).length;
      const transfer = new DataTransfer();
      files.forEach(file => transfer.items.add(file));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const accepted = await utils.waitFor(() => all(SELECTORS.attachmentPreview).length > before, { timeoutMs: 10000 });
      if (!accepted) return false;
      const uploading = () => all(SELECTORS.attachmentPreview).some(preview =>
        preview.closest('[class*="upload" i]')?.querySelector('[role="progressbar"], [class*="spinner" i], [class*="loading" i], [class*="progress" i]'));
      const ready = await utils.waitFor(() => !uploading(), { timeoutMs: 20000 });
      if (!ready) return false;
      return all(SELECTORS.attachmentPreview).length > before && !uploading();
    },
    startNewConversation: () => { location.assign('/'); return true; },
  });

  const adapter = Object.freeze({
    id: 'perplexity', version: 1,
    matches: loc => /(^|\.)perplexity\.ai$/i.test(loc.hostname),
    // images/files en false: el mecanismo de adjuntos (DataTransfer + change
    // sobre el input oculto, idéntico al que sí es sólido en Claude/Grok)
    // funcionó UNA vez con confirmación completa (preview real, nombre
    // correcto) pero falló en silencio ~6 veces seguidas después, sin error
    // visible — sospecha: función de pago en Perplexity, no bug del relay.
    // act.attachFiles queda implementado por si se reactiva más adelante.
    capabilities: Object.freeze({ text: true, images: false, files: false, newChat: true, streaming: true }),
    policies: Object.freeze({ authoritativeStop: true, anchorAfterUser: true, sequentialAttachments: false }),
    observe, act,
  });
  globalThis.__auroraRelayV2?.registerProvider(adapter);
  document.documentElement.dataset[typeof chrome !== 'undefined' && chrome.runtime ? 'auroraRelayProviderIsolated' : 'auroraRelayProviderMain'] = `${adapter.id}@${adapter.version}`;
  document.documentElement.dataset.auroraRelayProvider = JSON.stringify({ id: adapter.id, version: adapter.version, capabilities: adapter.capabilities });
})();
