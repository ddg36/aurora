// Provider driver: Poe (poe.com). Todo conocimiento de su DOM vive acá.
(() => {
  'use strict';

  const SELECTORS = Object.freeze({
    assistant: ['[class*="leftSideMessageBubble"]'],
    user: ['[class*="rightSideMessageWrapper"]'],
    input: ['textarea'],
    send: ['button[aria-label="Send message"]'],
    stop: ['button[aria-label="Stop message"]'],
    text: ['[class*="messageTextContainer"]'],
    fileInput: ['input[type="file"]'],
    attachmentPreview: ['[class*="FileInfo_fileInfo"]'],
    dismissAttachment: ['[class*="Dismissable_dismissButton"]'],
  });

  const first = (selectors, root = document) => selectors.map(s => root.querySelector(s)).find(Boolean) || null;
  const all = (selectors, root = document) => [...root.querySelectorAll(selectors.join(','))];
  const stopControl = (root = document) => {
    const button = first(SELECTORS.stop, root);
    return button?.isConnected && !button.hidden ? button : null;
  };
  // `.ChatMessage_chatMessage__*` (ancestro directo de cada burbuja) trae un
  // `id="message-<número>"` real, único por turno — usuario y respuesta
  // tienen ids DISTINTOS (confirmado en vivo, no compartido como Gemini).
  // Ese mismo elemento trae `data-complete="true"/"false"` — señal directa
  // de "terminó de generar" más confiable que inferir por ausencia de Stop
  // (que igual usamos como respaldo en isGenerating).
  const messageEl = turn => turn?.closest?.('[id^="message-"]') || null;
  const turnId = turn => messageEl(turn)?.id || '';
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
    // Poe marca el lenguaje con la clase estándar `language-*` en <code>
    // (confirmado en vivo: "language-python") — domToMarkdown lo detecta
    // solo. Pero el nombre del lenguaje visible en el header
    // (`.MarkdownCodeBlock_languageName__*`) vive FUERA del <pre> (hermano
    // de su wrapper `.MarkdownCodeBlock_collapsible__*`, ambos dentro de
    // `.MarkdownCodeBlock_codeBlock__*`) — domToMarkdown lo recorre como
    // prosa antes de llegar al fence, confirmado en vivo: "python" quedaba
    // duplicado justo antes de la respuesta correcta (mismo patrón que
    // Claude/Grok/Kimi). Regex genérica en vez de depender del hash CSS
    // exacto (cambia entre builds de Poe).
    readAssistant: turn => {
      const node = bestTextNode(turn);
      const domToMarkdown = globalThis.__auroraRelayV2?.utils?.domToMarkdown;
      const raw = (domToMarkdown ? domToMarkdown(node) : (node?.innerText || '')).trim();
      return raw.replace(/\n?([A-Za-z][\w+#-]*)\n+```([\w+#-]+)\b/g,
        (whole, label, fenceLang) => label.toLowerCase() === fenceLang.toLowerCase() ? '\n```' + fenceLang : whole);
    },
    getTurnId: turnId,
    isGenerating: () => Boolean(stopControl()),
    isComplete: turn => messageEl(turn)?.getAttribute('data-complete') === 'true',
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
    // <textarea> real controlado (React) — asignar `.value` directo no le
    // avisa al framework, el botón Send queda `disabled` para siempre.
    // Confirmado en vivo: el setter nativo + InputEvent con `data` real SÍ
    // funciona, pero solo si el valor previo se limpia primero con su
    // propio ciclo vaciar→InputEvent antes de escribir el texto nuevo — sin
    // ese paso, el botón seguía disabled incluso con el valor ya visible.
    insertText(input, text) {
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(input, '');
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteContentBackward' }));
        setter.call(input, text);
      } else input.value = text;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      return true;
    },
    submit(input = observe.getInput()) {
      const button = observe.getSendControl();
      if (button) { button.click(); return true; }
      return globalThis.__auroraRelayV2?.utils?.dispatchEnter(input) || false;
    },
    stopGeneration() { const button = stopControl(); if (!button || button.disabled) return false; button.click(); return true; },
    // Input de archivo real: único <input type=file multiple> ya presente
    // en el DOM sin necesitar abrir ningún menú (a diferencia de Kimi) —
    // confirmado en vivo, DataTransfer + "change" funcionó al primer
    // intento con preview real (nombre correcto, botón de quitar).
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
    startNewConversation: () => { location.assign('/'); return true; },
  });

  const adapter = Object.freeze({
    id: 'poe', version: 1,
    matches: loc => /(^|\.)poe\.com$/i.test(loc.hostname),
    capabilities: Object.freeze({ text: true, images: true, files: true, newChat: true, streaming: true }),
    policies: Object.freeze({ authoritativeStop: true, anchorAfterUser: true, sequentialAttachments: false }),
    observe, act,
  });
  globalThis.__auroraRelayV2?.registerProvider(adapter);
  document.documentElement.dataset[typeof chrome !== 'undefined' && chrome.runtime ? 'auroraRelayProviderIsolated' : 'auroraRelayProviderMain'] = `${adapter.id}@${adapter.version}`;
  document.documentElement.dataset.auroraRelayProvider = JSON.stringify({ id: adapter.id, version: adapter.version, capabilities: adapter.capabilities });
})();
