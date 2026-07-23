// Provider driver: Claude (claude.ai). Todo conocimiento de su DOM vive
// aquí. Selectores confirmados en vivo (mensaje real enviado y respondido,
// no adivinados) — antes de este driver, Claude caía a relay-generic.js,
// cuyo selector de assistant (`.font-claude-message`) no existe: la clase
// real es `.font-claude-response` (le erraba por una palabra).
(() => {
  'use strict';

  const SELECTORS = Object.freeze({
    assistant: ['.font-claude-response'],
    user: ['[data-testid="user-message"]'],
    input: ['div[contenteditable="true"]'],
    stop: ['button[aria-label="Stop response"]'],
    text: ['.font-claude-response'],
    fileInput: ['input[type="file"][data-testid="file-upload"]'],
    attachmentPreview: ['[data-testid="file-thumbnail"]'],
  });

  const first = (selectors, root = document) => selectors.map(s => root.querySelector(s)).find(Boolean) || null;
  const all = (selectors, root = document) => [...root.querySelectorAll(selectors.join(','))];
  const stopControl = (root = document) => {
    const button = first(SELECTORS.stop, root);
    return button?.isConnected && !button.hidden && button.getAttribute('aria-hidden') !== 'true' ? button : null;
  };
  // Los turnos no traen un id de contenido propio (a diferencia del
  // `data-message-id` de ChatGPT) — pero el wrapper virtualizado de la lista
  // de mensajes sí trae `data-index`, un índice posicional real, único y
  // secuencial (confirmado en vivo: turno de usuario en 0, respuesta en 1).
  // Estable mientras la conversación no cambie de orden, que no pasa acá.
  const turnId = turn => turn?.closest?.('[data-index]')?.getAttribute('data-index') || '';
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
    getSendControl: () => null, // sin botón de enviar identificado de forma confiable — ver act.submit
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
    // Cada bloque de código de Claude trae un label visible del lenguaje
    // ARRIBA del <pre> (ej. "python", clase "text-text-500 font-small") —
    // confirmado en vivo: ese texto es un nodo hermano suelto, domToMarkdown
    // lo captura igual que prosa real y queda duplicado justo antes del
    // fence (que ya trae el lenguaje vía class="language-python" estándar,
    // sin necesitar detectLang como ChatGPT). Se recorta la línea suelta
    // solo cuando coincide exacto con el lenguaje del fence que le sigue.
    readAssistant: turn => {
      const node = bestTextNode(turn);
      const domToMarkdown = globalThis.__auroraRelayV2?.utils?.domToMarkdown;
      const raw = (domToMarkdown ? domToMarkdown(node) : (node?.innerText || '')).trim();
      return raw.replace(/^([\w+#-]+)\n+```\1\b/, '```$1');
    },
    getTurnId: turnId,
    isGenerating: () => Boolean(stopControl()),
    // El wrapper del turno de assistant trae `data-is-streaming` real
    // (confirmado en vivo: "false" apenas termina la respuesta) — más
    // directo que inferir por ausencia de Stop.
    isComplete: turn => {
      const wrap = turn?.closest?.('[data-is-streaming]');
      return wrap ? wrap.getAttribute('data-is-streaming') === 'false' : false;
    },
    getConversationKey: () => location.pathname,
    getConversationTitle: () => document.title,
    isNewConversationReady(snapshot) {
      const count = all(SELECTORS.assistant).length;
      const routeClean = /^\/new\/?$/.test(location.pathname);
      return Boolean(observe.getInput() && !stopControl() && (count === 0 || count < (snapshot?.beforeCount || 0)) && (routeClean || location.href !== snapshot?.beforeUrl));
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
    // Sin botón de enviar identificado de forma confiable en el composer
    // (queda oculto detrás de "Use voice mode" hasta que el framework
    // reconoce texto real, y el que aparece no tiene aria-label ni
    // data-testid propio) — Enter confirmado en vivo como el camino real:
    // mandó el mensaje y navegó a la conversación nueva.
    submit(input = observe.getInput()) {
      return globalThis.__auroraRelayV2?.utils?.dispatchEnter(input) || false;
    },
    stopGeneration() { const button = stopControl(); if (!button || button.disabled) return false; button.click(); return true; },
    // No hay drop-zone ni composer que acepte paste de archivos (utils.pasteFiles
    // sobre el contenteditable no dejó rastro alguno) — el input real es el
    // <input type="file" data-testid="file-upload"> oculto que React vigila vía
    // evento "change". Confirmado en vivo: asignar un DataTransfer a .files y
    // disparar "change" hizo aparecer un [data-testid="file-thumbnail"] real con
    // nombre/tamaño/tipo correctos. React limpia el input después (files.length
    // vuelve a 0), así que ese campo no sirve para verificar aceptación — el
    // preview sí.
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
        preview.querySelector?.('[role="progressbar"], [class*="spinner" i], [class*="loading" i], [class*="progress" i]'));
      const ready = await utils.waitFor(() => !uploading(), { timeoutMs: 20000 });
      if (!ready) return false;
      return all(SELECTORS.attachmentPreview).length > before && !uploading();
    },
    startNewConversation: () => { location.assign('/new'); return true; },
  });

  const adapter = Object.freeze({
    id: 'claude', version: 1,
    matches: loc => /(^|\.)claude\.ai$/i.test(loc.hostname),
    capabilities: Object.freeze({ text: true, images: true, files: true, newChat: true, streaming: true }),
    policies: Object.freeze({ authoritativeStop: false, anchorAfterUser: true, sequentialAttachments: false }),
    observe, act,
  });
  globalThis.__auroraRelayV2?.registerProvider(adapter);
  document.documentElement.dataset[typeof chrome !== 'undefined' && chrome.runtime ? 'auroraRelayProviderIsolated' : 'auroraRelayProviderMain'] = `${adapter.id}@${adapter.version}`;
  document.documentElement.dataset.auroraRelayProvider = JSON.stringify({ id: adapter.id, version: adapter.version, capabilities: adapter.capabilities });
})();
